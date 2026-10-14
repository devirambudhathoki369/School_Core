import sys
import os
import django


current_path = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_path, "../../"))
if project_root not in sys.path:
    sys.path.append(project_root)

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()


#
""" send alerts to students [run every minute via cron!]
- get bus locations [API]
- get all studenttrackons not alerted today!
- get their locations
- if distance between bus-location and student-location 
    using latitude and longitude is under 
    studenttrackon.alert_range...
- send them push notification!
"""


#
from datetime import date
import requests
import json
from django.db.models import Q
from django.db import transaction
from django.utils import timezone

#
from main.models.Alerts import BusTrackOnAlertInfo
from main.scripts.utils.haversine import haversine
from backend.firebase.utils import get_access_token
from backend.firebase.messaging import _is_stale_token
from main.constants.app_notification import NOTIFICATION_CONFIG
from account.models import StudentAccount, StaffAccount

#
TRACKON_API = os.environ.get("TRACKON_API")
TOKEN = os.environ.get("TRACKON_TOKEN")
FCM_URL = os.environ.get("FCM_URL")
#
API_PATH = "/positions"
headers = {"Authorization": f"Bearer {TOKEN}"}
#
STUDENT_STATUS_RUNNING = 1
STAFF_STATUS_EMPLOYED = 1


def get_bus_locations():
    payload = {}
    _API = TRACKON_API + API_PATH
    res = requests.get(_API, headers=headers, data={})
    if res.status_code != 200:
        return {}
    buses = res.json()
    return {
        bus.get("deviceId"): (bus.get("latitude"), bus.get("longitude"))
        for bus in buses
        if bus.get("attributes", {}).get("ignition") is True
    }


# bus-alert send outcomes.
SENT = "sent"
STALE = "stale"  # token dead/unregistered -> should be cleared
FAILED = "failed"  # transient -> retry next minute


def send_push_notification(access_token, student_device_token):
    """
    Send the data-only bus alert to one device token (the app identifies it by
    `busAlert: "true"` and builds the local notification itself). Returns SENT,
    STALE or FAILED.

    We now READ FCM's response: previously the POST result was thrown away, so a
    dead token "succeeded" and the recipient was marked alerted while nothing was
    delivered — and never retried. Reading the status lets us skip dead tokens
    and clear them.
    """
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json; UTF-8",
    }

    payload = {
        "message": {
            "token": student_device_token,
            # FCM data values must be strings; busAlert lets the app identify
            # this data-only message instead of assuming every push is one.
            "data": {"busAlert": "true"},
            **NOTIFICATION_CONFIG,
        }
    }
    try:
        res = requests.post(
            FCM_URL, headers=headers, data=json.dumps(payload), timeout=10
        )
    except requests.RequestException:
        return FAILED
    if res.status_code == 200:
        return SENT
    return STALE if _is_stale_token(res) else FAILED


#
if __name__ == "__main__":
    TODAY = date.today()
    NOW = timezone.now()
    bus_locations = get_bus_locations()
    bus_ids = bus_locations.keys()  # only active buses

    if not bus_ids:
        exit()

    with transaction.atomic():
        trackons = (
            BusTrackOnAlertInfo.objects.select_related(
                "student_id__account",
                "staff_id__account",
            )
            .select_for_update(skip_locked=True, of=("self",))
            .filter(
                Q(is_active=True),
                Q(alerted_date__isnull=True) | Q(alerted_date__lt=TODAY),
                Q(bus_id__in=bus_ids),
                #
                Q(
                    Q(
                        student_id__isnull=False,
                        student_id__is_active=True,
                        student_id__status=STUDENT_STATUS_RUNNING,
                    )
                    | Q(
                        staff_id__isnull=False,
                        staff_id__is_active=True,
                        staff_id__status=STAFF_STATUS_EMPLOYED,
                    )
                ),
            )
            .only(
                "id",
                "student_id_id",
                "staff_id_id",
                "alerted_date",
                "updated_at",
                "bus_id",
                "latitude",
                "longitude",
                "alert_range",
                #
                "student_id__account__app_device_token",
                "staff_id__account__app_device_token",
            )
        )

        if trackons:
            access_token = get_access_token()

            updates = []
            stale_tokens = set()
            for track in trackons:
                bus_id = track.bus_id
                student_lat = track.latitude
                student_lon = track.longitude
                alert_range = float(track.alert_range)

                bus_lat, bus_lon = bus_locations[bus_id]
                distance = haversine(
                    student_lat, student_lon, bus_lat, bus_lon
                )  # distance between student and bus!
                #
                if distance <= alert_range:
                    device_token = None
                    if track.student_id and track.student_id.account:
                        device_token = track.student_id.account.app_device_token
                    elif track.staff_id and track.staff_id.account:
                        device_token = track.staff_id.account.app_device_token
                    if device_token:
                        result = send_push_notification(access_token, device_token)
                        if result == SENT:
                            # only mark alerted on a REAL delivery, so a dead
                            # token isn't silently marked done — it gets retried
                            # once the phone re-registers a live token.
                            track.alerted_date = TODAY
                            track.updated_at = NOW
                            updates.append(track)
                        elif result == STALE:
                            stale_tokens.add(device_token)

            if updates:
                try:
                    BusTrackOnAlertInfo.objects.bulk_update(
                        updates, ["alerted_date", "updated_at"]
                    )
                except:
                    pass

            # clear tokens FCM reported dead so coverage stats are honest and a
            # re-login re-seeds a live token (one field covers either role).
            if stale_tokens:
                try:
                    StudentAccount.objects.filter(
                        app_device_token__in=stale_tokens
                    ).update(app_device_token=None)
                    StaffAccount.objects.filter(
                        app_device_token__in=stale_tokens
                    ).update(app_device_token=None)
                except:
                    pass
        # transaction.set_rollback(True)

"""testing;
student = Student.objects.get(id=982)
staff = Staff.objects.get(id=202)
trackons = [
        BusTrackOnAlertInfo(
            bus_id=6157,
            # student_id=student,
            # staff_id=staff,
            latitude=28.13053111111111,
            longitude=82.302795,
            alert_range=1,
        )
    ]
"""
