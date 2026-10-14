"""
Strip leading zeros from stored RFID card numbers.

Thin CLI wrapper around rfid.services.CardZeros (shared with the admin-panel
"Remove leading zeros" button). See that module for the normalization rules.

Usage:
    python manage.py strip_card_zeros --dry-run            # preview everything
    python manage.py strip_card_zeros                      # apply to all schools
    python manage.py strip_card_zeros --school 3 --dry-run # preview one school
"""

from django.core.management.base import BaseCommand

from rfid.services.CardZeros import collect_card_changes, apply_card_changes


class Command(BaseCommand):
    help = "Remove leading zeros from RFID card numbers (profiles + device users)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--school",
            type=int,
            default=None,
            help="Limit to one school id (default: all schools).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would change without writing anything.",
        )

    def handle(self, *args, **options):
        school_id = options.get("school")
        dry = options.get("dry_run")

        changes = collect_card_changes(school_id)
        student_changes = changes["students"]
        staff_changes = changes["staffs"]
        attd_changes = changes["attd_users"]

        total = len(student_changes) + len(staff_changes) + len(attd_changes)
        if total == 0:
            self.stdout.write(self.style.WARNING("Nothing to strip — all clean."))
            return

        # Preview a few from each so the change is easy to eyeball.
        for label, items in (
            ("Student", student_changes),
            ("Staff", staff_changes),
            ("RFIDAttdUser", attd_changes),
        ):
            if not items:
                continue
            self.stdout.write(f"\n{label}: {len(items)} to update")
            for _obj, old, new in items[:5]:
                self.stdout.write(f"  {old} -> {new}")
            if len(items) > 5:
                self.stdout.write(f"  ... and {len(items) - 5} more")

        if dry:
            self.stdout.write(
                self.style.WARNING(f"\n[dry-run] {total} value(s) would change.")
            )
            return

        apply_card_changes(changes)

        self.stdout.write(
            self.style.SUCCESS(
                f"\nDone. Stripped {len(student_changes)} student, "
                f"{len(staff_changes)} staff, {len(attd_changes)} device-user card(s)."
            )
        )
