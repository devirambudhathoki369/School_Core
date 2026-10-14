"""
Read-only batch/cohort blast-radius analyzer for higher-education programs.
Touches NO data.

Background
----------
Higher-ed classes (bachelor / master / diploma / pre-diploma, i.e.
education_level in 4, 5, 8, 9) are identified today by *course + year/semester*
only -- there is no batch/cohort dimension. A semester "slot" (e.g. BCA sem-1)
is therefore reused by every intake that passes through it, so two admission
batches can end up collapsed onto the SAME ClassInfo row and mapping key. That
row's academic-year pointer, fees and exam history cannot then tell the batches
apart.

A student's `academic_year` is the ADMISSION-year stamp -- promotion and closing
never change it -- so it is a faithful proxy for "which batch is this student".
This command groups the CURRENTLY-enrolled students of each higher-ed class by
that admission year: any class holding more than one distinct admission year is a
slot with collapsed batches, i.e. exactly what a real Batch dimension would split
apart.

It changes nothing -- it only reports the size of the problem so the batch
migration can be planned with real numbers.

Usage:
    # Whole system
    python manage.py analyze_batches

    # One school
    python manage.py analyze_batches --school 1

    # Also list every affected class and its per-batch breakdown
    python manage.py analyze_batches --verbose
"""

from django.core.management.base import BaseCommand
from django.db.models import Count

from main.models.ClassInfo import ClassInfo
from main.models.Student import Student
from main.methods.academicYear import gen_class_key
from main.choices.Education import (
    EDUCATION_LEVEL_CHOICES,
    YEAR_CHOICES,
    SEMESTER_CHOICES,
)

# Levels that are identified by course + year/semester (no grade). These are the
# ones that lack a batch dimension and can collapse intakes onto one slot.
HIGHER_ED_LEVELS = [4, 5, 8, 9]
STUDENT_STATUS_RUNNING = 1

_EL = dict(EDUCATION_LEVEL_CHOICES)
_YEAR = dict(YEAR_CHOICES)
_SEM = dict(SEMESTER_CHOICES)


class Command(BaseCommand):
    help = (
        "Read-only. Report higher-ed classes whose currently-enrolled students "
        "span more than one admission year (collapsed batches)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--school", type=int, default=None,
            help="Limit the analysis to a single school id.",
        )
        parser.add_argument(
            "--verbose", action="store_true",
            help="List every affected class with its per-batch student breakdown.",
        )

    def _slot_label(self, cls: dict) -> str:
        el = _EL.get(cls["education_level"], cls["education_level"])
        course = cls.get("course__course") or "?"
        if cls.get("year"):
            step = f"year {_YEAR.get(cls['year'], cls['year'])}"
        elif cls.get("semester"):
            step = f"sem {_SEM.get(cls['semester'], cls['semester'])}"
        else:
            step = "-"
        name = f" ({cls['name']})" if cls.get("name") else ""
        return f"{el} / {course} / {step}{name}"

    def handle(self, *args, **options):
        school = options.get("school")
        verbose = options.get("verbose")

        class_qs = ClassInfo.objects.filter(
            is_active=True, education_level__in=HIGHER_ED_LEVELS
        )
        if school:
            class_qs = class_qs.filter(school=school)
        class_qs = class_qs.values(
            "id", "school", "education_level", "course",
            "course__course", "grade", "faculty", "section",
            "year", "semester", "name", "batch",
        ).order_by("school", "education_level", "course", "year", "semester")

        total_classes = 0
        collapsed_classes = 0
        collapsed_students = 0
        empty_classes = 0
        per_school = {}

        self.stdout.write(self.style.MIGRATE_HEADING(
            "Batch collapse analysis (higher-ed classes; admission year = batch proxy)"
        ))

        for cls in class_qs:
            total_classes += 1
            key = gen_class_key(cls)
            batches = list(
                Student.objects.filter(
                    class_info=cls["id"],
                    is_active=True,
                    status=STUDENT_STATUS_RUNNING,
                )
                .values("academic_year", "academic_year__name")
                .annotate(n=Count("id"))
                .order_by("academic_year")
            )
            if not batches:
                empty_classes += 1
                continue

            distinct = len(batches)
            n_students = sum(b["n"] for b in batches)
            s = per_school.setdefault(
                cls["school"], {"classes": 0, "collapsed": 0, "students": 0}
            )
            s["classes"] += 1

            if distinct > 1:
                collapsed_classes += 1
                collapsed_students += n_students
                s["collapsed"] += 1
                s["students"] += n_students
                if verbose:
                    self.stdout.write(self.style.WARNING(
                        f"\n  school {cls['school']}  key={key}  "
                        f"{self._slot_label(cls)}  (classId={cls['id']})"
                    ))
                    self.stdout.write(
                        f"    {distinct} batches / {n_students} students collapsed:"
                    )
                    for b in batches:
                        ay = b["academic_year__name"] or f"AY#{b['academic_year']}"
                        self.stdout.write(f"      - batch {ay:<12} {b['n']} students")

        # Summary
        self.stdout.write(self.style.MIGRATE_HEADING("\nSummary"))
        self.stdout.write(f"  Higher-ed classes scanned      : {total_classes}")
        self.stdout.write(f"  Empty (no running students)    : {empty_classes}")
        self.stdout.write(self.style.ERROR(
            f"  Classes with collapsed batches : {collapsed_classes}"
        ))
        self.stdout.write(self.style.ERROR(
            f"  Students needing a batch tag   : {collapsed_students}"
        ))

        if per_school:
            self.stdout.write("\n  Per school (occupied classes / collapsed / students):")
            for sid in sorted(per_school):
                v = per_school[sid]
                flag = self.style.ERROR("  <-- needs batches") if v["collapsed"] else ""
                self.stdout.write(
                    f"    school {sid:<4} {v['classes']:>4} / "
                    f"{v['collapsed']:>3} / {v['students']:>4}{flag}"
                )

        if not verbose and collapsed_classes:
            self.stdout.write(
                "\n  Re-run with --verbose to see each affected class and its "
                "per-batch breakdown."
            )
        if not collapsed_classes:
            self.stdout.write(self.style.SUCCESS(
                "\n  No collapsed batches found: every higher-ed class currently "
                "holds students from a single admission year."
            ))
