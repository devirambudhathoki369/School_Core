"""The school bus in the app: which buses a student's school has, where they
are, and which one the student rides (mobile/SPEC.md §5, "Bus").

The portal already reads the school's buses from the GPS provider
(`main/methods/busTracking.py`) and keeps one shared answer a few seconds old,
so the office's map and every phone together ask the provider at most once a
refresh. The app reads that same answer. The school always comes from the
session, never from the request, and a bus can be chosen only from the
school's own list.

The bus a student rides is the bus-alert row the portal and its alert job
already use (`BusTrackOnAlertInfo`), so the old app, the office's map and this
app agree on it. Choosing a bus here keeps any "bus is near" alert the student
set up before; a bus chosen here alone has no alert.
"""
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from main.methods.busTracking import (
    TrackingUnavailable,
    answered_at_once,
    grouped_buses,
    has_buses,
    load_config,
    school_buses,
)
from main.models.Alerts import BusTrackOnAlertInfo

# A phone on mobile data need not ask as often as the office's screen.
MIN_REFRESH_SECONDS = 10
# What the app shows of a bus. The rest of the portal's answer (satellites,
# signal, the odometer) is for the office.
FIELDS = ("id", "name", "status", "latitude", "longitude", "updated_at", "stale", "speed_kmh", "address")
WARM_EVERY_SECONDS = 60


def school_answer(school_id: int) -> dict:
    """The school's buses as the office's map has them, at most seconds old."""
    try:
        return answered_at_once(f"web-bus-answer:{school_id}", lambda: school_buses(load_config(), school_id))
    except TrackingUnavailable as exc:
        return {"buses": [], "message": str(exc), "refresh_seconds": 15}


def school_has_buses(school_id: int) -> bool:
    """Whether to offer the Bus screen. Answered from memory, so signing in
    never waits on the provider; when memory says no, the provider's list is
    read in the background (once a minute at most) for the next answer."""
    if has_buses(school_id):
        return True
    if cache.add("mobile-bus-warm", 1, WARM_EVERY_SECONDS):
        from main.methods.push import _in_background

        _in_background(grouped_buses, load_config())
    return False


def following(student):
    """The bus the student rides, or None."""
    return (
        BusTrackOnAlertInfo.objects.filter(student_id=student, is_active=True)
        .order_by("-updated_at", "-id")
        .values_list("bus_id", flat=True)
        .first()
    )


def student_bus(student) -> dict:
    answer = school_answer(student.class_info.school_id)
    buses = [{field: bus.get(field) for field in FIELDS} for bus in answer.get("buses") or []]
    mine = following(student)
    if mine not in {bus["id"] for bus in buses}:
        mine = None  # the school no longer has that bus
    buses.sort(key=lambda bus: (bus["id"] != mine, str(bus["name"]).lower()))
    return {
        "following": mine,
        "buses": buses,
        "message": answer.get("message") or None,
        "refresh_seconds": max(MIN_REFRESH_SECONDS, int(answer.get("refresh_seconds") or 0)),
    }


def is_school_bus(school_id: int, bus_id: int) -> bool:
    return bus_id in {bus.get("id") for bus in school_answer(school_id).get("buses") or []}


def ride(student, bus_id):
    """The student rides `bus_id` from now on; None: no school bus."""
    with transaction.atomic():
        rows = BusTrackOnAlertInfo.objects.select_for_update().filter(student_id=student)
        if bus_id is None:
            rows.delete()
        elif rows.exists():
            # one bus at a time; an alert set up before now watches this bus
            rows.update(bus_id=bus_id, is_active=True, alerted_date=None, updated_at=timezone.now())
        else:
            BusTrackOnAlertInfo.objects.create(bus_id=bus_id, student_id=student)
    # the office's map learns who rides what from these rows
    cache.delete("web-bus-followed")
