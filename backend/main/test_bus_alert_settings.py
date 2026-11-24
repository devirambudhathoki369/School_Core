"""The old app's "bus is near" settings take only the school's own buses."""
from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from account.auth.AuthToken import StudentAuthToken
from account.auth.context import users_context
from main.models.Alerts import BusTrackOnAlertInfo
from mobileapi.tests.helpers import MobileFixtures


class BusAlertSettingsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)

    def setUp(self):
        self.addCleanup(users_context.set, None)
        self.client = APIClient()
        token = StudentAuthToken.objects.create(user=self.student_account).key
        self.client.credentials(HTTP_AUTHORIZATION=f"IGNITE {token}")
        buses = {self.school.id: [{"id": 7, "name": "Bus 7"}], self.other.id: [{"id": 99, "name": "Theirs"}]}
        patcher = mock.patch("main.views.alerts.BusAlertViews.assignments",
                             side_effect=lambda config, school: buses.get(school, []))
        self.assignments = patcher.start()
        self.addCleanup(patcher.stop)

    def save(self, bus_id):
        return self.client.post("/api/bus_alert_settings", {
            "user_id": self.student.id, "bus_id": bus_id, "latitude": "27.7", "longitude": "85.3", "alert_range": 500,
        }, format="json")

    def test_the_schools_own_bus_is_saved(self):
        answer = self.save(7)
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(BusTrackOnAlertInfo.objects.get(student_id=self.student).bus_id, 7)

    def test_another_schools_bus_is_refused(self):
        answer = self.save(99)
        self.assertEqual(answer.status_code, 400, answer.content)
        self.assertFalse(BusTrackOnAlertInfo.objects.exists())

    def test_when_the_buses_cannot_be_read_nothing_is_saved(self):
        self.assignments.side_effect = ValueError("bad config")
        self.assertEqual(self.save(7).status_code, 503)
        self.assertFalse(BusTrackOnAlertInfo.objects.exists())
