"""Give a subject a place in an already-finished exam so its marks can be typed.

Marks entry for a CLOSED academic year builds its roster from the results that
already exist for that exam. A subject with no results therefore has no roster,
and the page reports "No students found" — so marks that were only ever written
on paper can never be entered. This creates the missing ClassResult and seeds a
blank StudentResult per student, which is exactly the roster marks entry needs.

Seeded rows carry total=0 and result=False. Until the real marks are typed those
students read as failing that subject and the class totals/percentages move, so
run this immediately before the marks are entered, not long ahead of it.

Dry run by default; nothing is written without --apply.

    manage.py seed_result_subject --exam 322 --class 607 --subject 6290 --subject 6289
    manage.py seed_result_subject --exam 322 --class 607 --subject 6290 --fm 50 --pm 20 --apply
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from main.methods.subjectScope import is_subject_in_class_scope
from main.models.exams.Result import ClassResult, StudentResult
from main.models.exams.Exam import Exam
from main.models.ClassInfo import ClassInfo
from main.models.Subject import Subject


class Command(BaseCommand):
    help = "Create a ClassResult + blank StudentResult roster for a subject missing from a finished exam."

    def add_arguments(self, parser):
        parser.add_argument("--exam", type=int, required=True)
        parser.add_argument(
            "--class", dest="class_info", type=int, required=True, help="ClassInfo id"
        )
        parser.add_argument(
            "--subject",
            type=int,
            action="append",
            required=True,
            help="Subject id; repeat for several",
        )
        parser.add_argument("--fm", type=int, default=50, help="Full marks")
        parser.add_argument("--pm", type=int, default=20, help="Pass marks")
        parser.add_argument("--apply", action="store_true", help="Write the rows")

    def handle(self, *args, **options):
        exam_id = options["exam"]
        class_info_id = options["class_info"]
        subject_ids = options["subject"]
        fm, pm, apply_changes = options["fm"], options["pm"], options["apply"]

        exam = Exam.objects.filter(id=exam_id).first()
        if not exam:
            raise CommandError(f"exam {exam_id} not found")
        class_info = ClassInfo.objects.filter(id=class_info_id).first()
        if not class_info:
            raise CommandError(f"class_info {class_info_id} not found")

        # The roster is whoever already sat this exam in this class. Taking it
        # from the results rather than the class roll keeps leavers and
        # mid-year joiners exactly as the rest of the exam has them.
        roster = set(
            StudentResult.objects.filter(
                is_active=True,
                class_result__is_active=True,
                class_result__exam=exam_id,
                class_result__class_info=class_info_id,
            ).values_list("student_id", flat=True)
        )
        if not roster:
            raise CommandError(
                f"no existing results for exam {exam_id} / class {class_info_id} — "
                "nothing to take a roster from"
            )

        criteria = {
            "fm": fm,
            "pm": pm,
            "fm_th": fm,
            "pm_th": pm,
            "fm_pr": 0,
            "pm_pr": 0,
            "attendance": 0,
        }
        mode = "APPLY" if apply_changes else "DRY RUN"
        self.stdout.write(
            f"[{mode}] exam {exam_id} ({exam.name}) / class {class_info_id} / "
            f"{len(roster)} students in roster"
        )

        for subject_id in subject_ids:
            subject = Subject.objects.filter(id=subject_id).first()
            if not subject:
                self.stdout.write(self.style.ERROR(f"  subject {subject_id} not found"))
                continue
            if subject.school_id != class_info.school_id:
                self.stdout.write(
                    self.style.ERROR(
                        f"  subject {subject_id} ({subject.subject}) belongs to school "
                        f"{subject.school_id}, class is school {class_info.school_id}"
                    )
                )
                continue
            # Same class names its subjects separately per class, so a subject id
            # copied off another class's marksheet seeds a SECOND column of that
            # name here — see fix_foreign_result_subjects.
            if not is_subject_in_class_scope(subject, class_info):
                self.stdout.write(
                    self.style.ERROR(
                        f"  subject {subject_id} ({subject.subject}) is not a subject "
                        f"of class {class_info_id} — seeding it would add a duplicate "
                        "column under that name"
                    )
                )
                continue

            class_result = (
                ClassResult.objects.filter(
                    exam=exam_id,
                    class_info=class_info_id,
                    subject=subject_id,
                    is_active=True,
                )
                .order_by("-id")
                .first()
            )
            existing = (
                set(
                    StudentResult.objects.filter(
                        class_result=class_result, is_active=True
                    ).values_list("student_id", flat=True)
                )
                if class_result
                else set()
            )
            missing = roster - existing
            self.stdout.write(
                f"  subject {subject_id} {subject.subject}: "
                f"ClassResult={'exists #' + str(class_result.id) if class_result else 'MISSING -> create'}, "
                f"blank rows to seed: {len(missing)} (already present: {len(existing)})"
            )
            if not apply_changes:
                continue
            if not missing:
                # Creating the header with no rows behind it would leave an
                # empty column on the gradesheet that marks entry cannot fill
                # (its roster comes from the rows) — a phantom subject.
                self.stdout.write("     nothing missing — header left alone")
                continue

            with transaction.atomic():
                if not class_result:
                    class_result = ClassResult.objects.create(
                        exam_id=exam_id,
                        class_info_id=class_info_id,
                        subject_id=subject_id,
                        criteria=criteria,
                    )
                    self.stdout.write(f"     created ClassResult #{class_result.id}")
                created = StudentResult.objects.bulk_create(
                    [
                        StudentResult(
                            student_id=student_id,
                            class_result=class_result,
                            theory=None,
                            practical=None,
                            total=0,
                            result=False,
                            absent=False,
                        )
                        for student_id in sorted(missing)
                    ]
                )
                self.stdout.write(
                    self.style.SUCCESS(
                        f"     seeded {len(created)} blank StudentResult rows "
                        f"(ids {created[0].id}-{created[-1].id})"
                        if created
                        else "     nothing to seed"
                    )
                )
        if not apply_changes:
            self.stdout.write(self.style.WARNING("dry run — re-run with --apply to write"))
