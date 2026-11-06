"""Phase 3: a child's screens for parents and students (mobile/SPEC.md §5, §8)."""
from decimal import Decimal
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from main.methods.nepaliDatetime import ndt_today
from main.models.Attendance import ClassAttendance, StudentAttendance
from main.models.CalendarEvent import CalendarEvent
from main.models.exams.Exam import Exam
from main.models.exams.Result import ClassResult, StudentResult
from main.models.Fee import FeeTitle
from main.models.Homework import Homework, HomeworkSubmission
from main.models.Invoice import StudentInvoice
from main.models.Ledger import LedgerPosting, StudentLedger
from main.models.Notice import Notice
from main.models.Subject import Subject
from main.views.LedgerViews import LedgerView
from mobileapi.models import AppSession

from .helpers import MobileFixtures, MobileTestMixin, WriteMixin, session_token

TODAY = ndt_today()
PAST = "2083-01-05"
FUTURE = "2099-12-30"


def subject(school, name="English", order=1):
    return Subject.objects.create(subject=name, order=order, credit_hours=Decimal("4"), school=school,
                                  class_info=school.klass)


class ChildFixtures(MobileTestMixin, WriteMixin):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)
        cls.stranger = MobileFixtures.student(cls.school, "Cara", last_name="Rai", phone="9822222222")
        cls.far = MobileFixtures.student(cls.other, "Dev", last_name="Lama", phone="9833333333")
        cls.parent_token = session_token(AppSession.PARENT, cls.guardian, cls.school)
        cls.student_token = session_token(AppSession.STUDENT, cls.student_account, cls.school)
        cls.staff_token = session_token(AppSession.STAFF, cls.staff_account, cls.school)
        cls.admin_token = session_token(AppSession.ADMIN, cls.admin_account, cls.school)


class AccessTests(ChildFixtures, TestCase):
    def test_a_parent_opens_each_linked_child(self):
        for child in (self.student, self.sibling):
            answer = self.get(f"students/{child.id}/home", self.parent_token)
            self.assertEqual(answer.status_code, 200, answer.content)
            self.assertEqual(answer.json()["student"]["id"], child.id)

    def test_a_parent_cannot_open_another_familys_child_or_school(self):
        for child in (self.stranger, self.far):
            for path in ("home", "attendance", "fees", "fees/history", "homework", "results", "timetable"):
                answer = self.get(f"students/{child.id}/{path}", self.parent_token)
                self.assertEqual(answer.status_code, 404, path)
                self.assertEqual(self.error(answer), "not_found")

    def test_a_link_waiting_for_review_opens_nothing(self):
        from main.models.Guardian import StudentGuardian

        StudentGuardian.objects.filter(student=self.sibling).update(state=StudentGuardian.NEEDS_REVIEW,
                                                                     is_primary=False)
        self.assertEqual(self.get(f"students/{self.sibling.id}/home", self.parent_token).status_code, 404)

    def test_a_student_opens_only_themself(self):
        self.assertEqual(self.get(f"students/{self.student.id}/home", self.student_token).status_code, 200)
        self.assertEqual(self.get(f"students/{self.sibling.id}/home", self.student_token).status_code, 404)

    def test_staff_and_admins_use_their_own_screens(self):
        for token in (self.staff_token, self.admin_token):
            answer = self.get(f"students/{self.student.id}/home", token)
            self.assertEqual(answer.status_code, 403)

    def test_no_token_or_a_bad_one_is_refused(self):
        self.assertEqual(self.get(f"students/{self.student.id}/home").status_code, 401)
        self.assertEqual(self.get(f"students/{self.student.id}/home", "mv1.nope").status_code, 401)

    def test_a_signed_out_session_is_refused(self):
        AppSession.objects.filter(guardian=self.guardian).update(revoked_at="2026-11-05T00:00:00Z",
                                                                 revoke_reason=AppSession.SIGNED_OUT)
        self.assertEqual(self.get(f"students/{self.student.id}/home", self.parent_token).status_code, 401)


