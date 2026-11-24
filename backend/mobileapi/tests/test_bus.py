"""The school bus in the app (mobileapi/buses.py, views/bus.py)."""
from unittest import mock

from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.test import TestCase

from account.auth.UserRole import UserRoles
from main.methods.busTracking import TrackingUnavailable
from main.models.Alerts import BusTrackOnAlertInfo
from main.serializers.alerts.BusAlertSettingsSerializer import BusAlertSettingsSerializer
from mobileapi.models import AppSession

from .helpers import MobileFixtures, MobileTestMixin, WriteMixin, session_token


def bus(bus_id, name, **changes):
    """A bus as the portal's tracking answer has it, office-only fields too."""
    return {
        "id": bus_id, "name": name, "status": "Moving", "latitude": 27.7, "longitude": 85.3,
        "updated_at": "2026-11-23T08:00:00+00:00", "stale": False, "speed_kmh": 22.5, "ignition": True,
        "satellites": 9, "gsm": 4, "distance_km": 1200.0, "course": 90.0, "address": "Ring Road", **changes,
    }


class BusTests(MobileTestMixin, WriteMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)
        cls.student_token = session_token(AppSession.STUDENT, cls.student_account, cls.school)
        cls.parent_token = session_token(AppSession.PARENT, cls.guardian, cls.school)
        cls.staff_token = session_token(AppSession.STAFF, cls.staff_account, cls.school)
        cls.stranger = MobileFixtures.student(cls.other, "Kiran")

    def setUp(self):
        super().setUp()
        self.answers = {
            self.school.id: {"buses": [bus(7, "Bus 2"), bus(3, "Bus 1")], "configured": True, "refresh_seconds": 5},
            self.other.id: {"buses": [bus(99, "Other school's bus")], "configured": True, "refresh_seconds": 5},
        }
        patcher = mock.patch("mobileapi.buses.school_buses", side_effect=self.provider)
        patcher.start()
        self.addCleanup(patcher.stop)

    def provider(self, config, school_id):
        found = self.answers[school_id]
        if isinstance(found, Exception):
            raise found
        return found

    def path(self, student=None):
        return f"students/{(student or self.student).id}/bus"

    def ride(self, bus_id, token=None, student=None):
        return self.write("put", self.path(student), {"bus_id": bus_id}, token or self.student_token)

    def test_a_student_sees_the_schools_buses(self):
        answer = self.get(self.path(), self.student_token)
        self.assertEqual(answer.status_code, 200, answer.content)
        body = answer.json()
        self.assertIsNone(body["following"])
        self.assertEqual([b["name"] for b in body["buses"]], ["Bus 1", "Bus 2"])
        # the office's details stay with the office; phones ask at most every 10 seconds
        self.assertNotIn("satellites", body["buses"][0])
        self.assertEqual(body["refresh_seconds"], 10)

    def test_only_the_students_own_bus_says_where_it_is(self):
        body = self.get(self.path(), self.student_token).json()
        self.assertTrue(all(b["latitude"] is None and b["address"] is None and b["speed_kmh"] is None
                            for b in body["buses"]))
        self.assertEqual({b["status"] for b in body["buses"]}, {"Moving"})  # enough to choose
        body = self.ride(7).json()
        mine, other = body["buses"]
        self.assertEqual((mine["id"], mine["latitude"], mine["address"]), (7, 27.7, "Ring Road"))
        self.assertIsNone(other["latitude"])

    def test_choosing_a_bus_puts_it_first_and_tells_the_office_map(self):
        cache.set("web-bus-followed", {}, 120)
        answer = self.ride(7)
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(answer.json()["following"], 7)
        self.assertEqual(answer.json()["buses"][0]["id"], 7)
        row = BusTrackOnAlertInfo.objects.get(student_id=self.student)
        self.assertEqual((row.bus_id, row.latitude, row.alert_range, row.is_active), (7, None, None, True))
        self.assertIsNone(cache.get("web-bus-followed"))
        self.assertEqual(self.get(self.path(), self.student_token).json()["following"], 7)

    def test_a_parent_chooses_for_their_own_child_only(self):
        self.assertEqual(self.ride(3, self.parent_token).json()["following"], 3)
        self.assertEqual(self.get(self.path(self.sibling), self.parent_token).status_code, 200)
        self.assertEqual(self.get(self.path(self.stranger), self.parent_token).status_code, 404)
        self.assertEqual(self.ride(99, self.parent_token, self.stranger).status_code, 404)
        self.assertEqual(self.get(self.path(self.sibling), self.student_token).status_code, 404)

    def test_only_the_schools_own_buses_can_be_chosen(self):
        answer = self.ride(99)  # another school's bus
        self.assertEqual(self.error(answer), "invalid")
        self.assertFalse(BusTrackOnAlertInfo.objects.exists())
        self.assertEqual(self.error(self.ride("seven")), "invalid")

    def test_staff_and_the_office_have_no_student_bus(self):
        self.assertEqual(self.get(self.path(), self.staff_token).status_code, 403)

    def test_a_new_bus_keeps_the_alert_set_up_in_the_old_app(self):
        BusTrackOnAlertInfo.objects.create(bus_id=3, student_id=self.student, latitude="27.7", longitude="85.3",
                                           alert_range=500, alerted_date="2026-11-23")
        self.assertEqual(self.ride(7).json()["following"], 7)
        row = BusTrackOnAlertInfo.objects.get(student_id=self.student)
        self.assertEqual((row.bus_id, row.alert_range, row.alerted_date), (7, 500, None))

    def test_no_school_bus(self):
        self.ride(7)
        answer = self.ride(None)
        self.assertIsNone(answer.json()["following"])
        self.assertFalse(BusTrackOnAlertInfo.objects.filter(student_id=self.student).exists())

    def test_a_bus_the_school_no_longer_has_is_not_shown_as_ridden(self):
        BusTrackOnAlertInfo.objects.create(bus_id=55, student_id=self.student)
        self.assertIsNone(self.get(self.path(), self.student_token).json()["following"])

    def test_when_the_gps_service_is_down_the_screen_says_so(self):
        self.answers[self.school.id] = TrackingUnavailable("The GPS service is unavailable. Please try again shortly.")
        body = self.get(self.path(), self.student_token).json()
        self.assertEqual(body["buses"], [])
        self.assertIn("unavailable", body["message"])
        self.assertEqual(self.error(self.ride(7)), "invalid")

    def test_a_school_without_buses(self):
        self.answers[self.school.id] = {"buses": [], "configured": False,
                                        "message": "No buses have been linked to your school yet."}
        body = self.get(self.path(), self.student_token).json()
        self.assertEqual((body["buses"], body["message"]), ([], "No buses have been linked to your school yet."))

    def test_a_broken_tracking_config_does_not_break_signing_in(self):
        with mock.patch("mobileapi.buses.has_buses", return_value=False), \
                mock.patch("mobileapi.buses.load_config", side_effect=TrackingUnavailable("bad file")):
            answer = self.get("me", self.student_token)
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertFalse(answer.json()["bus_tracking"])

    def test_me_says_whether_the_school_has_buses(self):
        with mock.patch("mobileapi.buses.has_buses", return_value=True):
            self.assertTrue(self.get("me", self.student_token).json()["bus_tracking"])
            self.assertTrue(self.get("me", self.parent_token).json()["bus_tracking"])
            self.assertFalse(self.get("me", self.staff_token).json()["bus_tracking"])
        with mock.patch("mobileapi.buses.has_buses", return_value=False), \
                mock.patch("main.methods.push._in_background") as warm:
            self.assertFalse(self.get("me", self.student_token).json()["bus_tracking"])
            self.get("me", self.student_token)
        self.assertEqual(warm.call_count, 1)  # the provider's list is read once, behind the answer


class BusRowTests(MobileTestMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)

    def test_the_alert_spot_and_range_go_together(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            BusTrackOnAlertInfo.objects.create(bus_id=3, student_id=self.student, latitude="27.7", longitude="85.3")

    def test_the_old_apps_alert_must_be_whole(self):
        row = BusTrackOnAlertInfo.objects.create(bus_id=3, student_id=self.student)

        def save(data, instance=None):
            return BusAlertSettingsSerializer(
                instance=instance, data={"role": UserRoles.ROLE_STUDENT, "user_id": self.student.id, **data},
                partial=instance is not None,
            )

        self.assertFalse(save({"latitude": "27.7"}, row).is_valid())
        self.assertTrue(save({"latitude": "27.7", "longitude": "85.3", "alert_range": 400}, row).is_valid())
        self.assertFalse(save({"bus_id": 3}).is_valid())  # a new alert needs its spot and range
        self.assertTrue(save({"bus_id": 3, "latitude": "27.7", "longitude": "85.3", "alert_range": 400}).is_valid())
