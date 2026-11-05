"""Phase 4: teachers' and staff screens (mobile/SPEC.md §5, §8)."""
from decimal import Decimal
from unittest import mock

from django.test import TestCase

from main.methods.nepaliDatetime import ndt_today
from main.models.Attendance import ClassAttendance, StaffAttendance, StudentAttendance
from main.models.ClassPeriod import ClassPeriod
from main.models.Homework import Homework, HomeworkSubmission
from main.models.Staff import Staff, StaffRole
from main.models.Subject import Subject
from account.models import StaffAccount
from mobileapi.models import AppSession

from .helpers import PASSWORD, MobileFixtures, MobileTestMixin, WriteMixin, session_token

TODAY = ndt_today()
FUTURE = "2099-12-30"


class StaffFixtures(MobileTestMixin, WriteMixin):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)
        cls.english = Subject.objects.create(subject="English", order=1, credit_hours=Decimal("4"),
                                             school=cls.school, class_info=cls.school.klass)
        account = StaffAccount.objects.create_user(username="clerk-one", password=PASSWORD)
        cls.clerk = Staff.objects.create(
            account=account, school=cls.school, role=StaffRole.objects.create(role="Clerk"), first_name="Ram",
            last_name="Thapa", primary_contact="9800000002", location="Test", permissions=[],
        )
        cls.teacher_token = session_token(AppSession.STAFF, cls.staff_account, cls.school)
        cls.clerk_token = session_token(AppSession.STAFF, account, cls.school)
        cls.parent_token = session_token(AppSession.PARENT, cls.guardian, cls.school)
        cls.far = MobileFixtures.student(cls.other, "Dev", last_name="Lama")
        cls.klass = cls.school.klass.id

    def put_day(self, marks, token=None, date=None, key=None):
        path = f"staff/classes/{self.klass}/attendance" + (f"?date={date}" if date else "")
        return self.write("put", path, {"marks": marks}, token or self.teacher_token, key=key)

    def marks(self, asha=True, bina=False):
        return [{"student": self.student.id, "present": asha}, {"student": self.sibling.id, "present": bina,
                                                                 "reason": "Sick"}]


@mock.patch("mobileapi.views.staff.notify_class_students")
@mock.patch("main.views.AttendanceViews.notify_attendance_marked")
class ClassesTests(StaffFixtures, TestCase):
    def test_staff_who_may_take_attendance_see_the_schools_classes(self, *_):
        body = self.get("staff/classes", self.teacher_token).json()
        self.assertEqual([c["id"] for c in body["items"]], [self.klass])
        self.assertEqual(body["items"][0]["students"], 2)
        self.assertEqual(body["items"][0]["subjects"], [{"id": self.english.id, "name": "English"}])
        self.assertTrue(body["can_take_attendance"])
        self.assertFalse(body["can_change_attendance"])

    def test_other_staff_see_only_the_classes_they_teach(self, *_):
        self.assertEqual(self.get("staff/classes", self.clerk_token).json()["items"], [])
        ClassPeriod.objects.create(class_info=self.school.klass, period_count=2, subjects={"2": self.english.id},
                                   teachers={"2": self.clerk.id}, academic_year=self.school.year)
        item = self.get("staff/classes", self.clerk_token).json()["items"][0]
        self.assertEqual((item["id"], item["in_timetable"], item["periods"]), (self.klass, True, [2]))
        today = self.get("staff/today", self.clerk_token).json()
        self.assertEqual([(p["period"], p["subject"]) for p in today["periods"]], [(2, "English")])

    def test_parents_cannot_open_staff_screens(self, *_):
        for path in ("staff/today", "staff/classes", "staff/homework", f"staff/classes/{self.klass}/attendance"):
            self.assertEqual(self.get(path, self.parent_token).status_code, 403, path)


