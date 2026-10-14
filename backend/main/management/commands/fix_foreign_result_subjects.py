"""Repair marks filed under another class's subject.

Every class owns its own `Subject` row per subject name, so "Social" in Class 7
and "Social" in Class 8 are different records. Marks entry accepted whichever
subject id the page happened to still be holding, so a class could end up with a
marks header pointing at a subject that belongs to a different class. Two things
go wrong on the gradesheet:

  * the class shows the subject TWICE — once per Subject row — when both headers
    are active (this is what a school reports as "Social double aayo");
  * the column carries the OTHER class's full/pass marks, so students sit on the
    wrong side of the pass line.

The entry point is now guarded (`main/methods/subjectScope.py`), so this only has
to clean up what was already written.

Per foreign header, the same-named subject of the correct class decides the fix:

  DROPEMPTY the foreign header has no student rows at all — nothing was ever
            entered under it and marks entry cannot use it (the roster comes
            from existing rows), so it is a pure phantom column. Deactivated
            whatever its name, which is what clears "(TH)"-style strays that no
            subject of the class is named after.
  REPOINT   the correct class has no active header for that subject yet — move
            the header onto the right subject. Every mark is kept as typed.
  DROP      the correct class already has its own header for the subject and it
            covers every student the foreign one does — the foreign header is
            the duplicate column, so deactivate it (and its student rows).
  CONFLICT  a duplicate exists but holds different marks, or covers different
            students. Reported with a diff, never touched.
  UNMATCHED no subject of that name in the class. Reported, never touched.

Dry run by default; nothing is written without --apply.

    manage.py fix_foreign_result_subjects --school 26
    manage.py fix_foreign_result_subjects --school 26 --class 2248 --exam 497 --apply
    manage.py fix_foreign_result_subjects --backup /root/foreign_subjects_backup.json --apply
"""

import json

from django.core.management.base import BaseCommand
from django.db import transaction

from main.methods.subjectScope import is_subject_in_class_scope, class_group_query
from main.models.ClassInfo import ClassInfo
from main.models.Subject import Subject
from main.models.exams.Result import ClassResult, StudentResult

REPOINT, DROP, CONFLICT, UNMATCHED = "REPOINT", "DROP", "CONFLICT", "UNMATCHED"
DROP_EMPTY = "DROPEMPTY"


