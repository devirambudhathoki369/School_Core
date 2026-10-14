"""
Phase 1 batch backfill -- STAMP ONLY. Additive, idempotent, reversible.

What it does (nothing destructive, no financial row is ever touched):
  1. Creates a `Batch` (school, course, admission-year) for each higher-ed
     cohort, inferred from each student's IMMUTABLE `academic_year` admission
     stamp -- so the batch is derived from existing data, never invented.
  2. Stamps `Student.batch` on every higher-ed student.
  3. Stamps `ClassInfo.batch` ONLY on classes that currently hold exactly one
     batch (safe -- unambiguous).
  4. Leaves COLLAPSED classes (>1 admission year on one row) untouched
     (batch stays NULL == today's behavior) and REPORTS them: those need the
     separate, reviewed Phase-2 split (clone per-batch ClassInfo + move students
     + mirror the AcademicYearMapping). Phase 2 is intentionally NOT done here.

Billing is unaffected throughout: fees resolve by class DETAILS (feeq), which
does not include batch, so amounts are identical before and after.

Safety:
  * DRY-RUN by default; prints the exact plan. Pass --apply to write.
  * Idempotent -- re-running skips already-stamped rows.
  * Reversible -- `--revert` nulls every batch FK it set and deletes the Batch
    rows (only safe while nothing batch-specific has been created on top).
  * Runs inside a single transaction.

Usage:
    python manage.py backfill_batches                 # dry-run, whole system
    python manage.py backfill_batches --school 1      # dry-run, one school
    python manage.py backfill_batches --school 1 --apply
    python manage.py backfill_batches --school 1 --revert --apply
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from main.models.Batch import Batch
from main.models.ClassInfo import ClassInfo
from main.models.Student import Student
from main.methods.academicYear import (
    gen_class_key,
    gen_class_key_no_batch,
    mirror_mapping_to_batch_key,
)

# Full class details gen_class_key may read, so the mapping key is computed
# correctly (batch is added separately when stamping).
_KEY_FIELDS = (
    "education_level", "grade", "faculty", "course", "section", "year", "semester",
)
HIGHER_ED_LEVELS = [4, 5, 8, 9]
STUDENT_STATUS_RUNNING = 1


class Command(BaseCommand):
    help = "Phase-1 batch backfill (stamp only). Additive, idempotent, reversible."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, default=None)
        parser.add_argument(
            "--apply", action="store_true",
            help="Write changes. Without it, the command only prints the plan.",
        )
        parser.add_argument(
            "--revert", action="store_true",
            help="Undo: null every batch FK and delete Batch rows (needs --apply).",
        )

    def handle(self, *args, **options):
        school = options.get("school")
        apply = options.get("apply")
        revert = options.get("revert")

        if revert:
            return self._revert(school, apply)

        higher_ed_students = Student.objects.filter(
            is_active=True,
            status=STUDENT_STATUS_RUNNING,
            class_info__education_level__in=HIGHER_ED_LEVELS,
        )
        if school:
            higher_ed_students = higher_ed_students.filter(class_info__school=school)

        # --- Plan: batches to ensure + students to stamp -----------------------
        student_rows = list(
            higher_ed_students.filter(batch__isnull=True).values(
                "id",
                "class_info",
                "class_info__school",
                "class_info__course",
                "class_info__semester",
                "class_info__year",
                "academic_year",
                "academic_year__name",
            )
        )

        # unique cohorts keyed by (school, course, admission-year-name)
        cohorts = {}
        for r in student_rows:
            k = (r["class_info__school"], r["class_info__course"], r["academic_year__name"])
            cohorts.setdefault(k, {
                "school": r["class_info__school"],
                "course": r["class_info__course"],
                "year": r["academic_year__name"],
                "start_ay": r["academic_year"],
                "semester": r["class_info__semester"] or r["class_info__year"],
                "students": 0,
            })
            cohorts[k]["students"] += 1

        # --- Plan: which ClassInfo rows are safe to stamp vs collapsed ---------
        class_qs = ClassInfo.objects.filter(
            is_active=True, education_level__in=HIGHER_ED_LEVELS, batch__isnull=True
        )
        if school:
            class_qs = class_qs.filter(school=school)

        safe_classes, collapsed_classes = [], []
        for cls in class_qs.values("id", "school", "name", *_KEY_FIELDS):
            batches = list(
                Student.objects.filter(
                    class_info=cls["id"], is_active=True, status=STUDENT_STATUS_RUNNING
                )
                .values("academic_year__name")
                .annotate(n=Count("id"))
            )
            if len(batches) == 1:
                cls["_year"] = batches[0]["academic_year__name"]
                safe_classes.append(cls)
            elif len(batches) > 1:
                collapsed_classes.append((cls, batches))

        # --- Report ------------------------------------------------------------
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"Phase-1 batch backfill plan{'' if not school else f' (school {school})'}"
        ))
        self.stdout.write(f"  Cohorts (Batch rows) to ensure : {len(cohorts)}")
        self.stdout.write(f"  Students to stamp              : {len(student_rows)}")
        self.stdout.write(f"  Classes safe to stamp (1 batch): {len(safe_classes)}")
        self.stdout.write(self.style.WARNING(
            f"  Collapsed classes (Phase-2 split): {len(collapsed_classes)}"
        ))
        for cls, batches in collapsed_classes:
            years = ", ".join(f"{b['academic_year__name']}({b['n']})" for b in batches)
            self.stdout.write(f"    - classId {cls['id']} {cls.get('name') or ''}: {years}")

        if not apply:
            self.stdout.write("\n  DRY-RUN -- nothing written. Re-run with --apply to commit.")
            return

        # --- Apply -------------------------------------------------------------
        with transaction.atomic():
            batch_ids = {}
            for k, c in cohorts.items():
                batch, _ = Batch.objects.get_or_create(
                    school_id=c["school"], course_id=c["course"], year=c["year"],
                    defaults={
                        "start_academic_year_id": c["start_ay"],
                        "current_semester": c["semester"],
                    },
                )
                batch_ids[k] = batch.id

            stamped_students = 0
            for r in student_rows:
                k = (r["class_info__school"], r["class_info__course"], r["academic_year__name"])
                Student.objects.filter(id=r["id"]).update(batch_id=batch_ids[k])
                stamped_students += 1

            stamped_classes = 0
            mirrored_mappings = 0
            for cls in safe_classes:
                k = (cls["school"], cls["course"], cls["_year"])
                bid = batch_ids.get(k)
                if not bid:
                    continue
                ClassInfo.objects.filter(id=cls["id"]).update(batch_id=bid)
                stamped_classes += 1
                # Stamping changes the class's key -> mirror its mapping onto the
                # new batch-aware key so academic-year resolution keeps working.
                old_key = gen_class_key_no_batch(cls)
                new_key = gen_class_key({**cls, "batch": bid})
                _, created = mirror_mapping_to_batch_key(cls["school"], old_key, new_key)
                if created:
                    mirrored_mappings += 1

            self.stdout.write(self.style.SUCCESS(
                f"\n  APPLIED: {len(batch_ids)} batches, {stamped_students} students, "
                f"{stamped_classes} classes stamped, {mirrored_mappings} mappings mirrored."
            ))
            self.stdout.write(
                "  Collapsed classes left NULL for the reviewed Phase-2 split."
            )

    def _revert(self, school, apply):
        from main.models.FiscalYears import AcademicYearMapping

        students = Student.objects.filter(batch__isnull=False)
        classes = ClassInfo.objects.filter(batch__isnull=False)
        batches = Batch.objects.all()
        # Mirrored mappings carry a batch segment in their key: ...c<course>b<batch>...
        mirrored = AcademicYearMapping.objects.filter(key__regex=r"c[0-9]+b[0-9]+")
        if school:
            students = students.filter(class_info__school=school)
            classes = classes.filter(school=school)
            batches = batches.filter(school=school)
            mirrored = mirrored.filter(school=school)

        self.stdout.write(self.style.MIGRATE_HEADING("Batch backfill REVERT plan"))
        self.stdout.write(f"  Students to un-stamp        : {students.count()}")
        self.stdout.write(f"  Classes to un-stamp         : {classes.count()}")
        self.stdout.write(f"  Batch-keyed mappings to drop: {mirrored.count()}")
        self.stdout.write(f"  Batch rows to delete        : {batches.count()}")
        self.stdout.write(self.style.WARNING(
            "  NOTE: reverts Phase-1 STAMPING only. If Phase-2 split has moved "
            "students onto cloned classes, run `split_batches --revert` FIRST."
        ))
        if not apply:
            self.stdout.write("\n  DRY-RUN -- pass --apply to actually revert.")
            return
        with transaction.atomic():
            students.update(batch=None)
            classes.update(batch=None)
            mirrored.delete()
            deleted = batches.delete()
        self.stdout.write(self.style.SUCCESS(f"  Reverted. Deleted batches: {deleted}"))
