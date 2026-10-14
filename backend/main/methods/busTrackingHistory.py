"""School-scoped, read-only history from Trackon. No coordinates are persisted."""
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from .busTracking import (
    _provider_list, assignments, bus_state, device_names, number, timestamp,
    TrackingUnavailable,
)

MAX_POINTS = 20000
MAX_RANGE = timedelta(days=1)
GAP_SECONDS = 300


def history_range(start, end):
    start, end = timestamp(start), timestamp(end)
    if start is None or end is None:
        raise ValidationError({"message": "Choose a start and end time with a timezone."})
    if start >= end or end - start > MAX_RANGE:
        raise ValidationError({"message": "Choose a time range greater than zero and no longer than 24 hours."})
    now = timezone.now()
    if start > now:
        raise ValidationError({"message": "History cannot start in the future."})
    # Today's date picker may end at midnight tonight; fetch only up to now.
    return start, min(end, now)


def scaled(value, divisor=1, digits=2):
    value = number(value)
    return round(value / divisor, digits) if value is not None and value >= 0 else None


def report_rows(config, kind, params):
    try:
        return _provider_list(config, "/reports/" + kind, 60, params=params), None
    except TrackingUnavailable:
        return [], f"The {kind} report is temporarily unavailable. The recorded route is still shown."


def school_history(config, school_id, bus_id, start, end):
    try:
        bus_id = int(bus_id)
    except (TypeError, ValueError):
        raise ValidationError({"message": "Choose a bus."}) from None
    bus = next((bus for bus in assignments(config, school_id) if bus["id"] == bus_id), None)
    if bus is None:
        raise PermissionDenied("You do not have access to this bus.")
    start, end = history_range(start, end)
    params = {"deviceId": bus_id, "from": start.isoformat(), "to": end.isoformat()}
    # A day of fixes is megabytes and no two searches ask for the same one, so
    # it is read fresh and never kept; the three small reports are.
    rows = _provider_list(config, "/positions", 0, params=params)
    if len(rows) > MAX_POINTS:
        raise ValidationError({"message": "This range contains too many GPS records. Choose a shorter time range."})
    fixes = {}
    discarded = 0
    for row in rows:
        fixed_at = timestamp(row.get("fixTime"))
        if type(row.get("deviceId")) is not int or row["deviceId"] != bus_id or not fixed_at or not start <= fixed_at <= end:
            continue
        # A historical fix is evaluated at its recorded time, not today.
        state = bus_state(row, fixed_at)
        if state["latitude"] is None:
            discarded += 1
            continue
        fixes[fixed_at] = {key: state[key] for key in (
            "latitude", "longitude", "updated_at", "speed_kmh", "ignition", "course", "address", "status",
        )}
    points = [fixes[date] for date in sorted(fixes)]
    gaps = 0
    for index, point in enumerate(points):
        point["gap_before"] = index > 0 and (
            timestamp(point["updated_at"]) - timestamp(points[index - 1]["updated_at"])
        ).total_seconds() > GAP_SECONDS
        gaps += int(point["gap_before"])

    # Independent read-only reports run together, keeping the request bounded
    # to one route fetch plus one report timeout, not four serial timeouts.
    with ThreadPoolExecutor(max_workers=3) as pool:
        reports = dict(zip(("summary", "trips", "stops"), pool.map(
            lambda kind: report_rows(config, kind, params), ("summary", "trips", "stops"),
        )))
    warnings = [warning for _, warning in reports.values() if warning]
    summary = {}
    for row in reports["summary"][0]:
        if type(row.get("deviceId")) is int and row["deviceId"] == bus_id:
            summary = {"distance_km": scaled(row.get("distance"), 1000),
                       "average_speed_kmh": scaled(row.get("averageSpeed"), 1 / 1.852, 1),
                       "max_speed_kmh": scaled(row.get("maxSpeed"), 1 / 1.852, 1)}
            break
    activities = {"trips": [], "stops": []}
    for kind in activities:
        for row in reports[kind][0]:
            began, ended = timestamp(row.get("startTime")), timestamp(row.get("endTime"))
            if type(row.get("deviceId")) is not int or row["deviceId"] != bus_id or not began or not ended:
                continue
            if ended < began or ended < start or began > end:
                continue
            # Clip records crossing the query boundary, including a stop that
            # began yesterday; its full duration is not this period's duration.
            clipped_start, clipped_end = max(start, began), min(end, ended)
            activity = {"start": clipped_start.isoformat(), "end": clipped_end.isoformat(),
                        "duration_seconds": round((clipped_end - clipped_start).total_seconds()),
                        "partial": began < start or ended > end}
            if kind == "trips":
                activity.update(distance_km=None if activity["partial"] else scaled(row.get("distance"), 1000),
                                start_address=str(row.get("startAddress") or "")[:500],
                                end_address=str(row.get("endAddress") or "")[:500])
            else:
                activity["address"] = str(row.get("address") or "")[:500]
            activities[kind].append(activity)
        activities[kind].sort(key=lambda item: item["start"])
    summary.update(travel_seconds=None if reports["trips"][1] else sum(t["duration_seconds"] for t in activities["trips"]),
                   stopped_seconds=None if reports["stops"][1] else sum(s["duration_seconds"] for s in activities["stops"]))
    # The provider's own average is 0 for a bus that plainly moved. The distance
    # over the time it was under way is the figure a school means by it.
    if not summary.get("average_speed_kmh") and summary.get("distance_km") and summary["travel_seconds"]:
        summary["average_speed_kmh"] = round(summary["distance_km"] * 3600 / summary["travel_seconds"], 1)
    name = bus.get("name") or device_names(config).get(bus_id) or f"Bus {bus_id}"
    return {"bus": {"id": bus_id, "name": str(name)[:120]}, "from": start.isoformat(), "to": end.isoformat(),
            "points": points, "summary": summary, **activities, "warnings": warnings,
            "gap_count": gaps, "discarded_points": discarded, "fetched_at": timezone.now().isoformat()}
