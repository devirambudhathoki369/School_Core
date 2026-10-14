"""
Promote every running cohort of a higher-ed program up one year/semester level,
section-preserving, and advance each Batch's current position -- phase 4 of the
batch-aware year-end (see docs/BATCH_AWARE_CLOSING_DESIGN.md). Run this AFTER the
academic-year roll (rollover_academic_year), never before.

Why it is safe to do after the roll: once the roll has landed every level on ONE
academic year, moving a student from year N to year N+1 is a SAME-academic-year
move, so no dues carry-forward happens (the balance already lives under the
student in the current year) and nothing can be double-counted. This command
therefore does NOT touch ledgers/invoices at all -- it only moves students'
class_info and bumps Batch.current_year. It refuses to run if source and target
levels resolve to different academic years (i.e. the roll was not done first).

Section-preserving: sections (English/Health/... or A/B) share ids across levels,
so a student in (year N, section S) moves to (year N+1, section S). If a source
section has no counterpart at the next level, that student is flagged and skipped
(never dumped into the wrong stream).

The top (terminal) level is NOT promoted -- that cohort graduates via passing-out,
which is a separate step already handled.

Safety: DRY-RUN by default (prints every move, writes nothing). --apply writes in
one transaction + a JSON snapshot for --revert. Take a pg_dump first.

Usage:
  python manage.py promote_program_level --school 56 --course 10
  python manage.py promote_program_level --school 56 --course 10 --details
  python manage.py promote_program_level --school 56 --course 10 --apply
  python manage.py promote_program_level --revert /path/to/snapshot.json
"""

import json
import os
from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from main.models.ClassInfo import ClassInfo
from main.models.Course import Course
from main.models.Batch import Batch
from main.models.Student import Student
from main.methods.academicYear import get_class_academic_year_id

HIGHER_ED_LEVELS = (4, 5, 8, 9)
RUNNING = 1


