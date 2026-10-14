"""
Phase 2 batch split -- resolve COLLAPSED higher-ed classes into per-batch rows.
Additive + idempotent + reversible. Run AFTER `backfill_batches` (Phase 1).

A collapsed class is one ClassInfo row currently holding students from more than
one admission batch (e.g. BCA sem-1 with both 2078 and 2079 students). Phase 1
already stamped every student's `batch`; it left these class rows NULL because it
cannot pick one batch for them. This command splits them:

  For each collapsed class (keeping the largest batch on the ORIGINAL row to
  minimise moves):
    * stamp the original ClassInfo.batch = the kept batch, mirror its mapping;
    * for every OTHER batch: get_or_create a CLONE ClassInfo (identical class
      details + that batch), move those students onto it, and mirror the mapping
      onto the clone's batch-aware key.

Nothing is destroyed:
  * No invoice/ledger row is touched. `StudentInvoice.class_info` and
    `LedgerPosting.class_info` are write-time snapshots, so a student's history
    stays attributed to the class it was recorded under; only future postings
    use the clone.
  * Fees are unaffected -- feeq resolves by class details (course+semester),
    which the clone shares with the original, so amounts are identical.
  * Reversible via --revert (or, on prod, the mandated pre-apply pg_dump).

Usage:
    python manage.py split_batches --school 1               # dry-run
    python manage.py split_batches --school 1 --apply
    python manage.py split_batches --school 1 --revert --apply
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from main.models.ClassInfo import ClassInfo, CLASS_DETAILS_FIELDS
from main.models.Student import Student
from main.models.FiscalYears import AcademicYearMapping
from main.methods.academicYear import (
    gen_class_key,
    gen_class_key_no_batch,
    mirror_mapping_to_batch_key,
)

HIGHER_ED_LEVELS = [4, 5, 8, 9]
STUDENT_STATUS_RUNNING = 1


class Command(BaseCommand):
    help = "Phase-2: split collapsed higher-ed classes into per-batch class rows."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, default=None)
        parser.add_argument("--apply", action="store_true")
        parser.add_argument(
            "--revert", action="store_true",
            help="Undo the split: move students back, delete clones + mappings.",
        )

    def handle(self, *args, **options):
        if options.get("revert"):
            return self._revert(options.get("school"), options.get("apply"))
        return self._split(options.get("school"), options.get("apply"))

    # ---- helpers ----------------------------------------------------------
    def _running(self, class_id):
        return Student.objects.filter(
            class_info=class_id, is_active=True, status=STUDENT_STATUS_RUNNING
        )

    def _collapsed_classes(self, school):
        qs = ClassInfo.objects.filter(
            is_active=True, education_level__in=HIGHER_ED_LEVELS, batch__isnull=True
        )
        if school:
            qs = qs.filter(school=school)
        out = []
        for cls in qs.values("id", "school", "name", *CLASS_DETAILS_FIELDS):
            batches = list(
                self._running(cls["id"])
                .filter(batch__isnull=False)
                .values("batch")
                .annotate(n=Count("id"))
                .order_by("-n")
            )
            if len(batches) > 1:
                out.append((cls, batches))
        return out

    # ---- split ------------------------------------------------------------
    def _split(self, school, apply):
        collapsed = self._collapsed_classes(school)
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"Phase-2 split plan{'' if not school else f' (school {school})'}"
        ))
        self.stdout.write(f"  Collapsed classes to split: {len(collapsed)}")

        planned_clones = 0
        planned_moves = 0
        for cls, batches in collapsed:
            keep = batches[0]["batch"]              # largest cohort keeps original
            others = batches[1:]
            planned_clones += len(others)
            moves = sum(b["n"] for b in others)
            planned_moves += moves
            label = cls.get("name") or f"classId {cls['id']}"
            self.stdout.write(
                f"    - {label}: keep batch {keep} on original, "
                f"clone {len(others)} row(s), move {moves} student(s)"
            )

        self.stdout.write(f"\n  Clone classes to create : {planned_clones}")
        self.stdout.write(f"  Students to move         : {planned_moves}")
        if not apply:
            self.stdout.write("\n  DRY-RUN -- nothing written. Re-run with --apply.")
            return

        created_clones = 0
        moved = 0
        mirrored = 0
        with transaction.atomic():
            for cls, batches in collapsed:
                keep = batches[0]["batch"]
                # 1. stamp the original with the kept batch + mirror its mapping
                ClassInfo.objects.filter(id=cls["id"]).update(batch_id=keep)
                old_key = gen_class_key_no_batch(cls)
                if mirror_mapping_to_batch_key(
                    cls["school"], old_key, gen_class_key({**cls, "batch": keep})
                )[1]:
                    mirrored += 1
                # 2. clone + move each other batch. .values() gives FK ids, so
                # course/section must be passed as *_id to get_or_create.
                _FK = {"course", "section"}
                details = {
                    (f + "_id" if f in _FK else f): cls[f]
                    for f in CLASS_DETAILS_FIELDS
                }
                for b in batches[1:]:
                    bid = b["batch"]
                    clone, was_new = ClassInfo.objects.get_or_create(
                        school_id=cls["school"], batch_id=bid, **details,
                        defaults={"academic_year_id": None, "is_active": True},
                    )
                    if was_new:
                        created_clones += 1
                    n = self._running(cls["id"]).filter(batch_id=bid).update(
                        class_info=clone
                    )
                    moved += n
                    if mirror_mapping_to_batch_key(
                        cls["school"], old_key, gen_class_key({**cls, "batch": bid})
                    )[1]:
                        mirrored += 1

        self.stdout.write(self.style.SUCCESS(
            f"\n  APPLIED: {created_clones} clone classes, {moved} students moved, "
            f"{mirrored} mappings mirrored."
        ))

    # ---- revert -----------------------------------------------------------
    def _revert(self, school, apply):
        # A split group = active higher-ed ClassInfo rows sharing identical class
        # details but with >1 distinct batch. The originator is the lowest id
        # (it pre-existed the clones). Move everyone back onto it and drop clones.
        qs = ClassInfo.objects.filter(
            is_active=True, education_level__in=HIGHER_ED_LEVELS, batch__isnull=False
        )
        if school:
            qs = qs.filter(school=school)
        groups = {}
        for cls in qs.values("id", "school", "batch", *CLASS_DETAILS_FIELDS):
            key = (cls["school"],) + tuple(cls[f] for f in CLASS_DETAILS_FIELDS)
            groups.setdefault(key, []).append(cls)

        split_groups = {k: v for k, v in groups.items() if len(v) > 1}
        clone_ids, origin_ids = [], []
        for rows in split_groups.values():
            rows.sort(key=lambda r: r["id"])
            origin_ids.append(rows[0]["id"])
            clone_ids.extend(r["id"] for r in rows[1:])

        self.stdout.write(self.style.MIGRATE_HEADING("Phase-2 split REVERT plan"))
        self.stdout.write(f"  Split groups           : {len(split_groups)}")
        self.stdout.write(f"  Clone classes to remove: {len(clone_ids)}")
        if not apply:
            self.stdout.write("\n  DRY-RUN -- pass --apply to actually revert.")
            return

        with transaction.atomic():
            moved_back = 0
            for rows in split_groups.values():
                rows.sort(key=lambda r: r["id"])
                origin = rows[0]["id"]
                for clone in rows[1:]:
                    moved_back += Student.objects.filter(
                        class_info=clone["id"]
                    ).update(class_info_id=origin)
            # drop clones' and origins' batch-keyed mappings, un-stamp origins,
            # delete clone rows.
            batch_mappings = AcademicYearMapping.objects.filter(
                key__regex=r"c[0-9]+b[0-9]+"
            )
            if school:
                batch_mappings = batch_mappings.filter(school=school)
            batch_mappings.delete()
            ClassInfo.objects.filter(id__in=origin_ids).update(batch=None)
            deleted = ClassInfo.objects.filter(id__in=clone_ids).delete()

        self.stdout.write(self.style.SUCCESS(
            f"  Reverted. Moved back {moved_back} students; deleted clones: {deleted}"
        ))
