from django.core.management.base import BaseCommand
from django.db import transaction

from library.models.Book import Book, BookCopy, BookIssue


class Command(BaseCommand):
    help = (
        "Remove ALL library books across every school. By default this is a SOFT "
        "delete (is_active=False on Book + cascaded BookCopy/BookIssue): the books "
        "vanish from the whole app — every library view filters is_active=True — "
        "but the rows stay in the DB and can be brought back with --restore. Use "
        "--hard for a permanent, UNRECOVERABLE delete. --dry-run previews, --yes "
        "skips the confirmation prompt. Schools and Library rows are always kept; "
        "already-posted ledger fines are never touched."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--school",
            type=int,
            help="Limit to one school (default: every school).",
        )
        parser.add_argument(
            "--hard",
            action="store_true",
            help="Permanently DELETE rows (cannot be undone). Default is soft delete.",
        )
        parser.add_argument(
            "--restore",
            action="store_true",
            help="Undo a soft delete: set is_active=True on all books/copies/issues.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change; change nothing.",
        )
        parser.add_argument(
            "--yes",
            action="store_true",
            help="Skip the interactive confirmation.",
        )

    # BookCopy has no school FK — it reaches a school only through its Book.
    def _scoped(self, opts):
        school = opts.get("school")
        books = Book.objects.all()
        copies = BookCopy.objects.all()
        issues = BookIssue.objects.all()
        if school:
            books = books.filter(school_id=school)
            copies = copies.filter(book__school_id=school)
            issues = issues.filter(school_id=school)
        return books, copies, issues

    def handle(self, *args, **opts):
        w = self.stdout.write

        if opts["restore"]:
            return self._restore(opts)

        books_qs, copies_qs, issues_qs = self._scoped(opts)
        if opts.get("school"):
            w(f"Scope: school {opts['school']} only")
        active = {
            "books": books_qs.filter(is_active=True).count(),
            "copies": copies_qs.filter(is_active=True).count(),
            "issues": issues_qs.filter(is_active=True).count(),
        }
        w(f"Active books:  {active['books']}")
        w(f"Active copies: {active['copies']}")
        w(f"Active issues: {active['issues']}")

        if not any(active.values()):
            w("Nothing to remove.")
            return

        mode = "PERMANENTLY DELETE" if opts["hard"] else "soft-delete (reversible)"
        if opts["dry_run"]:
            w(self.style.WARNING(f"(dry-run) Would {mode} the above. Nothing changed."))
            return

        if not opts["yes"]:
            extra = "" if opts["hard"] else " (undo later with --restore)"
            where = (
                f"for school {opts['school']}"
                if opts.get("school")
                else "across ALL schools"
            )
            confirm = input(
                f"{mode} ALL of the above {where}{extra}? Type 'yes' to continue: "
            )
            if confirm.strip().lower() != "yes":
                w("Aborted.")
                return

        with transaction.atomic():
            if opts["hard"]:
                issues = issues_qs.delete()[0]
                copies = copies_qs.delete()[0]
                books = books_qs.delete()[0]
                w(
                    self.style.SUCCESS(
                        f"Permanently deleted {books} books, {copies} copies, "
                        f"{issues} issues."
                    )
                )
            else:
                books = books_qs.filter(is_active=True).update(is_active=False)
                copies = copies_qs.filter(is_active=True).update(is_active=False)
                issues = issues_qs.filter(is_active=True).update(is_active=False)
                w(
                    self.style.SUCCESS(
                        f"Soft-deleted {books} books, {copies} copies, {issues} "
                        "issues. Reverse anytime with --restore."
                    )
                )

    def _restore(self, opts):
        w = self.stdout.write
        books_qs, copies_qs, issues_qs = self._scoped(opts)
        inactive = {
            "books": books_qs.filter(is_active=False).count(),
            "copies": copies_qs.filter(is_active=False).count(),
            "issues": issues_qs.filter(is_active=False).count(),
        }
        w(f"Inactive books:  {inactive['books']}")
        w(f"Inactive copies: {inactive['copies']}")
        w(f"Inactive issues: {inactive['issues']}")
        if not any(inactive.values()):
            w("Nothing to restore.")
            return
        if opts["dry_run"]:
            w(self.style.WARNING("(dry-run) Would reactivate the above. Nothing changed."))
            return
        with transaction.atomic():
            books = books_qs.filter(is_active=False).update(is_active=True)
            copies = copies_qs.filter(is_active=False).update(is_active=True)
            issues = issues_qs.filter(is_active=False).update(is_active=True)
        w(self.style.SUCCESS(f"Restored {books} books, {copies} copies, {issues} issues."))
