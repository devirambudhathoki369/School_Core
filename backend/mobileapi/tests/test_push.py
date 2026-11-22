"""Phase 6: push notifications to the app (mobile/SPEC.md §6, §8)."""
from datetime import timedelta
from unittest import mock

import requests
from django.test import TestCase
from django.utils import timezone

from main.methods import push as portal_push
from main.models.Guardian import Guardian, StudentGuardian
from mobileapi import push
from mobileapi.models import AppSession, PushTicket

from .helpers import MobileFixtures, MobileTestMixin, WriteMixin, session_token

TOKEN = "ExponentPushToken[parentPhone0001]"
OTHER = "ExponentPushToken[studentPhone002]"
STAFF = "ExponentPushToken[staffPhone00003]"
TICKET_A = "0f8fad5b-d9cb-469f-a165-70867728950e"
TICKET_B = "7c9e6679-7425-40de-944b-e07fc1f90ae7"
TICKET_C = "16fd2706-8baf-433b-82eb-8c7fada847da"


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

    def test_accepted_pushes_are_kept_for_their_receipts(self, post, _):
        ids = iter([TICKET_A, "not-a-uuid"])
        post.side_effect = lambda messages: [{"status": "ok", "id": next(ids)} for _ in messages]
        portal_push.notify_students_absent(self.school.id, [self.student.id])
        self.assertEqual([(str(t.id), t.push_token in (TOKEN, OTHER)) for t in PushTicket.objects.all()],
                         [(TICKET_A, True)])

    def test_a_refused_push_is_reported(self, post, _):
        post.side_effect = lambda messages: [
            {"status": "error", "details": {"error": "InvalidCredentials"}} for _ in messages
        ]
        with mock.patch("mobileapi.push.sentry_sdk.capture_message") as sentry, \
                self.assertLogs("mobileapi.push", "ERROR") as logs:
            portal_push.notify_students_absent(self.school.id, [self.student.id])
        self.assertIn("InvalidCredentials x2", logs.output[0])
        sentry.assert_called_once()
        self.parent.refresh_from_db()
        self.assertEqual(self.parent.push_token, TOKEN)  # a setup error is not a phone that is gone

    def test_a_failing_push_service_never_breaks_the_portal(self, post, _):
        post.side_effect = OSError("no network")
        portal_push.notify_students_absent(self.school.id, [self.student.id])  # no exception

    def test_no_tokens_no_work(self, post, _):
        AppSession.objects.update(push_token=None)
        portal_push.notify_school_students(self.school.id, "Sports day", "On Friday.")
        post.assert_not_called()


@mock.patch("mobileapi.push._expo")
class ReceiptTests(MobileTestMixin, TestCase):
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

    def ticket(self, ticket_id, token, minutes_ago):
        PushTicket.objects.create(id=ticket_id, push_token=token,
                                  sent_at=timezone.now() - timedelta(minutes=minutes_ago))

    def test_receipts_clear_gone_phones_and_report_errors(self, expo):
        self.ticket(TICKET_A, OTHER, 20)
        self.ticket(TICKET_B, TOKEN, 20)
        self.ticket(TICKET_C, TOKEN, 5)  # too new to read
        expo.return_value = {"data": {
            TICKET_A: {"status": "error", "details": {"error": "DeviceNotRegistered"}},
            TICKET_B: {"status": "error", "details": {"error": "MismatchSenderId"}},
        }}
        with self.assertLogs("mobileapi.push", "ERROR") as logs:
            result = push.check_receipts()
        self.assertEqual(sorted(expo.call_args.args[1]["ids"]), sorted([TICKET_A, TICKET_B]))
        self.assertEqual((result["read"], result["gone"], result["failed"]), (2, 1, 1))
        self.assertIn("MismatchSenderId", logs.output[0])
        self.own.refresh_from_db()
        self.parent.refresh_from_db()
        self.assertIsNone(self.own.push_token)
        self.assertEqual(self.parent.push_token, TOKEN)
        self.assertEqual([str(t.id) for t in PushTicket.objects.all()], [TICKET_C])

    def test_a_receipt_not_ready_waits_and_a_day_old_ticket_is_dropped(self, expo):
        self.ticket(TICKET_A, TOKEN, 20)
        self.ticket(TICKET_B, TOKEN, 25 * 60)
        expo.return_value = {"data": {}}
        result = push.check_receipts()
        self.assertEqual((result["read"], result["waiting"], result["dropped"]), (0, 1, 1))
        self.assertEqual([str(t.id) for t in PushTicket.objects.all()], [TICKET_A])

    def test_an_ok_receipt_is_done_with(self, expo):
        self.ticket(TICKET_A, TOKEN, 20)
        expo.return_value = {"data": {TICKET_A: {"status": "ok"}}}
        push.check_receipts()
        self.assertFalse(PushTicket.objects.exists())

    def test_expo_down_leaves_the_tickets_for_the_next_run(self, expo):
        self.ticket(TICKET_A, TOKEN, 20)
        expo.side_effect = requests.ConnectionError("down")
        with self.assertLogs("mobileapi.push", "ERROR"):
            push.check_receipts()
        self.assertTrue(PushTicket.objects.exists())


def answer(status, body=None):
    response = mock.Mock(status_code=status, text=str(body))
    response.json.return_value = body or {}
    return response


@mock.patch("mobileapi.push.time.sleep")
@mock.patch("mobileapi.push.requests.post")
class RetryTests(TestCase):
    def test_a_busy_expo_is_tried_again_after_a_wait(self, post, sleep):
        post.side_effect = [answer(503), answer(429), answer(200, {"data": [{"status": "ok"}]})]
        self.assertEqual(push._post([{"to": TOKEN}]), [{"status": "ok"}])
        self.assertEqual(post.call_count, 3)
        self.assertEqual([c.args[0] for c in sleep.call_args_list], [2, 4])

    def test_a_bad_request_is_not_repeated_and_says_why(self, post, sleep):
        post.return_value = answer(400, {"errors": [{"code": "PUSH_TOO_MANY_EXPERIENCE_IDS"}]})
        with self.assertRaisesRegex(requests.HTTPError, "PUSH_TOO_MANY_EXPERIENCE_IDS"):
            push._post([{"to": TOKEN}])
        self.assertEqual(post.call_count, 1)
        sleep.assert_not_called()

    def test_it_gives_up_after_three_tries(self, post, sleep):
        post.side_effect = requests.ConnectionError("no network")
        with self.assertRaises(requests.ConnectionError):
            push._post([{"to": TOKEN}])
        self.assertEqual(post.call_count, 3)


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
