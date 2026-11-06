"""Phase 6: push notifications to the app (mobile/SPEC.md §6, §8)."""
from unittest import mock

from django.test import TestCase

from main.methods import push as portal_push
from main.models.Guardian import Guardian, StudentGuardian
from mobileapi import push
from mobileapi.models import AppSession

from .helpers import MobileFixtures, MobileTestMixin, WriteMixin, session_token

TOKEN = "ExponentPushToken[parentPhone0001]"
OTHER = "ExponentPushToken[studentPhone002]"
STAFF = "ExponentPushToken[staffPhone00003]"


def sync(fn, *args, **kwargs):
    return fn(*args, **kwargs)


class PushTokenTests(MobileTestMixin, WriteMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)
        cls.token = session_token(AppSession.PARENT, cls.guardian, cls.school)

    def put(self, value):
        return self.api(self.token).put("/api/mobile/v1/me/push-token", {"token": value}, format="json")

    def test_a_phone_registers_and_drops_its_token(self):
        self.assertEqual(self.put(TOKEN).status_code, 204)
        self.assertEqual(AppSession.objects.get(guardian=self.guardian).push_token, TOKEN)
        self.assertEqual(self.api(self.token).delete("/api/mobile/v1/me/push-token").status_code, 204)
        self.assertIsNone(AppSession.objects.get(guardian=self.guardian).push_token)

    def test_only_an_expo_token_is_taken(self):
        for bad in ("hello", "ExponentPushToken[]", "fcm:abc", "ExponentPushToken[a b]"):
            self.assertEqual(self.put(bad).status_code, 400, bad)


@mock.patch("main.methods.push._in_background", side_effect=sync)
@mock.patch("mobileapi.push._post")
class PushRoutingTests(MobileTestMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)
        cls.parent = AppSession.objects.create(
            role=AppSession.PARENT, guardian=cls.guardian, school=cls.school, platform=1, app_version="1.0.0",
            push_token=TOKEN,
        )
        cls.own = AppSession.objects.create(
            role=AppSession.STUDENT, student_account=cls.student_account, school=cls.school, platform=1,
            app_version="1.0.0", push_token=OTHER,
        )
        cls.teacher = AppSession.objects.create(
            role=AppSession.STAFF, staff_account=cls.staff_account, school=cls.school, platform=1,
            app_version="1.0.0", push_token=STAFF,
        )

    def sent(self, post):
        return [m for call in post.call_args_list for m in call.args[0]]

    def ok(self, post):
        post.side_effect = lambda messages: [{"status": "ok"} for _ in messages]

    def test_an_absence_reaches_the_student_and_names_the_child_for_the_parent(self, post, _):
        self.ok(post)
        portal_push.notify_students_absent(self.school.id, [self.student.id])
        by_phone = {m["to"]: m for m in self.sent(post)}
        self.assertEqual(set(by_phone), {TOKEN, OTHER})
        self.assertIn("Asha Pun", by_phone[TOKEN]["body"])
        self.assertIn("अनुपस्थित", by_phone[TOKEN]["body"])
        self.assertEqual(by_phone[TOKEN]["data"], {"type": "attendance", "student": str(self.student.id),
                                                   "session": str(self.parent.id)})
        self.assertNotIn("Asha", by_phone[OTHER]["body"])  # the student hears the portal's words

    def test_a_parent_hears_once_per_child(self, post, _):
        self.ok(post)
        portal_push.notify_students(self.school.id, [self.student.id, self.sibling.id], "भुक्तानी", "रू. 500", "payment")
        to_parent = [m for m in self.sent(post) if m["to"] == TOKEN]
        self.assertEqual(sorted(m["title"] for m in to_parent), ["Asha Pun: भुक्तानी", "Bina Pun: भुक्तानी"])

    def test_one_phone_with_two_accounts_hears_once(self, post, _):
        self.ok(post)
        AppSession.objects.filter(pk=self.own.pk).update(push_token=TOKEN)  # the child signed in on the same phone
        portal_push.notify_students_checked_in(self.school.id, [self.student.id])
        self.assertEqual([m["to"] for m in self.sent(post)], [TOKEN])

    def test_unconfirmed_signed_out_or_other_school_phones_hear_nothing(self, post, _):
        self.ok(post)
        StudentGuardian.objects.filter(guardian=self.guardian).update(state=StudentGuardian.NEEDS_REVIEW,
                                                                      is_primary=False)
        AppSession.objects.filter(pk=self.own.pk).update(revoked_at="2026-11-06T00:00:00Z",
                                                         revoke_reason=AppSession.SIGNED_OUT)
        stranger = Guardian.objects.create(school=self.other, phone="9877777777")
        AppSession.objects.create(role=AppSession.PARENT, guardian=stranger, school=self.other, platform=1,
                                  app_version="1.0.0", push_token="ExponentPushToken[otherSchool0004]")
        portal_push.notify_students_absent(self.school.id, [self.student.id])
        self.assertEqual(self.sent(post), [])

    def test_a_notice_reaches_every_phone_of_the_school_once(self, post, _):
        self.ok(post)
        portal_push.notify_school_students(self.school.id, "Sports day", "On Friday.")
        self.assertEqual(sorted(m["to"] for m in self.sent(post)), sorted([TOKEN, OTHER, STAFF]))
        self.assertTrue(all(m["data"]["type"] == "notice" for m in self.sent(post)))

    def test_homework_reaches_the_class(self, post, _):
        self.ok(post)
        portal_push.notify_class_students(self.school.id, self.school.klass.id, "Chapter six", "Read it.")
        # the parent has both children in this class: one message for each
        self.assertEqual(sorted((m["to"], m["title"]) for m in self.sent(post)),
                         sorted([(TOKEN, "Asha Pun: Chapter six"), (TOKEN, "Bina Pun: Chapter six"),
                                 (OTHER, "Chapter six")]))

    def test_staff_events_reach_the_staff_member(self, post, _):
        self.ok(post)
        portal_push.notify_staff(self.school.id, [self.staff.id], "Canteen", "Lunch is ready.", "canteen")
        self.assertEqual([m["to"] for m in self.sent(post)], [STAFF])

    def test_a_phone_expo_reports_gone_loses_its_token(self, post, _):
        post.side_effect = lambda messages: [
            {"status": "error", "details": {"error": "DeviceNotRegistered"}} if m["to"] == OTHER else {"status": "ok"}
            for m in messages
        ]
        portal_push.notify_students_absent(self.school.id, [self.student.id])
        self.own.refresh_from_db()
        self.parent.refresh_from_db()
        self.assertIsNone(self.own.push_token)
        self.assertEqual(self.parent.push_token, TOKEN)

    def test_a_failing_push_service_never_breaks_the_portal(self, post, _):
        post.side_effect = OSError("no network")
        portal_push.notify_students_absent(self.school.id, [self.student.id])  # no exception

    def test_no_tokens_no_work(self, post, _):
        AppSession.objects.update(push_token=None)
        portal_push.notify_school_students(self.school.id, "Sports day", "On Friday.")
        post.assert_not_called()


class DatabaseTests(MobileTestMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)

    def test_the_database_refuses_a_token_that_is_not_expos(self):
        from django.db import IntegrityError, transaction

        session = AppSession.objects.create(role=AppSession.PARENT, guardian=self.guardian, school=self.school,
                                            platform=1, app_version="1.0.0")
        with self.assertRaises(IntegrityError), transaction.atomic():
            AppSession.objects.filter(pk=session.pk).update(push_token="not-a-token")
