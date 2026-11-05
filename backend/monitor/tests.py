"""The server's own front page at "/" and its JSON health check."""

import json
import re
from unittest import mock

from django.test import RequestFactory, SimpleTestCase, override_settings

from monitor.utils.routes import api_map
from monitor.views import show_debug_toolbar

DB_UP = {"ok": True, "ms": 1.2}
DB_DOWN = {"ok": False, "ms": None}


@mock.patch("monitor.views._pending_migrations", return_value=0)
class ServerHomeTests(SimpleTestCase):
    @mock.patch("monitor.views._database", return_value=DB_UP)
    def test_health_check_answers_json(self, *_):
        response = self.client.get("/?format=json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content), {"service": "SchoolCore API", "status": "ok", "database": "ok"})

    @mock.patch("monitor.views._database", return_value=DB_DOWN)
    def test_health_check_says_503_when_the_database_is_down(self, *_):
        response = self.client.get("/", HTTP_ACCEPT="application/json")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(json.loads(response.content)["database"], "unreachable")

    @mock.patch("monitor.views._database", return_value=DB_UP)
    @override_settings(DEBUG=False)
    def test_production_page_tells_a_stranger_only_that_it_is_up(self, *_):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        html = response.content.decode()
        self.assertIn("SchoolCore API", html)
        self.assertIn("Running", html)
        # no route map, database name or versions
        self.assertNotIn('class="route"', html)
        self.assertNotIn("Django 5", html)
        self.assertIn("The route map shows on a development server", html)

    @mock.patch("monitor.views._database", return_value=DB_UP)
    @override_settings(DEBUG=True)
    def test_development_page_maps_every_service(self, *_):
        html = self.client.get("/").content.decode()
        for mount in ("/auth/", "/api/", "/accounting/", "/library/", "/hostel/", "/canteen/", "/rfid/", "/iclock/"):
            self.assertIn(f'<span class="mount">{mount}</span>', html)
        self.assertIn('class="route"', html)

    def test_only_reads(self, *_):
        self.assertEqual(self.client.post("/").status_code, 405)


class ApiMapTests(SimpleTestCase):
    def test_the_bare_api_alias_is_not_listed_twice(self):
        services, total = api_map()
        paths = [r["path"] for s in services for r in s["routes"]]
        self.assertEqual(total, len(paths))
        self.assertEqual(len(paths), len(set(paths)))
        # /api/ answers the same as /api/v1/; only the versioned paths are listed
        self.assertFalse([p for p in paths if re.match(r"^/(api|accounting|library|hostel|canteen|extra-billing)/(?!v\d+/)", p)])

    def test_server_tools_are_not_services(self):
        mounts = [s["mount"] for s in api_map()[0]]
        self.assertNotIn("/admin/", mounts)
        self.assertNotIn("/__live_usage__/", mounts)

    def test_parameters_are_marked(self):
        parts = [p for s in api_map()[0] for r in s["routes"] for p in r["parts"]]
        self.assertTrue(any(p["param"] and p["text"].startswith("<") for p in parts))


class DebugToolbarTests(SimpleTestCase):
    def test_toolbar_stays_off_the_front_page(self):
        self.assertFalse(show_debug_toolbar(RequestFactory().get("/")))