class Command(BaseCommand):
    help = "Repoint or drop exam marks headers that point at another class's subject."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, help="Limit to one school")
        parser.add_argument(
            "--class", dest="class_info", type=int, help="Limit to one ClassInfo id"
        )
        parser.add_argument("--exam", type=int, help="Limit to one exam")
        parser.add_argument(
            "--only",
            choices=[REPOINT, DROP, DROP_EMPTY],
            help="Apply just one kind of fix",
        )
        parser.add_argument(
            "--drop-conflicts",
            action="store_true",
            help=(
                "Also drop foreign headers whose marks disagree with the kept "
                "one — only after reading the diff and confirming the kept "
                "header is the newer truth. Requires --class and --exam so the "
                "decision is made one gradesheet at a time."
            ),
        )
        parser.add_argument("--backup", help="Write affected rows to this JSON path")
        parser.add_argument("--apply", action="store_true", help="Write the changes")

    def handle(self, *args, **options):
        apply_changes = options["apply"]
        only = options["only"]
        drop_conflicts = options["drop_conflicts"]
        if drop_conflicts and not (options["class_info"] and options["exam"]):
            self.stderr.write(
                self.style.ERROR(
                    "--drop-conflicts needs --class and --exam: a disagreeing "
                    "header is only safe to drop one reviewed gradesheet at a time."
                )
            )
            return

        headers = ClassResult.objects.filter(is_active=True).select_related(
            "subject", "class_info"
        )
        if options["school"]:
            headers = headers.filter(class_info__school_id=options["school"])
        if options["class_info"]:
            headers = headers.filter(class_info_id=options["class_info"])
        if options["exam"]:
            headers = headers.filter(exam_id=options["exam"])

        plans = []
        for header in headers.order_by("class_info_id", "exam_id", "id"):
            if is_subject_in_class_scope(header.subject, header.class_info):
                continue
            plans.append(self.plan(header))

        self.report(plans)
        if options["backup"]:
            self.write_backup(plans, options["backup"])

        if drop_conflicts:
            for plan in plans:
                if plan["action"] == CONFLICT and plan.get("kept") is not None:
                    plan["action"] = DROP
                    plan["note"] += " | dropped on review (--drop-conflicts)"
        actionable = [p for p in plans if p["action"] in (REPOINT, DROP, DROP_EMPTY)]
        if only:
            actionable = [p for p in actionable if p["action"] == only]
        if not actionable:
            self.stdout.write("\nnothing to apply.")
            return
        if not apply_changes:
            self.stdout.write(
                self.style.WARNING(
                    f"\nDRY RUN — {len(actionable)} header(s) would change. "
                    "Re-run with --apply to write."
                )
            )
            return
        self.apply(actionable)

    # ----- planning

    def plan(self, header):
        """Decide what to do with one foreign header."""
        class_info = header.class_info
        if not StudentResult.objects.filter(class_result=header).exists():
            # No student row was EVER written under this header — not even a
            # blank roster. Marks entry builds its roster from existing rows, so
            # the header can never be filled in; it only adds an empty column to
            # the gradesheet. Nothing to weigh up, and nothing to lose.
            return {
                "action": DROP_EMPTY,
                "header": header,
                "correct_subject": None,
                "rows": {},
                "note": "no student rows ever — phantom column",
            }
        name = (header.subject.subject or "").strip().lower()
        group_ids = ClassInfo.objects.filter(class_group_query(class_info)).values("id")
        correct = None
        for candidate in Subject.objects.filter(
            class_info__in=group_ids, school_id=class_info.school_id, is_active=True
        ):
            if (candidate.subject or "").strip().lower() == name:
                correct = candidate
                break

        rows = self.marks(header)
        plan = {
            "action": UNMATCHED,
            "header": header,
            "correct_subject": correct,
            "rows": rows,
            "note": "",
        }
        if correct is None:
            plan["note"] = f'no subject named "{header.subject.subject}" in this class'
            return plan

        existing = (
            ClassResult.objects.filter(
                exam_id=header.exam_id,
                class_info_id=header.class_info_id,
                subject_id=correct.id,
                is_active=True,
            )
            .order_by("-id")
            .first()
        )
        if existing is None:
            plan["action"] = REPOINT
            return plan

        plan["kept"] = existing
        kept_rows = self.marks(existing)
        missing = sorted(set(rows) - set(kept_rows))
        differing = sorted(
            student
            for student, mark in rows.items()
            if student in kept_rows and kept_rows[student] != mark
        )
        if missing:
            plan["action"] = CONFLICT
            plan["note"] = (
                f"{len(missing)} student(s) only have marks on the foreign header "
                f"(e.g. {missing[:5]})"
            )
        elif differing:
            plan["action"] = CONFLICT
            plan["note"] = (
                f"{len(differing)} student(s) have different marks on the two "
                f"headers (e.g. "
                + ", ".join(
                    f"student {s}: foreign {rows[s]} vs kept {kept_rows[s]}"
                    for s in differing[:3]
                )
                + ")"
            )
        else:
            plan["action"] = DROP
            plan["note"] = f"duplicate of cr={existing.id}, same marks for every student"
        return plan

    def marks(self, header):
        """{student_id: (theory, practical, total, absent)} for one header."""
        rows = {}
        for row in (
            StudentResult.objects.filter(class_result=header, is_active=True)
            .order_by("student_id", "id")
            .values("student_id", "theory", "practical", "total", "absent")
        ):
            # last row wins: a re-entry appends rather than replaces.
            rows[row["student_id"]] = (
                row["theory"],
                row["practical"],
                row["total"],
                bool(row["absent"]),
            )
        return rows

    # ----- output

    def report(self, plans):
        if not plans:
            self.stdout.write(self.style.SUCCESS("no foreign subjects found."))
            return
        counts = {}
        for plan in plans:
            counts[plan["action"]] = counts.get(plan["action"], 0) + 1
        self.stdout.write(f"foreign marks headers: {len(plans)}")
        for action in (REPOINT, DROP, DROP_EMPTY, CONFLICT, UNMATCHED):
            if counts.get(action):
                self.stdout.write(f"   {action:<10} {counts[action]}")
        self.stdout.write("")
        for plan in plans:
            header, correct = plan["header"], plan["correct_subject"]
            class_info = header.class_info
            style = (
                self.style.SUCCESS
                if plan["action"] in (REPOINT, DROP, DROP_EMPTY)
                else self.style.WARNING
            )
            self.stdout.write(
                style(
                    "%-9s school=%-3s class_info=%-5s(grade=%s section=%s) exam=%-4s "
                    "cr=%-6s subject=%-5s %r -> %s"
                    % (
                        plan["action"],
                        class_info.school_id,
                        class_info.id,
                        class_info.grade,
                        class_info.section_id,
                        header.exam_id,
                        header.id,
                        header.subject_id,
                        header.subject.subject,
                        correct.id if correct else "-",
                    )
                )
            )
            self.stdout.write(
                f"          students={len(plan['rows'])} criteria={header.criteria}"
                + (f" | {plan['note']}" if plan["note"] else "")
            )

    def write_backup(self, plans, path):
        payload = []
        for plan in plans:
            header = plan["header"]
            payload.append(
                {
                    "class_result": header.id,
                    "school": header.class_info.school_id,
                    "class_info": header.class_info_id,
                    "exam": header.exam_id,
                    "subject": header.subject_id,
                    "subject_name": header.subject.subject,
                    "criteria": header.criteria,
                    "published_date": header.published_date,
                    "planned_action": plan["action"],
                    "correct_subject": (
                        plan["correct_subject"].id if plan["correct_subject"] else None
                    ),
                    "student_results": list(
                        StudentResult.objects.filter(
                            class_result=header, is_active=True
                        ).values(
                            "id",
                            "student_id",
                            "theory",
                            "practical",
                            "total",
                            "attendance",
                            "inclusion",
                            "result",
                            "absent",
                        )
                    ),
                }
            )
        with open(path, "w") as handle:
            json.dump(payload, handle, indent=2, default=str)
        self.stdout.write(f"\nbackup written: {path} ({len(payload)} header(s))")

    # ----- writing

    def apply(self, plans):
        repointed = dropped = 0
        with transaction.atomic():
            for plan in plans:
                header = plan["header"]
                if plan["action"] == REPOINT:
                    header.subject = plan["correct_subject"]
                    header.save(update_fields=["subject"])
                    repointed += 1
                elif plan["action"] in (DROP, DROP_EMPTY):
                    StudentResult.objects.filter(
                        class_result=header, is_active=True
                    ).update(is_active=False)
                    header.is_active = False
                    header.save(update_fields=["is_active"])
                    dropped += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"\napplied: {repointed} repointed, {dropped} duplicate header(s) dropped."
            )
        )
