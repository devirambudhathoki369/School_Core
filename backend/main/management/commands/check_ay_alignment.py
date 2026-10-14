"""
Read-only academic-year alignment inspector. Touches NO data.

Use it to SEE which academic-year period each class-group is mapped to, and to
dry-run the promotion guardrail for a specific source -> target class pair before
you actually promote or close. It calls the very same helpers the guardrail uses
(`get_class_academic_year` / `academic_years_aligned`), so what it prints is
exactly what the promote endpoint will decide.

The guardrail compares academic-year PERIODS by date-range overlap (not raw id),
because distinct AcademicYear records (e.g. a school vs a bachelor calendar) can
cover the same window. Overlapping periods are aligned (promote allowed); disjoint
periods mean the target is rolled to a different year (promote blocked).

Usage:
    # List every class-group key -> mapped academic year for a school
    python manage.py check_ay_alignment --school 1

    # Dry-run the guardrail for a specific promote (source -> target class ids)
    python manage.py check_ay_alignment --from 12 --to 18
"""

from django.core.management.base import BaseCommand

from main.models.ClassInfo import ClassInfo, CLASS_DETAILS_FIELDS
from main.models.FiscalYears import AcademicYearMapping
from main.methods.academicYear import (
    gen_class_key,
    get_class_academic_year,
    academic_years_aligned,
)


def _period(ay: dict) -> str:
    if not ay:
        return "<no mapping>"
    start = ay.get("start_date") or "?"
    end = ay.get("end_date") or "?"
    return f"AY#{ay.get('id')} [{start} .. {end}]"


class Command(BaseCommand):
    help = "Inspect academic-year mappings and dry-run the promotion guardrail."

    def add_arguments(self, parser):
        parser.add_argument(
            "--school", type=int, default=None,
            help="School id: list every class-group key -> mapped academic year.",
        )
        parser.add_argument(
            "--from", dest="from_class", type=int, default=None,
            help="Source class id for a guardrail dry-run.",
        )
        parser.add_argument(
            "--to", dest="to_class", type=int, default=None,
            help="Target class id for a guardrail dry-run.",
        )

    def handle(self, *args, **options):
        from_class = options.get("from_class")
        to_class = options.get("to_class")
        school = options.get("school")

        if from_class and to_class:
            self._dry_run_pair(from_class, to_class)
        elif school:
            self._list_school(school)
        else:
            self.stderr.write(
                self.style.ERROR(
                    "Pass --school <id> to list mappings, or --from <id> --to <id> "
                    "to dry-run the promotion guardrail."
                )
            )

    def _list_school(self, school_id: int):
        rows = (
            AcademicYearMapping.objects.filter(school=school_id)
            .values(
                "key",
                "academic_year",
                "academic_year__name",
                "academic_year__start_date",
                "academic_year__end_date",
            )
            .order_by("key", "-id")
        )
        if not rows:
            self.stdout.write(f"No academic-year mappings for school {school_id}.")
            return
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"Academic-year mappings for school {school_id} (latest per key wins):"
        ))
        seen = set()
        for r in rows:
            key = r["key"]
            marker = "  " if key in seen else "* "
            seen.add(key)
            self.stdout.write(
                f"  {marker}{key:<14} -> AY#{r['academic_year']} "
                f"{r['academic_year__name'] or ''} "
                f"[{r['academic_year__start_date']} .. {r['academic_year__end_date']}]"
            )
        self.stdout.write(
            "\n(* = the row the guardrail actually uses; others are older history.)"
        )

    def _resolve(self, class_id: int):
        cls = (
            ClassInfo.objects.filter(id=class_id)
            .values("id", "school", "batch", *CLASS_DETAILS_FIELDS)
            .first()
        )
        if not cls:
            return None, None, None
        key = gen_class_key(cls)
        ay = get_class_academic_year(cls["school"], cls)
        return cls, key, ay

    def _dry_run_pair(self, from_class: int, to_class: int):
        src, src_key, src_ay = self._resolve(from_class)
        dst, dst_key, dst_ay = self._resolve(to_class)
        if not src:
            self.stderr.write(self.style.ERROR(f"Source class {from_class} not found."))
            return
        if not dst:
            self.stderr.write(self.style.ERROR(f"Target class {to_class} not found."))
            return

        self.stdout.write(self.style.MIGRATE_HEADING("Promotion guardrail dry-run"))
        self.stdout.write(f"  FROM class {from_class}  key={src_key}  {_period(src_ay)}")
        self.stdout.write(f"  TO   class {to_class}  key={dst_key}  {_period(dst_ay)}")

        aligned = academic_years_aligned(src_ay, dst_ay)
        if aligned:
            self.stdout.write(self.style.SUCCESS(
                "  RESULT: ALIGNED -> promotion ALLOWED (periods overlap or unknown)."
            ))
        else:
            self.stdout.write(self.style.ERROR(
                "  RESULT: MISALIGNED -> promotion BLOCKED (periods are disjoint). "
                "Roll the target class to the new academic year first."
            ))
