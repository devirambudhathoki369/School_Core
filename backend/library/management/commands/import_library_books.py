"""One-off import of a library's catalogue from a cleaned CSV.

The accession number a librarian writes inside a physical book IS `BookCopy.id`
here — a single global auto-increment key, not a per-school counter. So an
import that wants to keep the numbers already written in the books has to insert
copies at explicit primary keys, move anything already sitting on those numbers
out of the way, and put the sequence back afterwards. That is all this does.

CSV columns: accession_no, entry_date, title, author, publisher, isbn, edition
(`entry_date` is a Bikram Sambat date string — NepaliDateField stores text, so
days like 2081-04-32 are valid and must NOT be parsed as Gregorian.)

Dry-run unless --apply is passed.
"""

import csv
from collections import OrderedDict, defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction

from main.models.SchoolAdmin import SchoolAdmin
from library.models.Library import Library
from library.models.Book import Book, BookCopy, BookIssue


class Command(BaseCommand):
    help = (
        "Import a library catalogue from a cleaned CSV, preserving each row's "
        "accession number as the BookCopy primary key. Dry-run unless --apply."
    )

    def add_arguments(self, parser):
        parser.add_argument("csv_path")
        parser.add_argument("--school", type=int, required=True)
        parser.add_argument("--library", type=int, required=True)
        parser.add_argument(
            "--apply", action="store_true",
            help="Actually write. Without it, only reports what would change.")

    # rows -> {book identity: [rows]}, preserving first-seen order so the
    # created Book ids follow the catalogue's own order.
    def _group(self, rows):
        books = OrderedDict()
        for r in rows:
            key = (r["title"], r["author"], r["publisher"], r["isbn"], r["edition"])
            books.setdefault(key, []).append(r)
        return books

    def handle(self, *args, **opts):
        path = opts["csv_path"]
        school_id, library_id = opts["school"], opts["library"]
        apply = opts["apply"]

        school = SchoolAdmin.objects.filter(id=school_id).first()
        if not school:
            raise CommandError(f"school {school_id} not found")
        library = Library.objects.filter(id=library_id, school_id=school_id).first()
        if not library:
            raise CommandError(f"library {library_id} not found for school {school_id}")

        with open(path, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        for r in rows:
            r["accession_no"] = int(r["accession_no"])
        if not rows:
            raise CommandError("csv has no rows")

        wanted = {r["accession_no"] for r in rows}
        if len(wanted) != len(rows):
            raise CommandError("csv contains duplicate accession numbers")
        top = max(wanted)

        # Anything already parked on a number this catalogue needs has to move.
        # Safe only because a moved copy keeps its identity; a copy that is on
        # loan would have its accession number change under an open issue.
        clashing = list(BookCopy.objects.filter(id__in=wanted).values_list("id", flat=True))
        open_issues = BookIssue.objects.filter(
            book_id__in=clashing, returned_date__isnull=True, is_active=True).count()
        shift = (top + 1) - min(clashing) if clashing else 0
        landing = [c + shift for c in clashing]
        blocked = set(landing) & (set(
            BookCopy.objects.exclude(id__in=clashing).values_list("id", flat=True)) | wanted)

        books = self._group(rows)

        self.stdout.write(f"school   : {school_id} {school.name}")
        self.stdout.write(f"library  : {library_id}")
        self.stdout.write(f"csv rows : {len(rows)}  -> {len(books)} books / {len(rows)} copies")
        self.stdout.write(f"accession: {min(wanted)} - {top}")
        self.stdout.write(f"existing copies needing to move: {len(clashing)}"
                          + (f"  ({min(clashing)}-{max(clashing)} -> {min(landing)}-{max(landing)})"
                             if clashing else ""))
        self.stdout.write(f"open issues on those copies    : {open_issues}")

        if open_issues:
            raise CommandError(
                "copies that must be renumbered are currently issued — "
                "return them first, or their accession numbers change mid-loan")
        if blocked:
            raise CommandError(f"no room to move existing copies: {sorted(blocked)[:10]}")
        already = BookCopy.objects.filter(id__in=wanted, book__school_id=school_id).count()
        if already and not clashing:
            raise CommandError("looks like this catalogue was already imported")

        if not apply:
            self.stdout.write(self.style.WARNING("\nDRY RUN — nothing written. Re-run with --apply."))
            return

        with transaction.atomic():
            if clashing:
                # Single statement: the landing range is verified free above, so
                # there is no moment where two copies share an id.
                with connection.cursor() as cur:
                    cur.execute(
                        "UPDATE library_bookcopy SET id = id + %s WHERE id = ANY(%s)",
                        [shift, clashing])
                self.stdout.write(f"moved {len(clashing)} existing copies by +{shift}")

            created_books = 0
            copies = []
            for (title, author, publisher, isbn, edition), group in books.items():
                book = Book.objects.create(
                    school_id=school_id,
                    library_id=library_id,
                    # the catalogue's own earliest entry for this title
                    entry_date=min(r["entry_date"] for r in group),
                    title=title,
                    personal_author=author,
                    place_and_publisher=publisher,
                    isbn_no=isbn or None,
                    edition=edition,
                    quantity=len(group),
                    # not present in the source catalogue — left blank rather
                    # than invented, for the librarian to fill in later.
                    published_year="",
                    broad_subject="",
                    keywords="",
                    price=0,
                )
                created_books += 1
                for r in group:
                    copies.append(BookCopy(
                        id=r["accession_no"], book=book, entry_date=r["entry_date"]))
            BookCopy.objects.bulk_create(copies, batch_size=1000)

            # Explicit ids leave the sequence behind; without this the next book
            # entered through the UI would collide with an imported copy.
            with connection.cursor() as cur:
                cur.execute(
                    "SELECT setval('library_bookcopy_id_seq', "
                    "(SELECT COALESCE(MAX(id), 1) FROM library_bookcopy))")

        self.stdout.write(self.style.SUCCESS(
            f"imported {created_books} books / {len(copies)} copies for school {school_id}"))