class Command(BaseCommand):
    help = "Promote a higher-ed program's cohorts up one level (dry-run by default)."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int)
        parser.add_argument("--course", type=int)
        parser.add_argument("--education-level", type=int, default=4)
        parser.add_argument("--snapshot", type=str)
        parser.add_argument("--details", action="store_true")
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--revert", type=str)

    def handle(self, *args, **o):
        if o.get("revert"):
            return self._revert(o["revert"])
        return self._promote(o)

    def _promote(self, o):
        for req in ("school", "course"):
            if not o.get(req):
                raise CommandError(f"--{req} is required")
        sid, course, el, apply = o["school"], o["course"], o["education_level"], o["apply"]
        if el not in HIGHER_ED_LEVELS:
            raise CommandError(f"education-level {el} is not higher-ed {HIGHER_ED_LEVELS}")

        classes = list(
            ClassInfo.objects.filter(
                school_id=sid, education_level=el, course=course, is_active=True
            ).values("id", "year", "semester", "section")
        )
        if not classes:
            raise CommandError("no classes for that school/course/level")

        # year-wise or semester-wise?
        use_year = any(c["year"] for c in classes)
        lvl_key = "year" if use_year else "semester"

        crow = Course.objects.filter(id=course).values("total_years", "total_semesters").first() or {}
        program_len = (crow.get("total_years") if use_year else crow.get("total_semesters"))
        present_max = max((c[lvl_key] or 0) for c in classes)
        if not program_len:
            program_len = present_max  # fallback: highest level that exists

        # (level, section_id) -> class_id  [section_id None == base class]
        by_ls = {(c[lvl_key], c["section"]): c["id"] for c in classes}

        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\nPromote school {sid} course {course} (EL {el}, {lvl_key}-wise, "
            f"program length {program_len}) [{'APPLY' if apply else 'DRY-RUN'}]"))

        plan = []          # (student_id, old_class, new_class, from_lvl)
        batch_new_year = {}  # batch_id -> new level
        skipped = []       # (student_id, old_class, from_lvl, reason)
        # promote highest source level first so nobody is moved twice
        for lvl in range(program_len - 1, 0, -1):
            src_classes = [c for c in classes if c[lvl_key] == lvl]
            moved = 0
            for sc in src_classes:
                target = by_ls.get((lvl + 1, sc["section"]))
                students = list(
                    Student.objects.filter(
                        class_info_id=sc["id"], status=RUNNING, is_active=True
                    ).values_list("id", "batch")
                )
                for stu_id, batch_id in students:
                    if not target:
                        skipped.append((stu_id, sc["id"], lvl, "no target section at next level"))
                        continue
                    # academic-year alignment guard: same AY => safe same-year move
                    src_ay = get_class_academic_year_id(sid, {
                        "education_level": el, "course": course, "grade": None,
                        "year": lvl if use_year else None,
                        "semester": None if use_year else lvl, "batch": None,
                    })
                    dst_ay = get_class_academic_year_id(sid, {
                        "education_level": el, "course": course, "grade": None,
                        "year": (lvl + 1) if use_year else None,
                        "semester": None if use_year else (lvl + 1), "batch": None,
                    })
                    if src_ay != dst_ay:
                        raise CommandError(
                            f"ABORT: level {lvl} (AY {src_ay}) and {lvl+1} (AY {dst_ay}) "
                            "are in different academic years -- run rollover_academic_year "
                            "first so this is a safe same-year promotion.")
                    plan.append((stu_id, sc["id"], target, lvl))
                    if batch_id:
                        batch_new_year[batch_id] = lvl + 1
                    moved += 1
            self.stdout.write(
                f"  Year {lvl} -> {lvl+1}: {moved} students"
                + ("" if moved else "  (empty)"))
            if o["details"]:
                for stu_id, oc, nc, fl in [p for p in plan if p[3] == lvl]:
                    self.stdout.write(f"      student {stu_id}: class {oc} -> {nc}")

        # batch position summary
        if batch_new_year:
            self.stdout.write("  batch advances:")
            for bid, ny in sorted(batch_new_year.items()):
                b = Batch.objects.filter(id=bid).values("year", "current_year").first() or {}
                self.stdout.write(
                    f"      Batch id {bid} ({b.get('year')}): "
                    f"current_year {b.get('current_year')} -> {ny}")
        if skipped:
            self.stdout.write(self.style.WARNING(f"  SKIPPED {len(skipped)} (no target section):"))
            for stu_id, oc, fl, why in skipped:
                self.stdout.write(f"      student {stu_id} (class {oc}, year {fl}): {why}")

        self.stdout.write(self.style.WARNING(f"  ---- {len(plan)} students to promote ----"))

        if not plan:
            self.stdout.write("Nothing to promote.")
            return
        if not apply:
            self.stdout.write(self.style.NOTICE(
                "\nDRY-RUN -- nothing written. Re-run with --apply to commit."))
            return

        snap = {
            "school": sid, "course": course, "moves": [],
            "batch_changes": [],
        }
        now = timezone.now()
        # snapshot current state for revert
        for stu_id, old_c, new_c, fl in plan:
            snap["moves"].append({"student": stu_id, "from": old_c, "to": new_c})
        for bid, ny in batch_new_year.items():
            b = Batch.objects.get(id=bid)
            snap["batch_changes"].append({"id": bid, "from": b.current_year, "to": ny})

        with transaction.atomic():
            # group moves by target for tidy bulk updates
            by_target = defaultdict(list)
            for stu_id, old_c, new_c, fl in plan:
                by_target[new_c].append(stu_id)
            for new_c, ids in by_target.items():
                Student.objects.filter(id__in=ids).update(class_info_id=new_c, updated_at=now)
            for bid, ny in batch_new_year.items():
                Batch.objects.filter(id=bid).update(current_year=ny)

        snap_path = o.get("snapshot") or os.path.join(
            os.getcwd(), f"promote_{sid}_{course}_snapshot.json")
        with open(snap_path, "w") as f:
            json.dump(snap, f, indent=2)
        self.stdout.write(self.style.SUCCESS(
            f"\nDONE. Promoted {len(plan)} students, advanced {len(batch_new_year)} "
            f"batches. Snapshot: {snap_path}"))

    def _revert(self, path):
        with open(path) as f:
            snap = json.load(f)
        now = timezone.now()
        with transaction.atomic():
            by_src = defaultdict(list)
            for m in snap["moves"]:
                by_src[m["from"]].append(m["student"])
            for old_c, ids in by_src.items():
                Student.objects.filter(id__in=ids).update(class_info_id=old_c, updated_at=now)
            for bc in snap["batch_changes"]:
                Batch.objects.filter(id=bc["id"]).update(current_year=bc["from"])
        self.stdout.write(self.style.SUCCESS(
            f"Reverted {len(snap['moves'])} promotions and "
            f"{len(snap['batch_changes'])} batch advances."))
