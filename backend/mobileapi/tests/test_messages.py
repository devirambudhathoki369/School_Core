"""Homework messages between a student and the teacher who set the homework
(mobile/SPEC.md §5)."""
from datetime import timedelta
from unittest import mock

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from account.models import StaffAccount
from main.models.Homework import Homework, HomeworkMessage
from main.models.Staff import Staff
from main.models.Student import Student
from mobileapi import push
from mobileapi.models import AppSession

from .helpers import PASSWORD, MobileFixtures, session_token
from .test_children import FUTURE, ChildFixtures, subject


@mock.patch("mobileapi.threads.push.on_homework_message")
class MessageTests(ChildFixtures, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        english = subject(cls.school)
        cls.homework = Homework.objects.create(
            title="Chapter five", due_date=FUTURE, class_info=cls.school.klass, subject=english, staff=cls.staff,
            school=cls.school, description="Read the chapter.",
        )
        account = StaffAccount.objects.create_user(username="teacher-two", password=PASSWORD)
        cls.other_teacher = Staff.objects.create(
            account=account, school=cls.school, role=cls.staff.role, first_name="Ram",
            last_name="Thapa", primary_contact="9800000003", location="Test", permissions=[],
        )
        cls.other_teacher_token = session_token(AppSession.STAFF, account, cls.school)

    # --- helpers ---
    def student_path(self, student=None, homework=None):
        return f"students/{(student or self.student).id}/homework/{(homework or self.homework).id}/messages"

    def staff_path(self, student=None, homework=None):
        return f"staff/homework/{(homework or self.homework).id}/messages/{(student or self.student).id}"

    def ask(self, body="Is question 3 for today?", token=None, key=None):
        return self.write("post", self.student_path(), {"body": body}, token or self.student_token, key=key)

    def reply(self, body="Yes, all of it.", student=None, token=None):
        return self.write("post", self.staff_path(student), {"body": body}, token or self.staff_token)

    def homework_row(self, token):
        items = self.get(f"students/{self.student.id}/homework?state=open", token).json()["items"]
        return next(h for h in items if h["id"] == self.homework.id)

    # --- the thread ---
    def test_a_student_asks_and_the_teacher_sees_it_as_new(self, push_):
        answer = self.ask()
        self.assertEqual(answer.status_code, 201, answer.content)
        self.assertEqual((answer.json()["sender"], answer.json()["seen"]), ("student", False))
        push_.assert_called_once_with(self.school.id, self.homework.id, self.student.id, self.staff.id,
                                      "Asha Pun · Chapter five", "Is question 3 for today?")
        self.assertEqual(self.get("staff/today", self.staff_token).json()["messages_to_read"], 1)
        listed = self.get("staff/homework", self.staff_token).json()["items"]
        self.assertEqual([h["unread_messages"] for h in listed], [1])
        hand_ins = self.get(f"staff/homework/{self.homework.id}/hand-ins", self.staff_token).json()
        self.assertEqual([(t["student_name"], t["unread"], t["last"]["body"]) for t in hand_ins["threads"]],
                         [("Asha Pun", 1, "Is question 3 for today?")])
        # opening the thread reads it
        thread = self.get(self.staff_path(), self.staff_token).json()
        self.assertEqual((thread["student_name"], thread["teacher_name"], thread["can_write"]),
                         ("Asha Pun", "Sita Rai", True))
        self.assertEqual([m["body"] for m in thread["items"]], ["Is question 3 for today?"])
        self.assertEqual(self.get("staff/today", self.staff_token).json()["messages_to_read"], 0)
        mine = self.get(self.student_path(), self.student_token).json()["items"]
        self.assertTrue(mine[0]["seen"])

    def test_the_teacher_answers_and_the_student_sees_it_as_new(self, push_):
        self.ask()
        answer = self.reply()
        self.assertEqual(answer.status_code, 201, answer.content)
        self.assertEqual(answer.json()["sender"], "teacher")
        push_.assert_called_with(self.school.id, self.homework.id, self.student.id, None,
                                 "Sita Rai · Chapter five", "Yes, all of it.")
        row = self.homework_row(self.student_token)
        self.assertEqual((row["messages"], row["unread_messages"]), (2, 1))
        thread = self.get(self.student_path(), self.student_token).json()
        self.assertEqual([m["sender"] for m in thread["items"]], ["teacher", "student"])  # newest first
        self.assertEqual(self.homework_row(self.student_token)["unread_messages"], 0)

    def test_parents_read_the_thread_but_do_not_write_or_mark_it_read(self, push_):
        self.ask()
        self.reply()
        thread = self.get(self.student_path(), self.parent_token)
        self.assertEqual(thread.status_code, 200, thread.content)
        self.assertFalse(thread.json()["can_write"])
        self.assertEqual(len(thread.json()["items"]), 2)
        self.assertEqual(self.homework_row(self.parent_token)["unread_messages"], 1)  # still new to the child
        answer = self.ask(token=self.parent_token)
        self.assertEqual(answer.status_code, 403)
        self.assertEqual(HomeworkMessage.objects.count(), 2)

    def test_a_student_reaches_only_their_own_thread_on_their_class_homework(self, push_):
        self.assertEqual(self.get(self.student_path(self.sibling), self.student_token).status_code, 404)
        far_teacher = Staff.objects.create(
            account=StaffAccount.objects.create_user(username="teacher-far", password=PASSWORD), school=self.other,
            role=self.staff.role, first_name="Dil", last_name="Gurung", primary_contact="9800000004",
            location="Test", permissions=[],
        )
        far = Homework.objects.create(
            title="Other school", due_date=FUTURE, class_info=self.other.klass, subject=subject(self.other),
            staff=far_teacher, school=self.other, description="x",
        )
        self.assertEqual(self.write("post", self.student_path(homework=far), {"body": "Hello"},
                                    self.student_token).status_code, 404)
        self.assertFalse(HomeworkMessage.objects.exists())

    def test_only_the_teacher_who_set_it_and_only_to_students_of_the_class(self, push_):
        self.assertEqual(self.get(self.staff_path(), self.other_teacher_token).status_code, 404)
        self.assertEqual(self.reply(token=self.other_teacher_token).status_code, 404)
        self.assertEqual(self.reply(student=self.far).status_code, 404)
        self.assertEqual(self.get(self.staff_path(self.far), self.staff_token).status_code, 404)
        # students cannot open the teacher's side
        self.assertEqual(self.get(self.staff_path(), self.student_token).status_code, 403)
        self.assertFalse(HomeworkMessage.objects.exists())

    def test_a_teacher_may_write_first_to_a_student_who_has_not_handed_in(self, push_):
        answer = self.reply("Please hand it in by Friday.", student=self.sibling)
        self.assertEqual(answer.status_code, 201, answer.content)
        self.assertEqual(HomeworkMessage.objects.get().student_id, self.sibling.id)

    def test_a_student_who_left_the_class_keeps_the_thread_to_read_only(self, push_):
        self.ask()
        Student.objects.filter(pk=self.student.pk).update(class_info=self.other.klass)
        thread = self.get(self.staff_path(), self.staff_token).json()
        self.assertFalse(thread["can_write"])
        answer = self.reply()
        self.assertEqual((answer.status_code, self.error(answer)), (409, "left_class"))

    def test_messages_are_short_and_not_blank(self, push_):
        for body in ("", "   ", "x" * 501):
            answer = self.ask(body)
            self.assertEqual(answer.status_code, 400, body)
            self.assertIn("body", answer.json()["error"]["fields"])
        self.assertEqual(self.ask("x" * 500).status_code, 201)
        self.assertEqual(self.ask("  trimmed  ").json()["body"], "trimmed")

    def test_a_retry_with_the_same_key_sends_once(self, push_):
        first = self.ask(key="message-key-1")
        again = self.ask(key="message-key-1")
        self.assertEqual((first.status_code, again.status_code), (201, 201))
        self.assertEqual(again["Idempotent-Replay"], "true")
        self.assertEqual(HomeworkMessage.objects.count(), 1)
        push_.assert_called_once()

    def test_each_side_sends_at_most_thirty_a_day_in_a_thread(self, push_):
        old = timezone.now() - timedelta(days=2)
        HomeworkMessage.objects.bulk_create(
            [HomeworkMessage(homework=self.homework, student=self.student, body=f"m{i}") for i in range(30)]
            + [HomeworkMessage(homework=self.homework, student=self.student, body="old", created_at=old)]
        )
        answer = self.ask()
        self.assertEqual((answer.status_code, self.error(answer)), (429, "too_many_messages"))
        # the teacher's side has its own count
        self.assertEqual(self.reply().status_code, 201)

    def test_a_long_thread_comes_in_pages(self, push_):
        HomeworkMessage.objects.bulk_create(
            [HomeworkMessage(homework=self.homework, student=self.student, body=f"m{i}") for i in range(35)]
        )
        first = self.get(self.student_path(), self.student_token).json()
        self.assertEqual((len(first["items"]), first["items"][0]["body"]), (30, "m34"))
        rest = self.get(f"{self.student_path()}?cursor={first['next_cursor']}", self.student_token).json()
        self.assertEqual(([m["body"] for m in rest["items"]], rest["next_cursor"]), (["m4", "m3", "m2", "m1", "m0"], None))


class MessagePushTests(ChildFixtures, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        for role, account, token in (
            (AppSession.STUDENT, cls.student_account, "ExpoPushToken[student-phone]"),
            (AppSession.STAFF, cls.staff_account, "ExpoPushToken[teacher-phone]"),
            (AppSession.PARENT, cls.guardian, "ExpoPushToken[parent-phone]"),
        ):
            session_token(role, account, cls.school)
            AppSession.objects.filter(role=role).update(push_token=token)

    def test_a_message_goes_to_the_other_side_only(self):
        to_teacher = push.homework_message_messages(self.school.id, 7, self.student.id, self.staff.id, "t", "b")
        self.assertEqual([m["to"] for m in to_teacher], ["ExpoPushToken[teacher-phone]"])
        self.assertEqual({k: v for k, v in to_teacher[0]["data"].items() if k != "session"},
                         {"type": "homework_message", "homework": "7", "student": str(self.student.id)})
        to_student = push.homework_message_messages(self.school.id, 7, self.student.id, None, "t", "b")
        self.assertEqual([m["to"] for m in to_student], ["ExpoPushToken[student-phone]"])

    def test_another_schools_sessions_hear_nothing(self):
        self.assertEqual(push.homework_message_messages(self.other.id, 7, self.student.id, self.staff.id, "t", "b"), [])


class MessageDatabaseTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)
        english = subject(cls.school)
        cls.homework = Homework.objects.create(
            title="Chapter five", due_date=FUTURE, class_info=cls.school.klass, subject=english, staff=cls.staff,
            school=cls.school, description="Read the chapter.",
        )
        cls.far = MobileFixtures.student(cls.other, "Dev", last_name="Lama")
        cls.stranger_staff = Staff.objects.create(
            account=StaffAccount.objects.create_user(username="teacher-x", password=PASSWORD), school=cls.school,
            role=cls.staff.role, first_name="Hem", last_name="KC",
            primary_contact="9800000009", location="Test", permissions=[],
        )

    def refused(self, **fields):
        values = {"homework": self.homework, "student": self.student, "body": "Hello", **fields}
        with self.assertRaises(IntegrityError), transaction.atomic():
            HomeworkMessage.objects.create(**values)

    def test_a_message_has_words(self):
        self.refused(body="   ")

    def test_a_message_stays_in_the_homeworks_school(self):
        self.refused(student=self.far)
        message = HomeworkMessage.objects.create(homework=self.homework, student=self.student, body="Hello")
        with self.assertRaises(IntegrityError), transaction.atomic():
            HomeworkMessage.objects.filter(pk=message.pk).update(student=self.far)

    def test_only_the_homeworks_own_teacher_writes_as_teacher(self):
        self.refused(staff=self.stranger_staff)
        HomeworkMessage.objects.create(homework=self.homework, student=self.student, staff=self.staff, body="Hi")

    def test_a_message_is_read_after_it_was_sent(self):
        now = timezone.now()
        self.refused(created_at=now, read_at=now - timedelta(minutes=1))



@mock.patch("mobileapi.threads.push.on_homework_message")
class MessageRateTests(ChildFixtures, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.homework = Homework.objects.create(
            title="Chapter five", due_date=FUTURE, class_info=cls.school.klass, subject=subject(cls.school),
            staff=cls.staff, school=cls.school, description="Read the chapter.",
        )

    def test_one_phone_sends_at_most_ten_messages_a_minute(self, push_):
        path = f"students/{self.student.id}/homework/{self.homework.id}/messages"
        answers = [self.write("post", path, {"body": f"m{i}"}, self.student_token).status_code for i in range(11)]
        self.assertEqual(answers[:10], [201] * 10)
        self.assertEqual(answers[10], 429)
        # reading is not a write
        self.assertEqual(self.get(path, self.student_token).status_code, 200)