@mock.patch("mobileapi.views.staff.notify_class_students")
@mock.patch("main.views.AttendanceViews.notify_attendance_marked")
class AttendanceTests(StaffFixtures, TestCase):
    def test_taking_a_new_day_saves_it_once_and_tells_the_parents(self, push, _):
        first = self.put_day(self.marks(), key="day-key-0001")
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(first.json()["totals"], {"present": 1, "absent": 1, "unmarked": 0})
        again = self.put_day(self.marks(), key="day-key-0001")
        self.assertEqual(again["Idempotent-Replay"], "true")
        self.assertEqual(ClassAttendance.objects.filter(class_info=self.klass, date=TODAY).count(), 1)
        self.assertEqual(StudentAttendance.objects.filter(class_attendance__class_info=self.klass).count(), 2)
        day = ClassAttendance.objects.get(class_info=self.klass, date=TODAY)
        self.assertEqual(day.teacher_id, self.staff.id)
        push.assert_called_once_with(self.school.id, [self.student.id], [self.sibling.id])
        self.assertEqual(StudentAttendance.objects.get(student=self.sibling).reason, "Sick")

    def test_changing_a_saved_day_needs_1502(self, *_):
        self.put_day(self.marks())
        answer = self.put_day(self.marks(asha=False))
        self.assertEqual(answer.status_code, 409)
        self.assertEqual(self.error(answer), "already_taken")
        self.staff.permissions = [1502, 1503]
        self.staff.save(update_fields=["permissions"])
        answer = self.put_day(self.marks(asha=False))
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertFalse(StudentAttendance.objects.get(student=self.student).status)
        self.assertEqual(StudentAttendance.objects.filter(student=self.student).count(), 1)
        # 1502 alone cannot open a new day
        answer = self.put_day(self.marks(), date="2083-01-10")
        self.assertEqual(answer.status_code, 403)

    def test_a_student_of_another_class_or_school_is_refused(self, *_):
        answer = self.put_day([{"student": self.far.id, "present": True}])
        self.assertEqual(answer.status_code, 400)
        self.assertFalse(ClassAttendance.objects.exists())

    def test_a_day_that_has_not_come_is_refused(self, *_):
        self.assertEqual(self.error(self.put_day(self.marks(), date=FUTURE)), "future_date")

    def test_an_earlier_day_can_be_sent_later_from_the_queue(self, *_):
        self.assertEqual(self.put_day(self.marks(), date="2083-01-10").status_code, 200)
        self.assertTrue(ClassAttendance.objects.filter(class_info=self.klass, date="2083-01-10").exists())

    def test_staff_without_attendance_rights_are_refused(self, *_):
        self.assertEqual(self.put_day(self.marks(), token=self.clerk_token).status_code, 403)
        self.assertEqual(self.get(f"staff/classes/{self.klass}/attendance", self.clerk_token).status_code, 403)

    def test_the_roster_shows_each_students_mark(self, *_):
        self.put_day(self.marks())
        body = self.get(f"staff/classes/{self.klass}/attendance", self.teacher_token).json()
        self.assertTrue(body["taken"])
        self.assertFalse(body["can_save"])  # taken, and no 1502
        self.assertEqual({s["name"]: s["status"] for s in body["students"]},
                         {"Asha Pun": "present", "Bina Pun": "absent"})

    def test_another_schools_class_is_not_found(self, *_):
        answer = self.get(f"staff/classes/{self.other.klass.id}/attendance", self.teacher_token)
        self.assertEqual(answer.status_code, 404)

    def test_own_attendance_by_month(self, *_):
        StaffAttendance.objects.create(date="2083-07-02", staff=self.staff, status=True, school=self.school,
                                       reason="")
        body = self.get("staff/me/attendance?month=2083-07", self.teacher_token).json()
        self.assertEqual([(d["date"], d["status"]) for d in body["days"]], [("2083-07-02", "present")])


@mock.patch("mobileapi.views.staff.notify_class_students")
@mock.patch("main.views.AttendanceViews.notify_attendance_marked")
class HomeworkTests(StaffFixtures, TestCase):
    def set(self, token=None, **extra):
        body = {"class_id": self.klass, "subject_id": self.english.id, "title": "Chapter six",
                "description": "Answer the questions.", "due_date": FUTURE, **extra}
        return self.write("post", "staff/homework", body, token or self.teacher_token, fmt="multipart")

    def test_setting_homework_saves_it_and_tells_the_class(self, _, push):
        answer = self.set()
        self.assertEqual(answer.status_code, 201, answer.content)
        homework = Homework.objects.get()
        self.assertEqual((homework.staff_id, homework.class_info_id, homework.due_date),
                         (self.staff.id, self.klass, FUTURE))
        push.assert_called_once()
        listed = self.get("staff/homework", self.teacher_token).json()["items"]
        self.assertEqual([(h["title"], h["students"]) for h in listed], [("Chapter six", 2)])

    def test_a_past_due_date_or_another_class_subject_is_refused(self, *_):
        self.assertEqual(self.set(due_date="2080-01-01").status_code, 400)
        other = Subject.objects.create(subject="Maths", credit_hours=Decimal("4"), school=self.other,
                                       class_info=self.other.klass)
        self.assertEqual(self.set(subject_id=other.id).status_code, 400)
        self.assertEqual(self.set(class_id=self.other.klass.id).status_code, 404)
        self.assertFalse(Homework.objects.exists())

    def test_checking_hand_ins(self, *_):
        self.set()
        homework = Homework.objects.get()
        submission = HomeworkSubmission.objects.create(homework=homework, student=self.student,
                                                       submitted_date=TODAY)
        body = self.get(f"staff/homework/{homework.id}/hand-ins", self.teacher_token).json()
        self.assertEqual([i["student_name"] for i in body["items"]], ["Asha Pun"])
        self.assertEqual([m["name"] for m in body["missing"]], ["Bina Pun"])
        answer = self.write("patch", f"staff/homework/{homework.id}/hand-ins/{submission.id}",
                            {"status": "checked", "remarks": "Well done"}, self.teacher_token)
        self.assertEqual(answer.status_code, 200, answer.content)
        submission.refresh_from_db()
        self.assertEqual((submission.status, submission.remarks), (2, "Well done"))

    def test_another_teachers_homework_is_not_theirs_to_check(self, *_):
        self.set()
        homework = Homework.objects.get()
        self.assertEqual(self.get(f"staff/homework/{homework.id}/hand-ins", self.clerk_token).status_code, 404)
