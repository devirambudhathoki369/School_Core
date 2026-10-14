import json
import os
from datetime import timedelta
from tempfile import TemporaryDirectory
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import requests
from django.core.cache import cache as held_answers
from django.test import SimpleTestCase
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.test import APIRequestFactory

from account.models import AdminAccount, StaffAccount, StudentAccount
from main.methods.busTracking import (
    answered_at_once, load_config, school_buses, fetch_positions, assignments, bus_state, clock_error, connection,
    device_names, grouped_buses, has_buses, place_names, school_of_group, with_tracking_flag, TrackingUnavailable,
)
from main.methods.busTracking import _provider_list, timestamp, GROUPS_CACHE_SECONDS, GROUPS_PAUSE_SECONDS
from main.methods.busTrackingHistory import school_history
from main.views.BusTrackingView import BusTrackingView, BusTrackingHistoryView

FOLLOWED = "main.methods.busTracking.followed_buses"
GROUPED = "main.methods.busTracking.grouped_buses"
PROVIDER = "main.methods.busTracking._provider_list"
POSITIONS = "main.methods.busTracking.fetch_positions"
NAMES = "main.methods.busTracking.device_names"
PLACES = "main.methods.busTracking.place_names"
HISTORY = "main.methods.busTrackingHistory"


class BusTrackingTests(SimpleTestCase):
    def setUp(self):
        held_answers.clear()
        environment = patch.dict("os.environ", {"TRACKON_USERNAME": "", "TRACKON_PASSWORD": ""})
        environment.start()
        self.addCleanup(environment.stop)
        # Missing keys and empty values both mean no Basic Auth was selected.
        os.environ.pop("TRACKON_USERNAME")
        os.environ.pop("TRACKON_PASSWORD")
        self.config = {"schools": {"14": [{"id": 10, "name": "My school bus"}], "37": [{"id": 20, "name": "Other school bus"}]}}
        self.position = {"deviceId": 10, "latitude": 28.1, "longitude": 82.3,
                         "fixTime": timezone.now().isoformat(), "valid": True, "speed": 10,
                         "attributes": {"ignition": True, "totalDistance": 120500, "sat": 9, "rssi": 4, "secret": "private"}}
        # Nobody follows anything in the app unless a test says so, and the
        # provider gives no names and no groups: the operator's file is then
        # the only source. Its geocoder is not asked either, so no test reaches
        # the network.
        for target, value in ((FOLLOWED, {}), (GROUPED, {}), (NAMES, {}), (PLACES, {})):
            patcher = patch(target, return_value=value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_only_assigned_devices_and_safe_fields_are_returned(self):
        other = {**self.position, "deviceId": 20, "address": "Other school location"}
        with patch(POSITIONS, return_value=[self.position, other]):
            result = school_buses(self.config, 14)
        self.assertEqual([bus["id"] for bus in result["buses"]], [10])
        bus = result["buses"][0]
        self.assertEqual(bus["speed_kmh"], 18.5)
        self.assertEqual(bus["distance_km"], 120.5)
        self.assertEqual(bus["status"], "Moving")
        self.assertEqual((bus["satellites"], bus["gsm"]), (9, 4))
        self.assertNotIn("attributes", bus)
        self.assertNotIn("Other school location", json.dumps(result))
        self.assertEqual(result["refresh_seconds"], 5)

    def test_no_assignment_never_calls_provider(self):
        with patch(POSITIONS) as fetch:
            result = school_buses(self.config, 99)
        self.assertFalse(result["configured"])
        self.assertEqual(result["buses"], [])
        fetch.assert_not_called()

    def test_missing_invalid_and_old_positions_are_not_live(self):
        for position in ({}, {**self.position, "valid": False}, {**self.position, "latitude": 999},
                         {**self.position, "latitude": float("nan")},
                         {**self.position, "fixTime": (timezone.now() - timedelta(hours=3)).isoformat()}):
            with self.subTest(position=position):
                with patch(POSITIONS, return_value=[position]):
                    bus = school_buses(self.config, 14)["buses"][0]
                self.assertTrue(bus["stale"])
                self.assertIn(bus["status"], ["Offline", "No signal"])
                self.assertIsNone(bus["speed_kmh"])

    def test_latest_fix_wins_even_if_provider_order_is_reversed(self):
        old = {**self.position, "speed": 0, "fixTime": (timezone.now() - timedelta(hours=3)).isoformat()}
        with patch(POSITIONS, return_value=[self.position, old]):
            self.assertEqual(school_buses(self.config, 14)["buses"][0]["status"], "Moving")

    # -- what a position may be called ------------------------------------
    def state(self, minutes=0, speed=0, ignition=False, **extra):
        position = {**self.position, "speed": speed, "fixTime": (timezone.now() - timedelta(minutes=minutes)).isoformat(),
                    "attributes": {"ignition": ignition}, **extra}
        return bus_state(position, timezone.now())

    def test_a_fresh_fix_is_moving_idling_or_stopped(self):
        self.assertEqual(self.state(speed=10, ignition=True)["status"], "Moving")
        self.assertEqual(self.state(speed=0.5, ignition=True)["status"], "Idling")
        self.assertEqual(self.state(speed=0, ignition=False)["status"], "Stopped")
        self.assertEqual(self.state(speed=0, ignition=None)["status"], "Stopped")
        self.assertFalse(self.state()["stale"])

    def test_a_parked_bus_whose_tracker_sleeps_is_stopped_not_lost(self):
        parked = self.state(minutes=600, speed=0, ignition=False)
        self.assertEqual((parked["status"], parked["stale"], parked["speed_kmh"]), ("Stopped", True, 0.0))
        self.assertIsNotNone(parked["latitude"])

    def test_a_bus_that_went_quiet_on_the_road_has_no_signal(self):
        for speed, ignition in ((12, True), (12, False), (0, True)):
            quiet = self.state(minutes=6, speed=speed, ignition=ignition)
            self.assertEqual((quiet["status"], quiet["stale"]), ("No signal", True))
            # the speed of an old fix is not the speed now
            self.assertIsNone(quiet["speed_kmh"])

    def test_a_device_silent_for_a_day_is_offline(self):
        self.assertEqual(self.state(minutes=60 * 25)["status"], "Offline")
        self.assertEqual(bus_state({}, timezone.now())["status"], "Offline")
        self.assertIsNone(bus_state({}, timezone.now())["latitude"])

    # -- whose bus it is --------------------------------------------------
    def test_a_bus_followed_by_one_school_is_that_schools(self):
        followed = {501: {14}, 502: {14}, 601: {37}}
        with patch(FOLLOWED, return_value=followed):
            self.assertEqual([bus["id"] for bus in assignments({"schools": {}}, 14)], [501, 502])
            self.assertEqual([bus["id"] for bus in assignments({"schools": {}}, 37)], [601])
            self.assertEqual(assignments({"schools": {}}, 99), [])

    def test_a_bus_followed_from_two_schools_is_shown_to_neither(self):
        with patch(FOLLOWED, return_value={700: {14, 37}}):
            self.assertEqual(assignments({"schools": {}}, 14), [])
            self.assertEqual(assignments({"schools": {}}, 37), [])

    def test_the_operators_link_settles_it(self):
        config = {"schools": {"37": [{"id": 700, "name": "Shared claim"}, {"id": 501}]}}
        with patch(FOLLOWED, return_value={700: {14, 37}, 501: {14}}):
            # 700 was claimed from both; 501 is followed only at school 14 but
            # was written down for school 37 — the file wins both times.
            self.assertEqual(assignments(config, 14), [])
            self.assertEqual([bus["id"] for bus in assignments(config, 37)], [700, 501])

    def test_another_schools_followed_bus_never_reaches_the_response(self):
        mine = {**self.position, "deviceId": 501}
        theirs = {**self.position, "deviceId": 601, "address": "Other school location"}
        with patch(FOLLOWED, return_value={501: {14}, 601: {37}}), patch(POSITIONS, return_value=[mine, theirs]):
            result = school_buses({"schools": {}}, 14)
        self.assertEqual([bus["id"] for bus in result["buses"]], [501])
        self.assertNotIn("Other school location", json.dumps(result))

    def test_names_come_from_the_provider_and_fall_back_to_the_id(self):
        positions = [{**self.position, "deviceId": 501}, {**self.position, "deviceId": 502}]
        with patch(FOLLOWED, return_value={501: {14}, 502: {14}}), patch(POSITIONS, return_value=positions), \
                patch(NAMES, return_value={501: "Divine Sano Bus"}):
            names = [bus["name"] for bus in school_buses({"schools": {}}, 14)["buses"]]
        self.assertEqual(names, ["Bus 502", "Divine Sano Bus"])

    def test_a_provider_that_will_not_list_devices_costs_only_the_names(self):
        # `device_names` here is the real function (imported above); only the
        # module's own reference to it is patched in setUp.
        with patch("main.methods.busTracking._provider_list", side_effect=TrackingUnavailable("down")):
            self.assertEqual(device_names({"api_url": "https://gps.example.test/api", "token": "t"}), {})

    def test_the_menu_flag_follows_the_buses_and_never_raises(self):
        with patch(FOLLOWED, return_value={501: {14}}), patch("main.methods.busTracking.load_config", return_value={"schools": {}}):
            self.assertTrue(has_buses(14))
            self.assertFalse(has_buses(37))
            self.assertFalse(has_buses(None))
            self.assertEqual(with_tracking_flag({"id": 14}, 14), {"id": 14, "uses_bus_tracking": True})
            self.assertIsNone(with_tracking_flag(None, 14))
        with patch("main.methods.busTracking.load_config", side_effect=TrackingUnavailable("broken file")):
            self.assertFalse(has_buses(14))

    def test_the_connection_is_the_files_or_the_alert_jobs(self):
        env = {"TRACKON_API": "https://alerts.example.test/api/", "TRACKON_TOKEN": "alert-token"}
        with patch.dict("os.environ", env):
            self.assertEqual(connection({"schools": {}}), ("https://alerts.example.test/api", {"headers": {"Authorization": "Bearer alert-token"}}))
            own = {"api_url": "https://gps.example.test/api", "token": "own-token"}
            self.assertEqual(connection(own), ("https://gps.example.test/api", {"headers": {"Authorization": "Bearer own-token"}}))
        with patch.dict("os.environ", {"TRACKON_API": "http://plain.example.test/api", "TRACKON_TOKEN": "x"}):
            with self.assertRaises(TrackingUnavailable):
                connection({"schools": {}})

    def test_basic_auth_takes_precedence_over_legacy_token(self):
        env = {"TRACKON_API": "https://gps.example.test/api", "TRACKON_USERNAME": "account@example.test",
               "TRACKON_PASSWORD": "private-password", "TRACKON_TOKEN": "old-token"}
        with patch.dict("os.environ", env):
            self.assertEqual(connection({}), (env["TRACKON_API"], {"auth": (env["TRACKON_USERNAME"], env["TRACKON_PASSWORD"])}))
            # File credentials are a complete override, even when the
            # environment uses a different authentication method.
            self.assertEqual(connection({"token": "file-token"})[1], {"headers": {"Authorization": "Bearer file-token"}})
            self.assertEqual(connection({"username": "file-user", "password": "file-password"})[1],
                             {"auth": ("file-user", "file-password")})
            for config in ({"username": "file-user"}, {"password": "file-password"}, {"username": "", "password": ""}):
                with self.subTest(config=config), self.assertRaises(TrackingUnavailable):
                    connection(config)
        with patch.dict("os.environ", {"TRACKON_API": env["TRACKON_API"], "TRACKON_USERNAME": "account", "TRACKON_TOKEN": "old-token"}):
            with self.assertRaises(TrackingUnavailable):
                connection({})

    def test_basic_auth_fetch_is_cached_per_account_without_exposing_credentials(self):
        config = {"api_url": "https://gps.example.test/api", "username": "account", "password": "private-password"}
        with patch("main.methods.busTracking.cache") as cache, patch("main.methods.busTracking.requests.get") as get:
            cache.get.return_value = None
            get.return_value = Mock(status_code=200)
            get.return_value.json.return_value = [self.position]
            self.assertEqual(fetch_positions(config), [self.position])
            get.assert_called_once_with("https://gps.example.test/api/positions", auth=("account", "private-password"),
                                        timeout=(5, 15), allow_redirects=False)
            first_key = cache.set.call_args.args[0]
            self.assertNotIn("private-password", first_key)
            fetch_positions({**config, "password": "replacement-password"})
            self.assertNotEqual(first_key, cache.set.call_args.args[0])
            fetch_positions({**config, "username": "another-account"})
            self.assertNotEqual(first_key, cache.set.call_args.args[0])
            get.reset_mock()
            cache.get.return_value = [self.position]
            self.assertEqual(fetch_positions(config), [self.position])
            get.assert_not_called()

    def test_basic_auth_rejection_does_not_fallback_or_expose_password(self):
        config = {"api_url": "https://gps.example.test/api", "username": "account", "password": "private-password", "token": "old-token"}
        with patch("main.methods.busTracking.cache") as cache, patch("main.methods.busTracking.requests.get") as get:
            cache.get.return_value = None
            for status in (401, 403, 302):
                get.reset_mock()
                get.return_value = Mock(status_code=status)
                with self.subTest(status=status), self.assertRaises(TrackingUnavailable) as error:
                    fetch_positions(config)
                self.assertNotIn("private-password", str(error.exception))
                get.assert_called_once()
                cache.set.assert_not_called()

    def test_duplicate_school_assignments_fail_closed(self):
        with TemporaryDirectory() as folder:
            path = Path(folder) / 'bus_tracking.json'
            path.write_text(json.dumps({"schools": {"14": [{"id": 10}], "37": [{"id": 10}]}}))
            with patch.dict('os.environ', {"BUS_TRACKING_CONFIG_FILE": str(path)}):
                with self.assertRaises(TrackingUnavailable):
                    load_config()

    def test_provider_outage_does_not_leak_credentials(self):
        config = {"api_url": "https://gps.example.test/api", "token": "private-token"}
        with patch("main.methods.busTracking.cache") as cache, patch("main.methods.busTracking.requests.get") as get:
            cache.get.return_value = None
            get.return_value = Mock(status_code=401)
            with self.assertRaises(TrackingUnavailable) as error:
                fetch_positions(config)
            self.assertNotIn("private-token", str(error.exception))
            # a refusal is named as one: it is the operator's to fix, not a blip
            self.assertIn("credentials", str(error.exception))
            self.assertEqual(get.call_args.kwargs["timeout"], (5, 15))
            self.assertTrue(get.call_args.args[0].endswith('/positions'))
            cache.set.assert_not_called()
            get.return_value = Mock(status_code=502)
            with self.assertRaises(TrackingUnavailable) as error:
                fetch_positions(config)
            self.assertIn("unavailable", str(error.exception))
            get.side_effect = requests.Timeout()
            with self.assertRaises(TrackingUnavailable) as error:
                fetch_positions(config)
            self.assertIn("in time", str(error.exception))
            get.side_effect = requests.ConnectionError("https://gps.example.test/api/positions?token=private-token")
            with self.assertRaises(TrackingUnavailable) as error:
                fetch_positions(config)
            self.assertNotIn("private-token", str(error.exception))

    def test_an_unreadable_provider_still_lists_the_schools_own_buses(self):
        with patch(POSITIONS, side_effect=TrackingUnavailable("The GPS service did not accept the server's access token.")), \
                patch(NAMES) as names:
            result = school_buses(self.config, 14)
        names.assert_not_called()
        self.assertTrue(result["unavailable"])
        self.assertIn("access token", result["message"])
        self.assertEqual([(bus["id"], bus["status"], bus["latitude"]) for bus in result["buses"]], [(10, "Tracking unavailable", None)])

    # -- where a bus is, in words -----------------------------------------
    def geocoder(self, answers):
        """The module's cache as a dict, and a provider that answers in turn."""
        memory = {}
        cache = patch("main.methods.busTracking.cache").start()
        self.addCleanup(patch.stopall)
        cache.get.side_effect = memory.get
        cache.get_many.side_effect = lambda keys: {key: memory[key] for key in keys if key in memory}
        cache.set.side_effect = lambda key, value, seconds: memory.__setitem__(key, value)
        get = patch("main.methods.busTracking.requests.get").start()
        get.side_effect = answers
        return get, cache

    def test_the_address_is_the_geocoders_and_reaches_only_the_right_bus(self):
        named = Mock(status_code=200, content="Chaupari,  Babai-06,\nDang, Nepal ".encode())
        with patch(POSITIONS, return_value=[{**self.position, "address": "यो ठाउँ"}]), \
                patch(PLACES, return_value={(28.1, 82.3): "Chaupari, Babai-06, Dang, Nepal"}) as places:
            bus = school_buses(self.config, 14)["buses"][0]
        self.assertEqual(bus["address"], "Chaupari, Babai-06, Dang, Nepal")
        places.assert_called_once_with(self.config, {(28.1, 82.3)})
        # ...and the geocoder's text is tidied, asked for with the account's own login.
        config = {"api_url": "https://gps.example.test/api", "username": "account", "password": "private-password"}
        get, _ = self.geocoder([named])
        self.assertEqual(place_names(config, {(28.1, 82.3)}), {(28.1, 82.3): "Chaupari, Babai-06, Dang, Nepal"})
        get.assert_called_once_with("https://gps.example.test/api/server/geocode", params={"latitude": 28.1, "longitude": 82.3},
                                    auth=("account", "private-password"), timeout=(3, 4), allow_redirects=False)

    def test_the_fixes_own_address_stands_in_when_the_geocoder_is_silent(self):
        with patch(POSITIONS, return_value=[{**self.position, "address": "यो ठाउँ"}]):
            self.assertEqual(school_buses(self.config, 14)["buses"][0]["address"], "यो ठाउँ")
        # A bus with no position is never geocoded.
        with patch(POSITIONS, return_value=[{**self.position, "valid": False}]), patch(PLACES, return_value={}) as places:
            self.assertEqual(school_buses(self.config, 14)["buses"][0]["address"], "")
        places.assert_called_once_with(self.config, set())

    def test_a_square_is_asked_about_once(self):
        config = {"api_url": "https://gps.example.test/api", "token": "private-token"}
        get, cache = self.geocoder([Mock(status_code=200, content=b"School gate, Tulsipur")])
        here, beside, away = (28.10001, 82.30001), (28.10002, 82.30003), (28.2, 82.3)
        # Two buses in the same yard cost one question...
        self.assertEqual(place_names(config, {here, beside}), {here: "School gate, Tulsipur", beside: "School gate, Tulsipur"})
        self.assertEqual(get.call_count, 1)
        # ...and the next poll costs none.
        self.assertEqual(place_names(config, {here}), {here: "School gate, Tulsipur"})
        self.assertEqual(get.call_count, 1)
        self.assertEqual(cache.set.call_args.args[2], 30 * 24 * 60 * 60)
        # A spot with no address is remembered too, but only briefly.
        get.side_effect = [Mock(status_code=204, content=b"")]
        self.assertEqual(place_names(config, {away}), {})
        self.assertEqual(place_names(config, {away}), {})
        self.assertEqual(get.call_count, 2)
        self.assertEqual(cache.set.call_args.args[2], 300)
        self.assertEqual(place_names(config, set()), {})

    def test_a_geocoder_that_fails_is_left_alone_and_costs_only_the_address(self):
        config = {"api_url": "https://gps.example.test/api", "token": "private-token"}
        here, there = (28.1, 82.3), (28.2, 82.4)
        for failure in (requests.Timeout("https://gps.example.test/api?token=private-token"), Mock(status_code=401), Mock(status_code=502)):
            with self.subTest(failure=failure):
                get, cache = self.geocoder([failure])
                with self.assertLogs("main.methods.busTracking", "WARNING") as logged:
                    self.assertEqual(place_names(config, {here}), {})
                self.assertNotIn("private-token", " ".join(logged.output))
                # Nothing is remembered about the spot; the geocoder is rested.
                self.assertEqual([call.args[:1] + call.args[2:] for call in cache.set.call_args_list], [("web-bus-address-paused", 60)])
                self.assertEqual(place_names(config, {here, there}), {})
                self.assertEqual(get.call_count, 1)
                patch.stopall()
        # No connection configured: nothing is asked, nothing raised.
        get, _ = self.geocoder([])
        self.assertEqual(place_names({}, {here}), {})
        get.assert_not_called()

    def admin_request(self, school=None):
        return SimpleNamespace(user=AdminAccount(pk=1), query_params={} if school is None else {"school": school})

    def test_authenticated_school_is_derived_from_account(self):
        with patch("main.views.BusTrackingView.SchoolAdmin.objects.filter") as schools, patch("main.views.BusTrackingView.load_config", return_value=self.config), patch("main.views.BusTrackingView.school_buses", return_value={"buses": []}) as buses:
            schools.return_value.values_list.return_value.first.return_value = 14
            response = BusTrackingView().get(self.admin_request())
            self.assertEqual(response.status_code, 200)
            buses.assert_called_once_with(self.config, 14)
            self.assertEqual(response['Cache-Control'], 'private, no-store')

    def test_other_school_query_is_rejected_before_provider_access(self):
        with patch("main.views.BusTrackingView.SchoolAdmin.objects.filter") as schools, patch("main.views.BusTrackingView.load_config") as config:
            schools.return_value.values_list.return_value.first.return_value = 14
            for school in ('37', 'invalid', ''):
                self.assertEqual(BusTrackingView().get(self.admin_request(school)).status_code, 403)
            config.assert_not_called()

    def test_students_and_staff_without_permission_cannot_read_positions(self):
        with patch("main.views.BusTrackingView.Staff.objects.filter") as staff, patch("main.views.BusTrackingView.load_config") as config:
            staff.return_value.first.return_value = SimpleNamespace(school_id=14, permissions=[])
            for user in (StudentAccount(pk=1), StaffAccount(pk=1)):
                response = BusTrackingView().get(SimpleNamespace(user=user, query_params={}))
                self.assertEqual(response.status_code, 403)
            config.assert_not_called()

    def test_staff_need_the_bus_tracking_permission_itself(self):
        request = SimpleNamespace(user=StaffAccount(pk=1), query_params={})
        with patch("main.views.BusTrackingView.Staff.objects.filter") as staff, patch("main.views.BusTrackingView.load_config"), \
                patch("main.views.BusTrackingView.school_buses", return_value={"buses": [], "configured": False}) as buses:
            # Bus Stations (507) opened the page before tracking had a permission of its own.
            staff.return_value.first.return_value = SimpleNamespace(school_id=14, permissions=[507])
            self.assertEqual(BusTrackingView().get(request).status_code, 403)
            buses.assert_not_called()
            staff.return_value.first.return_value = SimpleNamespace(school_id=14, permissions=[507, 511])
            self.assertEqual(BusTrackingView().get(request).status_code, 200)
            self.assertEqual(buses.call_args.args[1], 14)

    def test_an_open_page_is_answered_from_the_last_answer_and_refreshed_behind(self):
        asked = Mock(side_effect=[{"n": 1}, {"n": 2}, {"n": 3}])
        with patch("main.methods.push._in_background") as behind, patch("main.methods.busTracking.time.time") as clock:
            clock.return_value = 1000.0
            # Nothing in hand: the first to ask waits for the provider.
            self.assertEqual(answered_at_once("t", asked), {"n": 1})
            # A moment later the same answer is given and nothing is fetched.
            clock.return_value = 1001.0
            self.assertEqual(answered_at_once("t", asked), {"n": 1})
            behind.assert_not_called()
            # The next poll is still answered at once - and one fetch is started
            # behind it, not one per page that asks meanwhile.
            clock.return_value = 1005.0
            self.assertEqual(answered_at_once("t", asked), {"n": 1})
            self.assertEqual(answered_at_once("t", asked), {"n": 1})
            self.assertEqual(asked.call_count, 1)
            behind.assert_called_once()
            fetch, *arguments = behind.call_args.args
            fetch(*arguments)
            self.assertEqual(answered_at_once("t", asked), {"n": 2})
            # Left alone too long, the answer in hand is shown to nobody.
            clock.return_value = 1005.0 + 21
            self.assertEqual(answered_at_once("t", asked), {"n": 3})
            # A provider that fails behind the page leaves the next fetch free to start.
            clock.return_value = 1005.0 + 21 + 5
            answered_at_once("t", Mock(side_effect=RuntimeError))
            with self.assertRaises(RuntimeError):
                behind.call_args.args[0](*behind.call_args.args[1:])
            self.assertTrue(held_answers.add("t:fetching", 1, 1))

    def test_anonymous_request_denied(self):
        response = BusTrackingView.as_view()(APIRequestFactory().get('/api/bus-tracking'))
        self.assertIn(response.status_code, (401, 403))

    def test_commands_and_writes_are_not_supported(self):
        self.assertEqual(BusTrackingView.http_method_names, ['get', 'head', 'options'])


class BusGroupTests(SimpleTestCase):
    """A bus is its school's from the day the provider files it under the
    school's group, followed in the app or not.

    School 25, 2083-06-22: its second bus had been fitted and filed under
    "Jivanpremy_25", but nobody followed it in the app yet, so the page showed
    one bus.
    """

    GROUPS = [{"id": 92, "name": "Jivanpremy_25"}, {"id": 190, "name": "Midwest_66"}, {"id": 7, "name": "Spare trackers"}]
    DEVICES = [
        {"id": 6766, "name": "Jeevanpremi Bus: 1002", "groupId": 92},
        {"id": 13145, "name": " Jivanpremy Bus 2 ", "groupId": 92},
        {"id": 10490, "name": "Mid West BUS 848", "groupId": 190},
        {"id": 10866, "name": "Midwest point bus 2", "groupId": 0},
        {"id": 555, "name": "On the shelf", "groupId": 7},
        {"id": 556, "name": "", "groupId": 190},
        {"id": "13146", "name": "Not a device id", "groupId": 92},
        {"id": 557, "name": "Odd group", "groupId": [92]},
    ]

    def setUp(self):
        held_answers.clear()
        self.addCleanup(held_answers.clear)
        self.config = {"schools": {}, "api_url": "https://gps.example.test/api", "token": "t"}
        self.asked = []
        self.down = False
        self.followed = {6766: {25}, 10490: {66}}

        def read(config, path, seconds, params=None):
            self.asked.append(path)
            if self.down:
                raise TrackingUnavailable("down")
            return {"/groups": self.GROUPS, "/devices": self.DEVICES}[path]

        for target, arguments in ((PROVIDER, {"side_effect": read}), (FOLLOWED, {"side_effect": lambda: self.followed})):
            patcher = patch(target, **arguments)
            patcher.start()
            self.addCleanup(patcher.stop)

    def later(self, seconds):
        clock = patch("main.methods.busTracking.time.time", return_value=timezone.now().timestamp() + seconds)
        clock.start()
        self.addCleanup(clock.stop)

    def ids(self, school, config=None):
        return [bus["id"] for bus in assignments(config or self.config, school)]

    def test_the_school_is_the_number_a_group_name_ends_in(self):
        for name, school in (("Jivanpremy_25", 25), ("SCHOOL_39", 39), (" purandharacademy_67 ", 67), ("Divine_Temple_45", 45)):
            self.assertEqual(school_of_group(name), school)
        for name in ("Spare trackers", "Fleet_", "_", "Fleet_0", "Fleet_2a", "Fleet 25", "25", "Fleet_-5", "Fleet_²", "Fleet_1234567890", "", None, 25):
            self.assertIsNone(school_of_group(name), name)

    def test_a_bus_nobody_follows_yet_is_its_groups_schools(self):
        self.assertEqual(assignments(self.config, 25), [
            {"id": 6766, "name": "Jeevanpremi Bus: 1002"}, {"id": 13145, "name": "Jivanpremy Bus 2"},
        ])
        self.assertEqual(assignments(self.config, 66), [{"id": 556, "name": None}, {"id": 10490, "name": "Mid West BUS 848"}])
        # in no group, in a group that names no school, or not a device at all
        for school in (0, 7, 92, 190):
            self.assertEqual(self.ids(school), [])
        self.assertEqual(sorted(grouped_buses(self.config)), [556, 6766, 10490, 13145])

    def test_the_group_outranks_who_follows_and_the_file_outranks_the_group(self):
        # 13145 is followed only from school 66 and from two schools at once:
        # it is filed under school 25, and that is whose it is.
        for schools in ({66}, {25, 66}):
            self.followed = {13145: schools}
            self.assertEqual((self.ids(25), self.ids(66)), ([6766, 13145], [556, 10490]))
        # 10866 is in no group: there, who follows it still decides
        self.followed = {10866: {66}}
        self.assertEqual(self.ids(66), [556, 10490, 10866])
        self.followed = {10866: {25, 66}}
        self.assertEqual((self.ids(25), self.ids(66)), ([6766, 13145], [556, 10490]))
        linked = {**self.config, "schools": {"66": [{"id": 13145, "name": "Lent to Mid West"}]}}
        self.assertEqual((self.ids(25, linked), self.ids(66, linked)), ([6766], [13145, 556, 10490]))

    def test_the_new_bus_is_on_the_page_and_no_other_schools(self):
        fix = {"latitude": 28.137, "longitude": 82.293, "fixTime": timezone.now().isoformat(), "valid": True, "speed": 0, "attributes": {}}
        positions = [{**fix, "deviceId": bus, "address": f"where {bus} is"} for bus in (6766, 13145, 10490, 10866, 555)]
        with patch(POSITIONS, return_value=positions), patch(PLACES, return_value={}), patch(NAMES) as names:
            result = school_buses(self.config, 25)
        self.assertEqual([(bus["id"], bus["name"], bus["address"]) for bus in result["buses"]], [
            (6766, "Jeevanpremi Bus: 1002", "where 6766 is"), (13145, "Jivanpremy Bus 2", "where 13145 is"),
        ])
        for other in ("Mid West", "Midwest", "10490", "10866", "On the shelf"):
            self.assertNotIn(other, json.dumps(result))
        # every bus came with its name, so the device list is not read again
        names.assert_not_called()

    def test_the_groups_are_read_once_in_a_while_not_on_every_refresh(self):
        for _ in range(5):
            self.ids(25)
        self.assertEqual(sorted(self.asked), ["/devices", "/groups"])
        self.later(GROUPS_CACHE_SECONDS + 1)
        self.ids(25)
        self.assertEqual(sorted(self.asked), ["/devices", "/devices", "/groups", "/groups"])

    def test_a_bus_filed_at_the_provider_is_on_the_page_within_seconds(self):
        self.assertLessEqual(GROUPS_CACHE_SECONDS, 15)
        fitted = {"id": 14000, "name": "Jivanpremy Bus 3", "groupId": 92}
        self.assertEqual(self.ids(25), [6766, 13145])
        with patch.object(BusGroupTests, "DEVICES", self.DEVICES + [fitted]):
            # an open page asks again every few seconds: nothing yet...
            self.assertEqual(self.ids(25), [6766, 13145])
            self.later(GROUPS_CACHE_SECONDS + 1)
            # ...and there it is, with nobody having reloaded or linked anything
            self.assertEqual(assignments(self.config, 25)[-1], {"id": 14000, "name": "Jivanpremy Bus 3"})
            self.assertEqual(self.ids(66), [556, 10490])

    def test_a_provider_that_cannot_be_read_keeps_what_its_groups_said_last(self):
        self.assertEqual(self.ids(25), [6766, 13145])
        self.down = True
        self.later(GROUPS_CACHE_SECONDS + 1)
        self.assertEqual(self.ids(25), [6766, 13145])
        asked = len(self.asked)
        self.assertGreater(asked, 2)
        # ...and it is left alone for a while, not asked on every refresh
        self.later(GROUPS_CACHE_SECONDS * 2 + 1)
        self.assertLess(GROUPS_CACHE_SECONDS * 2 + 1, GROUPS_PAUSE_SECONDS)
        self.assertEqual(self.ids(25), [6766, 13145])
        self.assertEqual(len(self.asked), asked)
        with patch(POSITIONS, side_effect=TrackingUnavailable("down")):
            result = school_buses(self.config, 25)
        self.assertEqual([(bus["name"], bus["status"]) for bus in result["buses"]], [
            ("Jeevanpremi Bus: 1002", "Tracking unavailable"), ("Jivanpremy Bus 2", "Tracking unavailable"),
        ])

    def test_a_provider_never_read_leaves_the_followed_buses(self):
        self.down = True
        self.assertEqual((self.ids(25), self.ids(66)), ([6766], [10490]))
        self.assertLessEqual(len(self.asked), 2)

    def test_one_reader_at_a_time(self):
        self.ids(25)
        self.later(GROUPS_CACHE_SECONDS + 1)
        key = next(k.split(":", 2)[-1] for k in held_answers._cache if "web-bus-grouped:" in k)
        held_answers.add(f"{key}:asking", 1, 60)     # another worker is reading
        self.assertEqual(self.ids(25), [6766, 13145])
        self.assertEqual(len(self.asked), 2)

    def test_signing_in_never_waits_on_the_provider(self):
        with patch("main.methods.busTracking.load_config", return_value=self.config):
            self.followed = {}
            self.assertFalse(has_buses(25))
            self.assertEqual(self.asked, [])
            self.ids(25)                       # the page was opened: the groups are known
            self.asked.clear()
            self.later(GROUPS_CACHE_SECONDS + 1)
            self.assertTrue(has_buses(25))
            self.assertFalse(has_buses(14))
            self.assertEqual(self.asked, [])

    def test_no_connection_no_groups(self):
        self.assertEqual(grouped_buses({"schools": {}}), {})
        self.assertEqual(self.asked, [])


class TrackerClockTests(SimpleTestCase):
    """A tracker set to the wrong time zone is still a bus that is there now.

    School 25, 2083-06-22: the second bus's tracker stamped every fix 5 h 45 min
    behind. The provider heard from it every few seconds and its own panel drew
    it live, but our page read each fix as hours old: "No signal" on the road,
    no speed.
    """

    def setUp(self):
        held_answers.clear()
        self.addCleanup(held_answers.clear)
        self.now = timezone.now()
        self.config = {"schools": {"25": [{"id": 13145, "name": "Jivanpremy Bus 2"}]}}
        for target, value in ((FOLLOWED, {}), (GROUPED, {}), (NAMES, {}), (PLACES, {})):
            patcher = patch(target, return_value=value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def fix(self, heard=2, clock=0, lag=2, fix_before=0, **attributes):
        """A position the provider received `heard` seconds ago from a tracker
        whose clock is `clock` seconds behind, `lag` seconds after it was sent."""
        server = self.now - timedelta(seconds=heard)
        device = server - timedelta(seconds=lag + clock)
        return {"deviceId": 13145, "latitude": 28.137, "longitude": 82.293, "valid": True, "speed": 12,
                "serverTime": server.isoformat(), "deviceTime": device.isoformat(),
                "fixTime": (device - timedelta(seconds=fix_before)).isoformat(),
                "attributes": {"ignition": True, "archive": False, **attributes}}

    def test_the_error_is_a_whole_quarter_hour_and_nothing_else(self):
        nepal = 5 * 3600 + 45 * 60
        for clock in (nepal, -nepal, 8 * 3600, 5 * 3600 + 30 * 60, 900, -900):
            for lag in (0, 2, 21, 60):
                self.assertEqual(clock_error(self.fix(clock=clock, lag=lag)), clock, (clock, lag))
        # a clock that is right; one that is simply wrong; a message too long on the way
        for clock, lag in ((0, 0), (0, 8), (0, 61), (400, 2), (nepal + 300, 2), (nepal, 75), (nepal, -30), (15 * 3600, 2)):
            self.assertEqual(clock_error(self.fix(clock=clock, lag=lag)), 0, (clock, lag))
        # kept on the tracker and sent later, however neatly late it is
        self.assertEqual(clock_error(self.fix(clock=nepal, archive=True)), 0)
        for broken in ({}, {"deviceTime": "yesterday", "serverTime": self.now.isoformat()}, {"deviceTime": self.now.isoformat()},
                       {"attributes": "none", "deviceTime": None, "serverTime": None}):
            self.assertEqual(clock_error(broken), 0)

    def test_a_bus_on_the_road_is_moving_not_lost(self):
        position = self.fix(heard=8, clock=20700)
        # as it was: hours old, so under way and silent
        before = bus_state(position, self.now)
        self.assertEqual((before["status"], before["speed_kmh"], before["stale"]), ("No signal", None, True))
        with patch(POSITIONS, return_value=[position]):
            bus = school_buses(self.config, 25)["buses"][0]
        self.assertEqual((bus["status"], bus["speed_kmh"], bus["stale"]), ("Moving", 22.2, False))
        # the time on the card is when the fix was taken, not what the tracker called it
        self.assertAlmostEqual((self.now - timestamp(bus["updated_at"])).total_seconds(), 10, delta=1)

    def test_a_tracker_set_ahead_is_not_offline(self):
        position = self.fix(heard=5, clock=-20700, speed=0)
        self.assertEqual(bus_state(position, self.now)["status"], "Offline")
        with patch(POSITIONS, return_value=[{**position, "speed": 0}]):
            self.assertEqual(school_buses(self.config, 25)["buses"][0]["status"], "Idling")

    def test_it_still_goes_quiet_like_any_other(self):
        with patch(POSITIONS, return_value=[self.fix(heard=400, clock=20700)]):
            self.assertEqual(school_buses(self.config, 25)["buses"][0]["status"], "No signal")
        # heard from just now, but the fix it carries is an old one
        with patch(POSITIONS, return_value=[self.fix(heard=3, clock=20700, fix_before=600)]):
            self.assertEqual(school_buses(self.config, 25)["buses"][0]["status"], "No signal")
        with patch(POSITIONS, return_value=[self.fix(heard=2 * 86400, clock=20700)]):
            self.assertEqual(school_buses(self.config, 25)["buses"][0]["status"], "Offline")

    def test_a_tracker_with_the_right_clock_is_read_as_before(self):
        for position in (self.fix(heard=3), self.fix(heard=300), self.fix(heard=3, fix_before=70), self.fix(heard=90000),
                         {**self.fix(heard=3), "serverTime": None}, {**self.fix(heard=3), "deviceTime": None}):
            with patch(POSITIONS, return_value=[position]):
                bus = school_buses(self.config, 25)["buses"][0]
            expected = bus_state(position, timezone.now())
            self.assertEqual((bus["status"], bus["updated_at"]), (expected["status"], expected["updated_at"]))

    def test_a_days_history_keeps_the_providers_times(self):
        position = self.fix(heard=8, clock=20700)
        fixed_at = timestamp(position["fixTime"])
        self.assertEqual(bus_state(position, fixed_at)["updated_at"], fixed_at.isoformat())


class BusHistoryTests(SimpleTestCase):
    """Where a bus has been: one school's own bus, one day at most, read only."""

    def setUp(self):
        held_answers.clear()
        self.now = timezone.now()
        self.start = self.now - timedelta(hours=6)
        self.config = {"schools": {}}
        self.asked = []
        for target, value in ((f"{HISTORY}.assignments", [{"id": 10, "name": "My school bus"}]), (f"{HISTORY}.device_names", {})):
            patcher = patch(target, return_value=value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def at(self, minutes):
        return (self.start + timedelta(minutes=minutes)).isoformat()

    def fix(self, minutes, device=10, **extra):
        return {"deviceId": device, "latitude": 28.1, "longitude": 82.3, "valid": True, "speed": 10, "fixTime": self.at(minutes),
                "attributes": {"ignition": True, "secret": "private"}, **extra}

    def provider(self, positions=(), summary=(), trips=(), stops=(), failing=()):
        answers = {"/positions": positions, "/reports/summary": summary, "/reports/trips": trips, "/reports/stops": stops}

        def read(config, path, seconds, params=None):
            self.asked.append((path, seconds, params))
            if path in failing:
                raise TrackingUnavailable("down")
            return list(answers[path])
        return patch(f"{HISTORY}._provider_list", side_effect=read)

    def history(self, bus="10", start=None, end=None, school=14):
        return school_history(self.config, school, bus, (start or self.start).isoformat(), (end or self.now).isoformat())

    def test_only_a_bus_of_the_school_that_asks(self):
        with self.provider() as read:
            with self.assertRaises(PermissionDenied):
                self.history(bus="20")
            for bus in (None, "", "abc"):
                with self.subTest(bus=bus), self.assertRaises(ValidationError):
                    self.history(bus=bus)
            read.assert_not_called()

    def test_the_range_is_real_and_no_longer_than_a_day(self):
        with self.provider() as read:
            for start, end in (
                ("2026-10-05T00:00:00", "2026-10-05T06:00:00"),                                    # no timezone
                (self.now.isoformat(), self.start.isoformat()),                                    # backwards
                ((self.now - timedelta(hours=25)).isoformat(), self.now.isoformat()),              # more than a day
                ((self.now + timedelta(hours=1)).isoformat(), (self.now + timedelta(hours=2)).isoformat()),   # not yet
                (None, self.now.isoformat()),
            ):
                with self.subTest(start=start), self.assertRaises(ValidationError):
                    school_history(self.config, 14, "10", start, end)
            read.assert_not_called()
            # "Until midnight tonight" is read only as far as now.
            result = self.history(end=self.now + timedelta(hours=2))
        self.assertLessEqual(timestamp(result["to"]), timezone.now())
        self.assertEqual(self.asked[0][2]["to"], result["to"])

    def test_points_are_this_buses_valid_fixes_in_order(self):
        positions = [self.fix(30), self.fix(10), self.fix(20, device=20, address="Other school location"),
                     self.fix(40, valid=False), self.fix(-10), self.fix(50)]
        with self.provider(positions=positions):
            result = self.history()
        self.assertEqual([point["updated_at"] for point in result["points"]], [timestamp(self.at(m)).isoformat() for m in (10, 30, 50)])
        self.assertEqual(result["discarded_points"], 1)
        self.assertNotIn("Other school location", json.dumps(result))
        self.assertNotIn("private", json.dumps(result))
        self.assertEqual(set(result["points"][0]), {"latitude", "longitude", "updated_at", "speed_kmh", "ignition", "course", "address", "status", "gap_before"})
        # A fix is judged at the time it was recorded, not against today.
        self.assertEqual((result["points"][0]["status"], result["points"][0]["speed_kmh"]), ("Moving", 18.5))
        # The line breaks where the device was silent for more than five minutes.
        self.assertEqual([point["gap_before"] for point in result["points"]], [False, True, True])
        self.assertEqual(result["gap_count"], 2)
        self.assertEqual(result["bus"], {"id": 10, "name": "My school bus"})

    def test_reports_are_converted_clipped_and_scoped(self):
        summary = [{"deviceId": 20, "distance": 999999}, {"deviceId": 10, "distance": 29110.0, "averageSpeed": 10, "maxSpeed": 23.2182}]
        trips = [
            {"deviceId": 10, "startTime": self.at(10), "endTime": self.at(40), "distance": 8090, "startAddress": "Bus park", "endAddress": "School gate"},
            # under way when the period began: only the part inside it counts
            {"deviceId": 10, "startTime": self.at(-30), "endTime": self.at(5), "distance": 5000},
            {"deviceId": 20, "startTime": self.at(10), "endTime": self.at(40), "distance": 1, "startAddress": "Other school location"},
            {"deviceId": 10, "startTime": "nonsense", "endTime": self.at(40)},
        ]
        stops = [{"deviceId": 10, "startTime": self.at(40), "endTime": self.at(45), "address": "School gate"}]
        with self.provider(summary=summary, trips=trips, stops=stops):
            result = self.history()
        self.assertEqual(result["summary"], {"distance_km": 29.11, "average_speed_kmh": 18.5, "max_speed_kmh": 43.0,
                                             "travel_seconds": 2100, "stopped_seconds": 300})
        self.assertEqual([(trip["duration_seconds"], trip["partial"], trip["distance_km"]) for trip in result["trips"]],
                         [(300, True, None), (1800, False, 8.09)])
        self.assertEqual((result["trips"][1]["start_address"], result["trips"][1]["end_address"]), ("Bus park", "School gate"))
        self.assertEqual(result["trips"][0]["start"], timestamp(self.at(0)).isoformat())
        self.assertEqual([(stop["duration_seconds"], stop["address"]) for stop in result["stops"]], [(300, "School gate")])
        self.assertNotIn("Other school location", json.dumps(result))
        self.assertEqual(result["warnings"], [])

    def test_the_average_speed_is_distance_over_time_under_way_when_the_provider_says_zero(self):
        summary = [{"deviceId": 10, "distance": 29110.0, "averageSpeed": 0.0, "maxSpeed": 23.2182}]
        trips = [{"deviceId": 10, "startTime": self.at(0), "endTime": (self.start + timedelta(seconds=5936)).isoformat(), "distance": 29110}]
        with self.provider(summary=summary, trips=trips):
            self.assertEqual(self.history()["summary"]["average_speed_kmh"], 17.7)
        # No distance, or no trips to time it by: nothing is made up.
        with self.provider(summary=summary):
            self.assertEqual(self.history()["summary"]["average_speed_kmh"], 0.0)
        with self.provider(trips=trips):
            self.assertNotIn("average_speed_kmh", self.history()["summary"])

    def test_a_report_that_fails_costs_only_that_report(self):
        stops = [{"deviceId": 10, "startTime": self.at(40), "endTime": self.at(45), "address": "School gate"}]
        with self.provider(positions=[self.fix(10)], stops=stops, failing={"/reports/trips"}):
            result = self.history()
        self.assertEqual((len(result["points"]), result["trips"], len(result["stops"])), (1, [], 1))
        self.assertEqual(len(result["warnings"]), 1)
        self.assertIn("trips", result["warnings"][0])
        # Time under way is unknown, not zero.
        self.assertIsNone(result["summary"]["travel_seconds"])
        self.assertEqual(result["summary"]["stopped_seconds"], 300)
        # Without the route there is no history to show at all.
        with self.provider(failing={"/positions"}), self.assertRaises(TrackingUnavailable):
            self.history()

    def test_a_day_of_fixes_is_read_fresh_and_never_kept(self):
        with self.provider(positions=[self.fix(10)]):
            result = self.history()
        kept = {path: seconds for path, seconds, _ in self.asked}
        self.assertEqual(kept, {"/positions": 0, "/reports/summary": 60, "/reports/trips": 60, "/reports/stops": 60})
        self.assertEqual(self.asked[0][2], {"deviceId": 10, "from": result["from"], "to": result["to"]})
        config = {"api_url": "https://gps.example.test/api", "token": "private-token"}
        params = {"deviceId": 10, "from": "a", "to": "b"}
        with patch("main.methods.busTracking.cache") as cache, patch("main.methods.busTracking.requests.get") as get:
            get.return_value = Mock(status_code=200)
            get.return_value.json.return_value = [self.fix(10)]
            self.assertEqual(len(_provider_list(config, "/positions", 0, params=params)), 1)
            cache.get.assert_not_called()
            cache.set.assert_not_called()
            get.assert_called_once_with("https://gps.example.test/api/positions", params=params, timeout=(5, 15), allow_redirects=False,
                                        headers={"Authorization": "Bearer private-token", "Accept": "application/json"})
            # ...while a small report is kept, under a key that tells two searches apart.
            cache.get.return_value = None
            _provider_list(config, "/reports/trips", 60, params=params)
            _provider_list(config, "/reports/trips", 60, params={**params, "to": "c"})
            first, second = (call.args[0] for call in cache.set.call_args_list)
            self.assertNotEqual(first, second)
            self.assertNotIn("private-token", first)

    def test_more_fixes_than_a_page_can_draw_are_refused(self):
        with patch(f"{HISTORY}.MAX_POINTS", 2), self.provider(positions=[self.fix(m) for m in (10, 20, 30)]):
            with self.assertRaises(ValidationError):
                self.history()

    def test_the_view_scopes_history_to_the_signed_in_school(self):
        request = SimpleNamespace(user=AdminAccount(pk=1), query_params={"bus": "10", "from": "a", "to": "b"})
        with patch("main.views.BusTrackingView.SchoolAdmin.objects.filter") as schools, \
                patch("main.views.BusTrackingView.load_config", return_value=self.config), \
                patch("main.views.BusTrackingView.school_history", return_value={"points": []}) as history:
            schools.return_value.values_list.return_value.first.return_value = 14
            response = BusTrackingHistoryView().get(request)
            self.assertEqual(response.status_code, 200)
            history.assert_called_once_with(self.config, 14, "10", "a", "b")
            self.assertEqual(response["Cache-Control"], "private, no-store")
            # Another school's id in the address is refused before anything is read.
            history.reset_mock()
            request.query_params["school"] = "37"
            self.assertEqual(BusTrackingHistoryView().get(request).status_code, 403)
            history.assert_not_called()
        self.assertEqual(BusTrackingHistoryView.http_method_names, ["get", "head", "options"])
        with patch("main.views.BusTrackingView.Staff.objects.filter") as staff, patch("main.views.BusTrackingView.load_config") as config:
            staff.return_value.first.return_value = SimpleNamespace(school_id=14, permissions=[])
            for user in (StudentAccount(pk=1), StaffAccount(pk=1)):
                self.assertEqual(BusTrackingHistoryView().get(SimpleNamespace(user=user, query_params={"bus": "10"})).status_code, 403)
            config.assert_not_called()