class AttendanceTests(ChildFixtures, TestCase):
    def mark(self, date, present, student=None):
        # one roll call a day per class (uniq_class_attendance_per_day)
        day, _ = ClassAttendance.objects.get_or_create(date=date, class_info=self.school.klass, school=self.school)
        return StudentAttendance.objects.create(class_attendance=day, student=student or self.student,
                                                status=present, reason="")

    def test_a_month_lists_each_day_once_with_totals(self):
        self.mark("2083-07-01", True)
        self.mark("2083-07-02", False)
        self.mark("2083-07-03", True)
        self.mark("2083-07-04", True, student=self.sibling)  # another child
        self.mark("2083-08-01", True)  # another month
        body = self.get(f"students/{self.student.id}/attendance?month=2083-07", self.parent_token).json()
        self.assertEqual([(d["date"], d["status"]) for d in body["days"]],
                         [("2083-07-01", "present"), ("2083-07-02", "absent"), ("2083-07-03", "present")])
        self.assertEqual(body["totals"], {"present": 2, "absent": 1, "taken": 3})
        self.assertEqual(body["month"]["label"], "Kartik 2083")
        self.assertEqual(body["month"]["days"], 30)
        self.assertEqual((body["month"]["previous"], body["month"]["next"]), ("2083-06", "2083-08"))

    def test_a_bad_month_is_refused(self):
        for month in ("2083-13", "July", "2083-7"):
            answer = self.get(f"students/{self.student.id}/attendance?month={month}", self.parent_token)
            self.assertEqual(answer.status_code, 400, month)

    def test_home_shows_todays_mark(self):
        self.mark(TODAY, True)
        today = self.get(f"students/{self.student.id}/home", self.student_token).json()["today"]
        self.assertEqual((today["date"], today["status"]), (TODAY, "present"))


