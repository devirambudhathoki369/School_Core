"""Collapse duplicate marks headers and duplicate student marks rows.

See `main/methods/resultDedupe.py` for what counts as a duplicate and which row
survives. Nothing is erased — losers are flipped to `is_active=False`.

Dry run by default:

    manage.py dedupe_results                  # count what is there, school by school
    manage.py dedupe_results --school 27      # one school
    manage.py dedupe_results --apply          # write (everything)
    manage.py dedupe_results --school 27 --apply

Run this BEFORE the migration that adds the unique indexes; the indexes cannot
be built while duplicates are still active.
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from main.methods.resultDedupe import (
    dedupe_student_rows,
    duplicate_header_groups,
    duplicate_row_count,
    merge_header_group,
)
from main.models.SchoolAdmin import SchoolAdmin


class Command(BaseCommand):
    help = "Deactivate duplicate ClassResult headers and duplicate StudentResult rows."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, help="Limit to one school")
        parser.add_argument("--apply", action="store_true", help="Write the changes")

    def handle(self, *args, **options):
        school_id = options["school"]
        apply_changes = options["apply"]

        dup_rows = duplicate_row_count(school_id)
        groups = duplicate_header_groups(school_id)
        losers = sum(len(l) for _, l in groups)

        scope = "all schools"
        if school_id:
            school = SchoolAdmin.objects.filter(id=school_id).first()
            scope = f"school {school_id} ({school.name if school else '?'})"
        self.stdout.write(f"scope: {scope}")
        self.stdout.write(
            f"  student marks rows duplicated for one student: {dup_rows} (student, header) pair(s)"
        )
        self.stdout.write(
            f"  subjects with more than one active marks header : {len(groups)} "
            f"group(s), {losers} header(s) to fold in"
        )

        if not dup_rows and not groups:
            self.stdout.write(self.style.SUCCESS("nothing to do."))
            return

        if not apply_changes:
            self.stdout.write(
                self.style.WARNING("\nDRY RUN — re-run with --apply to write.")
            )
            return

        with transaction.atomic():
            # rows first: merging headers below assumes one row per student.
            deactivated = dedupe_student_rows(school_id)
            moved = dropped = 0
            for keeper, loser_ids in groups:
                group_moved, group_dropped = merge_header_group(keeper, loser_ids)
                moved += group_moved
                dropped += group_dropped
        self.stdout.write(
            self.style.SUCCESS(
                f"\napplied: {deactivated} duplicate marks row(s) deactivated, "
                f"{moved} row(s) moved onto the surviving header, "
                f"{dropped} row(s) retired with {losers} folded header(s)."
            )
        )