class FeeTests(ChildFixtures, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.tuition = FeeTitle.objects.create(title="Tuition fee", school=cls.school)
        cls.computer = FeeTitle.objects.create(title="Computer fee", school=cls.school)
        posting = LedgerPosting.objects.create(academic_year=cls.school.year, economic_year=cls.year,
                                               class_info=cls.school.klass, months=[7])
        StudentLedger.objects.create(
            academic_year=cls.school.year, economic_year=cls.year, student=cls.student, school=cls.school,
            ledger_posting=posting, total=Decimal("1500"), date="2083-07-01",
            details={str(cls.tuition.id): "1000", str(cls.computer.id): "500"},
        )
        cls.receipt = StudentInvoice.objects.create(
            invoice_id=41, date="2083-07-05", details={str(cls.tuition.id): {"amt": "600", "dis": "0", "due": "400"}},
            total_paid=Decimal("600"), total_due=Decimal("900"), payment_month=7, school=cls.school, mode=1,
            academic_year=cls.school.year, economic_year=cls.year, student=cls.student,
            class_info=cls.school.klass,
        )

    def test_dues_are_what_the_fees_counter_shows(self):
        body = self.get(f"students/{self.student.id}/fees", self.parent_token).json()
        counter = LedgerView().mergeStudentLedgers(self.student.id, self.school.klass.id, self.school.id,
                                                   self.school.year.id)
        self.assertEqual(body["total_paisa"], int(counter["total"] * 100))
        self.assertEqual({i["title"]: i["amount_paisa"] for i in body["items"]},
                         {"Tuition fee": 40000, "Computer fee": 50000})
        self.assertEqual(self.get(f"students/{self.student.id}/home", self.parent_token).json()["fees_due_paisa"],
                         90000)

    def test_history_lists_the_bill_and_the_payment_newest_first(self):
        items = self.get(f"students/{self.student.id}/fees/history", self.parent_token).json()["items"]
        self.assertEqual([(i["kind"], i["amount_paisa"]) for i in items], [("payment", 60000), ("bill", 150000)])
        payment, bill = items
        self.assertEqual(payment["receipt_id"], self.receipt.id)
        self.assertEqual(bill["months"], ["Kartik"])
        self.assertIsNone(bill["receipt_id"])

    def test_a_receipt_opens_for_its_own_student_only(self):
        answer = self.get(f"students/{self.student.id}/receipts/{self.receipt.id}", self.parent_token)
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(answer.json()["receipt_no"], 41)
        self.assertEqual(answer.json()["total_paid_paisa"], 60000)
        # the sibling's path with this receipt's id
        self.assertEqual(self.get(f"students/{self.sibling.id}/receipts/{self.receipt.id}",
                                  self.parent_token).status_code, 404)


@override_settings(MEDIA_ROOT="/tmp/schoolcore-mobile-test-media")
class HomeworkTests(ChildFixtures, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.english = subject(cls.school)
        make = dict(class_info=cls.school.klass, subject=cls.english, staff=cls.staff, school=cls.school,
                    description="Read the chapter.")
        cls.open = Homework.objects.create(title="Chapter five", due_date=FUTURE, **make)
        cls.late = Homework.objects.create(title="Chapter four", due_date=PAST, **make)

    def pdf(self, name="answers.pdf"):
        return SimpleUploadedFile(name, b"%PDF-1.4 test", content_type="application/pdf")

    def hand_in(self, homework, token=None, key=None, files=None):
        return self.write("post", f"students/{self.student.id}/homework/{homework.id}/hand-in",
                          {"files": files or [self.pdf()]}, token or self.student_token, key=key, fmt="multipart")

    def test_open_and_past_homework_are_listed_apart(self):
        open_ = self.get(f"students/{self.student.id}/homework?state=open", self.parent_token).json()["items"]
        past = self.get(f"students/{self.student.id}/homework?state=past", self.parent_token).json()["items"]
        self.assertEqual([h["title"] for h in open_], ["Chapter five"])
        self.assertEqual([h["title"] for h in past], ["Chapter four"])
        self.assertEqual(open_[0]["teacher"], "Sita Rai")

    def test_handing_in_saves_once_and_a_retry_gets_the_same_answer(self):
        first = self.hand_in(self.open, key="hand-in-key-1")
        self.assertEqual(first.status_code, 201, first.content)
        self.assertEqual(first.json()["hand_in"]["status"], "received")
        again = self.hand_in(self.open, key="hand-in-key-1")
        self.assertEqual(again.status_code, 201)
        self.assertEqual(again["Idempotent-Replay"], "true")
        self.assertEqual(HomeworkSubmission.objects.filter(homework=self.open, student=self.student).count(), 1)
        # a new attempt, with a new key, is told it is already in
        self.assertEqual(self.error(self.hand_in(self.open)), "already_handed_in")

    def test_a_parent_can_hand_in_for_their_child(self):
        self.assertEqual(self.hand_in(self.open, token=self.parent_token).status_code, 201)

    def test_after_the_due_date_it_is_refused(self):
        answer = self.hand_in(self.late)
        self.assertEqual(answer.status_code, 422)
        self.assertEqual(self.error(answer), "too_late")

    def test_a_page_a_browser_would_run_is_refused(self):
        answer = self.hand_in(self.open, files=[SimpleUploadedFile("x.html", b"<script>", content_type="text/html")])
        self.assertEqual(answer.status_code, 400)
        self.assertFalse(HomeworkSubmission.objects.exists())

    def test_a_write_without_an_idempotency_key_is_refused(self):
        answer = self.write("post", f"students/{self.student.id}/homework/{self.open.id}/hand-in",
                            {"files": [self.pdf()]}, self.student_token, key="", fmt="multipart")
        self.assertEqual(self.error(answer), "idempotency_key_required")

    def test_another_class_homework_is_not_found(self):
        from main.models.ClassInfo import ClassInfo

        klass = ClassInfo.objects.create(school=self.school, academic_year=self.school.year, education_level=2,
                                         grade=5)
        other_subject = Subject.objects.create(subject="Science", credit_hours=Decimal("4"), school=self.school,
                                               class_info=klass)
        other = Homework.objects.create(title="Other class work", due_date=FUTURE, class_info=klass,
                                        subject=other_subject, staff=self.staff, school=self.school,
                                        description="x")
        self.assertEqual(self.hand_in(other).status_code, 404)


class ResultTests(ChildFixtures, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.english = subject(cls.school)
        cls.maths = subject(cls.school, "Mathematics", 2)
        cls.term = Exam.objects.create(academic_year=cls.school.year, name="First term", school=cls.school)
        cls.unpublished = Exam.objects.create(academic_year=cls.school.year, name="Second term", school=cls.school)
        for exam, published in ((cls.term, "2083-07-01"), (cls.unpublished, None)):
            for sub, mark in ((cls.english, "75"), (cls.maths, "30")):
                header = ClassResult.objects.create(exam=exam, class_info=cls.school.klass, subject=sub,
                                                    criteria={"fm": "100", "pm": "40", "fm_th": "100", "pm_th": "40"},
                                                    published_date=published)
                StudentResult.objects.create(student=cls.student, class_result=header, theory=Decimal(mark),
                                             total=Decimal(mark), result=Decimal(mark) >= 40)

    def test_only_published_exams_are_listed(self):
        items = self.get(f"students/{self.student.id}/results", self.student_token).json()["items"]
        self.assertEqual([(i["name"], i["published_date"]) for i in items], [("First term", "2083-07-01")])

    def test_an_exam_shows_each_subject_and_the_totals(self):
        body = self.get(f"students/{self.student.id}/results/{self.term.id}", self.parent_token).json()
        self.assertEqual([(s["subject"], s["total"], s["passed"]) for s in body["subjects"]],
                         [("English", "75.00", True), ("Mathematics", "30.00", False)])
        self.assertEqual((body["total"], body["full_marks"], body["percentage"]), ("105", "200", "52.50"))
        self.assertFalse(body["passed"])

    def test_an_unpublished_exam_is_not_found(self):
        answer = self.get(f"students/{self.student.id}/results/{self.unpublished.id}", self.student_token)
        self.assertEqual(answer.status_code, 404)

    def test_a_sibling_sees_no_marks_of_another(self):
        body = self.get(f"students/{self.sibling.id}/results", self.parent_token).json()
        self.assertEqual(body["items"], [])


class SchoolNewsTests(ChildFixtures, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        for n in range(35):
            Notice.objects.create(title=f"Notice {n}", description="Body", school=cls.school, date="2083-07-01")
        Notice.objects.create(title="Elsewhere", description="Body", school=cls.other, date="2083-07-01")
        CalendarEvent.objects.create(start_date="2083-07-10", end_date="2083-07-12", type=5, color="#008000",
                                     description="Tihar", school=cls.school)
        CalendarEvent.objects.create(start_date="2083-01-01", end_date="2083-01-01", type=1, color="#008000",
                                     description="New year", school=cls.school)

    def test_notices_come_in_pages_of_thirty_from_this_school_only(self):
        first = self.get("notices", self.parent_token).json()
        self.assertEqual(len(first["items"]), 30)
        self.assertEqual(first["items"][0]["title"], "Notice 34")
        second = self.get(f"notices?cursor={first['next_cursor']}", self.parent_token).json()
        self.assertEqual(len(second["items"]), 5)
        self.assertIsNone(second["next_cursor"])
        titles = {n["title"] for n in first["items"] + second["items"]}
        self.assertNotIn("Elsewhere", titles)

    def test_the_calendar_answers_for_a_range(self):
        body = self.get("calendar?from=2083-07-01&to=2083-07-30", self.student_token).json()
        self.assertEqual([(e["title"], e["type"]) for e in body["items"]], [("Tihar", "vacation")])

    @mock.patch("mobileapi.views.school.notify_school_students")
    def test_who_may_publish_a_notice(self, push):
        body = {"title": "Sports day", "body": "On Friday."}
        self.assertEqual(self.write("post", "notices", body, self.student_token).status_code, 403)
        self.assertEqual(self.write("post", "notices", body, self.parent_token).status_code, 403)
        # the teacher has 1501 and 1503, not 1651
        self.assertEqual(self.write("post", "notices", body, self.staff_token).status_code, 403)
        answer = self.write("post", "notices", body, self.admin_token)
        self.assertEqual(answer.status_code, 201, answer.content)
        self.assertEqual(answer.json()["body"], "On Friday.")
        push.assert_called_once()
        self.staff.permissions = [1651]
        self.staff.save(update_fields=["permissions"])
        self.assertEqual(self.write("post", "notices", {**body, "title": "Second"}, self.staff_token).status_code,
                         201)

    def test_a_notice_needs_a_title(self):
        answer = self.write("post", "notices", {"title": "", "body": "x"}, self.admin_token)
        self.assertEqual(answer.status_code, 400)
        self.assertIn("title", answer.json()["error"]["fields"])
