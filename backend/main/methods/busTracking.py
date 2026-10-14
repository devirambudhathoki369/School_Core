"""Read-only web tracking of a school's OWN buses.

WHICH BUSES ARE A SCHOOL'S
--------------------------
Three sources, and the earlier one settles any disagreement:

1. `creds/bus_tracking.json` -> "schools": links the operator wrote down. The
   file is optional; it is for the bus the other two get wrong.
2. The provider's own groups. Every vehicle is filed there under a group named
   for its school and ending in our school id ("Jivanpremy_25"), from the day
   the tracker is fitted. So a bus added for a school shows on the web by
   itself, before anyone follows it in the app.
3. What the app has already been told, for a bus the provider has in no
   school's group. Every bus-alert setting (`BusTrackOnAlertInfo`) names the
   bus a student or a member of staff follows, so a bus followed only by the
   people of ONE school is that school's bus. A bus followed from two schools
   is shown to NEITHER until the operator links it — showing one school
   another's bus is the one failure this module must never have.

A device id sent by a browser is never trusted, and neither is a vehicle name:
the group's school id is the only part of a name that is read.

THE PROVIDER
------------
GET requests only (`/positions`, `/devices`, `/groups`, `/server/geocode`). Credentials may be a username /
password (Trackon V1 Basic Auth) or a legacy bearer token. File credentials
override environment credentials as a complete set. Nothing here sends a command,
edits a device or changes a subscription, and the alert job is not touched.
"""
import hashlib
import json
import logging
import math
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlsplit

import requests
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django.utils.dateparse import parse_datetime

# How long one answer from the provider is reused. The page asks every
# REFRESH_SECONDS; however many schools have it open, the provider is asked at
# most once in that time.
REFRESH_SECONDS = 5
# An answer older than this is shown to nobody: whoever asks next waits for a
# fresh one.
ANSWER_KEEP_SECONDS = 20
# A fix older than this is not "now" any more.
FRESH_SECONDS = 120
# ...and one older than this is not a parked bus, it is a silent device.
OFFLINE_SECONDS = 24 * 60 * 60
MOVING_KMH = 2
# A tracker set to the wrong time zone stamps every fix a whole number of
# quarter hours out (5 h 45 min for one told Nepal is west of Greenwich). Its
# clock is read against the moment the provider received the message: this
# close to a whole quarter hour is the zone, the remainder being the seconds
# the message took to arrive.
CLOCK_STEP_SECONDS = 15 * 60
CLOCK_EARLY_SECONDS = 10
CLOCK_LATE_SECONDS = 60
CLOCK_MOST_SECONDS = 14 * 60 * 60
# A bus picked up in the app shows on the web within this long.
FOLLOWED_CACHE_SECONDS = 120
NAMES_CACHE_SECONDS = 600
# A bus fitted for a school, or moved to another school's group, is on an open
# page within this long plus one refresh, and there at once on a page opened
# after it. The two small lists behind it are asked for together, and only
# while somebody has a tracking page open.
GROUPS_CACHE_SECONDS = 10
# What the groups said last stands this long when the provider cannot be read,
# so an outage does not take a school's buses off its list.
GROUPS_KEEP_SECONDS = 7 * 24 * 60 * 60
# One reader of the groups at a time, and a provider that would not give them
# is left alone this long.
GROUPS_PAUSE_SECONDS = 60
# One address serves every fix in the same square of about 55 metres, and for a
# long time: a place keeps its name. A bus on its usual road is answered from
# memory and the provider's geocoder hears only about new ground.
ADDRESS_GRID = 2000
ADDRESS_CACHE_SECONDS = 30 * 24 * 60 * 60
# "Nothing here" is also what the geocoder says when it is having a bad minute.
NO_ADDRESS_CACHE_SECONDS = 300
# A geocoder that does not answer is left alone this long, so the positions
# never wait on it twice running.
ADDRESS_PAUSE_SECONDS = 60


logger = logging.getLogger(__name__)

# Why the provider could not be read, in words an operator can act on. None of
# them carries a credential, an address or anything the provider said.
REFUSED = "The GPS service rejected the server's credentials or access permissions. Bus tracking is unavailable until the connection is corrected."
NOT_FOUND = "The GPS service address configured on the server did not answer as expected."
TOO_SLOW = "The GPS service did not answer in time. Retrying automatically."
UNAVAILABLE = "The GPS service is unavailable. Please try again shortly."


class TrackingUnavailable(Exception):
    pass


def load_config():
    path = Path(os.environ.get("BUS_TRACKING_CONFIG_FILE", settings.BASE_DIR / "creds" / "bus_tracking.json"))
    if not path.exists():
        return {"schools": {}}
    try:
        config = json.loads(path.read_text())
        schools = config.setdefault("schools", {})
        if not isinstance(schools, dict):
            raise ValueError()
        assigned = set()
        for school_id, devices in schools.items():
            if not str(school_id).isdigit() or not isinstance(devices, list):
                raise ValueError()
            for device in devices:
                device_id = device["id"]
                if type(device_id) is not int or device_id <= 0 or device_id in assigned:
                    raise ValueError()
                assigned.add(device_id)
        return config
    except (OSError, ValueError, KeyError, TypeError):
        raise TrackingUnavailable("Bus tracking configuration needs attention.") from None


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def timestamp(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = parse_datetime(value)
        if parsed and timezone.is_aware(parsed):
            return parsed
    except ValueError:
        pass
    return None


def connection(config):
    """Return the HTTPS base URL and requests authentication arguments.

    A partial Basic Auth configuration fails closed instead of silently using
    the old token or borrowing the other half of a different account's login.
    """
    base = str(config.get("api_url") or os.environ.get("TRACKON_API") or "").rstrip("/")
    url = urlsplit(base)
    if url.scheme != "https" or not url.hostname or url.username or url.query or url.fragment:
        raise TrackingUnavailable("Bus tracking connection is not configured.")
    if any(key in config for key in ("username", "password", "token")):
        username, password, token = (config.get(key) for key in ("username", "password", "token"))
    else:
        username, password, token = (os.environ.get(key) for key in ("TRACKON_USERNAME", "TRACKON_PASSWORD", "TRACKON_TOKEN"))
    if username is not None or password is not None:
        if not isinstance(username, str) or not username or ":" in username or not isinstance(password, str) or not password:
            raise TrackingUnavailable("Bus tracking username and password must both be configured.")
        return base, {"auth": (username, password)}
    if not isinstance(token, str) or not token:
        raise TrackingUnavailable("Bus tracking connection is not configured.")
    return base, {"headers": {"Authorization": f"Bearer {token}"}}


def _provider_list(config, path, seconds, params=None):
    base, authentication = connection(config)
    # Cached on the server only; every response is re-scoped to the school that
    # asked. Many open tabs do not multiply the traffic to the provider.
    # `seconds=0` keeps nothing: for an answer too large and too particular to
    # be worth holding.
    key = f"web-bus{path}:" + hashlib.sha256(json.dumps([base, authentication, params], sort_keys=True).encode()).hexdigest()
    rows = cache.get(key) if seconds else None
    if rows is not None:
        return rows
    try:
        # Use the explicitly configured authentication method. A rejected login
        # is not retried with a different account or method.
        arguments = dict(authentication)
        if params is not None:
            arguments.update(params=params, headers={**arguments.get("headers", {}), "Accept": "application/json"})
        response = requests.get(base + path, **arguments, timeout=(5, 15), allow_redirects=False)
        status = response.status_code
        if status != 200:
            # The status is the whole diagnosis, so it is kept for the operator;
            # the provider's own words and the credentials never reach a client.
            logger.warning("bus tracking: provider answered %s for %s", status, path)
            raise TrackingUnavailable(
                REFUSED if status in (401, 403) else NOT_FOUND if status in (301, 302, 307, 308, 404) else UNAVAILABLE
            )
        rows = response.json()
        if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
            logger.warning("bus tracking: provider gave an unexpected body for %s", path)
            raise TrackingUnavailable("The GPS service returned an invalid response.")
    except requests.Timeout:
        logger.warning("bus tracking: provider timed out on %s", path)
        raise TrackingUnavailable(TOO_SLOW) from None
    except (requests.RequestException, ValueError):
        logger.warning("bus tracking: provider could not be read for %s", path)
        raise TrackingUnavailable(UNAVAILABLE) from None
    if seconds:
        cache.set(key, rows, seconds)
    return rows


def fetch_positions(config):
    return _provider_list(config, "/positions", REFRESH_SECONDS)


def device_names(config):
    """{device id: the name the vehicle carries at the provider}.

    Names are a courtesy. If the provider will not list its devices the buses
    are still tracked, under "Bus <id>" — so this never raises.
    """
    try:
        rows = _provider_list(config, "/devices", NAMES_CACHE_SECONDS)
    except TrackingUnavailable:
        return {}
    names = {}
    for row in rows:
        name = row.get("name")
        if type(row.get("id")) is int and isinstance(name, str) and name.strip():
            names[row["id"]] = name.strip()[:120]
    return names


def place_names(config, places):
    """{(latitude, longitude): where that is, in the provider's words}.

    `/positions` carries an address for very few fixes; the provider's geocoder
    names any spot it is asked about, which is what its own panel shows. A spot
    it cannot name is left out and the page shows the coordinates, so this
    never raises and never holds the positions back for long.
    """
    keys = {place: f"web-bus-address:{round(place[0] * ADDRESS_GRID)}:{round(place[1] * ADDRESS_GRID)}" for place in places}
    known = cache.get_many(set(keys.values())) if keys else {}
    # One spot is asked about per square, however many buses stand in it.
    asked = {key: place for place, key in keys.items() if key not in known}
    if asked and not cache.get("web-bus-address-paused"):
        known.update(_geocode(config, asked))
    return {place: known[key] for place, key in keys.items() if known.get(key)}


def _geocode(config, asked):
    """Ask the provider about {cache key: spot}; {cache key: address} for each it answered."""
    try:
        base, authentication = connection(config)
    except TrackingUnavailable:
        return {}

    def ask(place):
        # (the address, what went wrong) - one of the two is None.
        try:
            response = requests.get(
                base + "/server/geocode", params={"latitude": place[0], "longitude": place[1]},
                **authentication, timeout=(3, 4), allow_redirects=False,
            )
        except requests.RequestException as exc:
            return None, type(exc).__name__
        if response.status_code == 204:
            return "", None
        if response.status_code != 200:
            return None, response.status_code
        # Plain text whatever the header says; never guess its encoding.
        return " ".join(response.content.decode("utf-8", "replace").split())[:500], None

    with ThreadPoolExecutor(max_workers=min(8, len(asked))) as pool:
        answers = dict(zip(asked, pool.map(ask, asked.values())))
    problems = sorted({str(problem) for _, problem in answers.values() if problem is not None})
    if problems:
        # The status or the kind of failure is the whole diagnosis.
        logger.warning("bus tracking: geocoder could not be read (%s)", ", ".join(problems))
        cache.set("web-bus-address-paused", True, ADDRESS_PAUSE_SECONDS)
    found = {key: address for key, (address, problem) in answers.items() if problem is None}
    for key, address in found.items():
        cache.set(key, address, ADDRESS_CACHE_SECONDS if address else NO_ADDRESS_CACHE_SECONDS)
    return found


def followed_buses():
    """{bus id: {school ids whose students or staff follow it in the app}}."""
    followed = cache.get("web-bus-followed")
    if followed is not None:
        return followed
    # Imported here: this module is also loaded where no app registry is needed.
    from main.models.Alerts import BusTrackOnAlertInfo

    followed = {}
    rows = BusTrackOnAlertInfo.objects.filter(is_active=True).values_list(
        "bus_id", "student_id__class_info__school", "staff_id__school"
    )
    for bus_id, student_school, staff_school in rows:
        school = student_school or staff_school
        if type(bus_id) is int and bus_id > 0 and school:
            followed.setdefault(bus_id, set()).add(int(school))
    cache.set("web-bus-followed", followed, FOLLOWED_CACHE_SECONDS)
    return followed


def school_of_group(name):
    """The school a provider group is for: its name ends "_<school id>"
    ("Jivanpremy_25" -> 25). None for a group named any other way."""
    if not isinstance(name, str):
        return None
    _, underscore, number = name.strip().rpartition("_")
    if not underscore or not (number.isascii() and number.isdigit()) or len(number) > 9:
        return None
    return int(number) or None


def grouped_buses(config, ask=True):
    """{bus id: (school id, the vehicle's name or None)}, as the provider files them.

    Never raises. When the provider cannot be read, what it said last stands.
    `ask=False` answers from memory alone: for sign-in, which must never wait
    on the provider.
    """
    try:
        base, authentication = connection(config)
    except TrackingUnavailable:
        return {}
    key = "web-bus-grouped:" + hashlib.sha256(json.dumps([base, authentication], sort_keys=True).encode()).hexdigest()
    held = cache.get(key)
    at, grouped = held if isinstance(held, (list, tuple)) and len(held) == 2 else (0, {})
    if not ask or 0 <= time.time() - at < GROUPS_CACHE_SECONDS:
        return grouped
    # Whoever else asks meanwhile is answered from memory. After a failure the
    # lock is left to run out, which is the provider's minute of rest.
    if not cache.add(f"{key}:asking", 1, GROUPS_PAUSE_SECONDS):
        return grouped
    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            groups, devices = pool.map(lambda path: _provider_list(config, path, 0), ("/groups", "/devices"))
    except TrackingUnavailable:
        return grouped
    schools = {row["id"]: school_of_group(row.get("name")) for row in groups if type(row.get("id")) is int}
    grouped = {}
    for row in devices:
        bus_id, group, name = row.get("id"), row.get("groupId"), row.get("name")
        school = schools.get(group) if type(group) is int else None
        if type(bus_id) is int and bus_id > 0 and school:
            grouped[bus_id] = (school, name.strip()[:120] if isinstance(name, str) and name.strip() else None)
    cache.set(key, (time.time(), grouped), GROUPS_KEEP_SECONDS)
    cache.delete(f"{key}:asking")
    return grouped


def assignments(config, school_id, ask=True):
    """This school's buses, as [{"id", "name"}] — name None when nobody gave one."""
    school_id = int(school_id)
    linked = {}      # bus id -> the school the operator gave it to
    result = []
    for owner, devices in config.get("schools", {}).items():
        for device in devices:
            linked[device["id"]] = int(owner)
            if int(owner) == school_id:
                result.append({"id": device["id"], "name": device.get("name")})
    grouped = grouped_buses(config, ask)
    for bus_id, (owner, name) in sorted(grouped.items()):
        if bus_id not in linked and owner == school_id:
            result.append({"id": bus_id, "name": name})
    for bus_id, schools in sorted(followed_buses().items()):
        # An operator's link wins either way, and so does the provider's group:
        # who follows a bus says nothing once it is filed under a school. A bus
        # in no group that is followed from two schools belongs to neither
        # until one is written down.
        if bus_id in linked or bus_id in grouped or schools != {school_id}:
            continue
        result.append({"id": bus_id, "name": None})
    return result


def has_buses(school_id):
    """Does this school have a bus to track? Drives the menu; never raises."""
    try:
        return bool(school_id) and bool(assignments(load_config(), school_id, ask=False))
    except Exception:
        return False


def with_tracking_flag(profile, school_id):
    """The sign-in profile, told whether to draw the tracking menu at all."""
    if isinstance(profile, dict):
        profile["uses_bus_tracking"] = has_buses(school_id)
    return profile


def clock_error(position):
    """Seconds to add to a fix's time when its tracker is set to the wrong time
    zone; 0 for a clock that is right, or wrong in any other way.

    Such a tracker reports live like any other, but every fix looks hours old
    (or hours ahead), so the bus was never "now": it read No signal on the road
    and its speed was withheld, while the provider's own panel showed it moving.
    """
    attributes = position.get("attributes")
    if isinstance(attributes, dict) and attributes.get("archive") is True:
        # Kept on the tracker and sent later: late by however long it waited.
        return 0
    device, server = timestamp(position.get("deviceTime")), timestamp(position.get("serverTime"))
    if not device or not server:
        return 0
    late = (server - device).total_seconds()
    zone = round(late / CLOCK_STEP_SECONDS) * CLOCK_STEP_SECONDS
    if not zone or abs(zone) > CLOCK_MOST_SECONDS or not -CLOCK_EARLY_SECONDS <= late - zone <= CLOCK_LATE_SECONDS:
        return 0
    return zone


def bus_state(position, now, clock=0):
    """One provider position -> what the page may say about that bus.

    `clock` is the tracker's clock error (see `clock_error`), taken off the
    time of the fix. The live page passes it; a day's history is left in the
    provider's own times.
    """
    lat, lng = number(position.get("latitude")), number(position.get("longitude"))
    valid = (position.get("valid") is not False and lat is not None and lng is not None
             and -90 <= lat <= 90 and -180 <= lng <= 180 and (lat, lng) != (0, 0))
    fixed_at = timestamp(position.get("fixTime"))
    if fixed_at and clock:
        fixed_at += timedelta(seconds=clock)
    age = (now - fixed_at).total_seconds() if fixed_at else None
    speed = number(position.get("speed"))
    speed_kmh = round(max(0, speed) * 1.852, 1) if speed is not None else None   # knots
    attributes = position.get("attributes")
    attributes = attributes if isinstance(attributes, dict) else {}
    ignition = attributes.get("ignition")
    ignition = ignition if type(ignition) is bool else None
    moving = speed_kmh is not None and speed_kmh > MOVING_KMH
    fresh = valid and age is not None and -60 <= age <= FRESH_SECONDS
    if not valid or age is None or age > OFFLINE_SECONDS or age < -60:
        status = "Offline"
    elif fresh:
        status = "Moving" if moving else "Idling" if ignition else "Stopped"
    else:
        # An old fix. Parked with the engine off is simply a stopped bus whose
        # tracker is asleep; one that was under way when it went quiet has
        # lost its signal, and the page must not draw it as if it were there.
        status = "No signal" if (moving or ignition) else "Stopped"
    distance = number(attributes.get("totalDistance"))
    satellites, gsm = number(attributes.get("sat")), number(attributes.get("rssi"))
    return {
        "latitude": lat if valid else None, "longitude": lng if valid else None,
        "updated_at": fixed_at.isoformat() if fixed_at else None,
        "stale": not fresh,
        "status": status,
        # The speed of an old fix is not the speed now: a parked bus is at 0,
        # and one that went quiet on the road is simply unknown.
        "speed_kmh": speed_kmh if fresh else 0.0 if status == "Stopped" else None,
        "ignition": ignition,
        "satellites": int(satellites) if satellites is not None and satellites >= 0 else None,
        "gsm": int(gsm) if gsm is not None and gsm >= 0 else None,
        "distance_km": round(distance / 1000, 2) if distance is not None and distance >= 0 else None,
        "course": number(position.get("course")),
        "address": str(position.get("address") or "")[:500],
    }


def answered_at_once(key, answer):
    """The answer already in hand, and a fresh one fetched behind it.

    The GPS service takes about a second to answer, and a page that asks every
    few seconds would hold one of the server's few workers for that second
    each time - with a handful of schools watching their buses, everything else
    waits behind them. So whoever asks is given the last answer, when it is no
    older than ANSWER_KEEP_SECONDS, and one fresh answer is fetched in the
    background for the next time anyone asks. Only the first to ask after a
    quiet spell waits for the provider.
    """
    held = cache.get(key)
    if isinstance(held, (list, tuple)) and len(held) == 2 and 0 <= time.time() - held[0] < ANSWER_KEEP_SECONDS:
        at, result = held
        # One fetch at a time, however many pages ask while it is under way.
        if time.time() - at >= REFRESH_SECONDS / 2 and cache.add(f"{key}:fetching", 1, ANSWER_KEEP_SECONDS):
            from .push import _in_background

            _in_background(_answer_afresh, key, answer)
        return result
    result = answer()
    cache.set(key, (time.time(), result), ANSWER_KEEP_SECONDS * 3)
    return result


def _answer_afresh(key, answer):
    try:
        cache.set(key, (time.time(), answer()), ANSWER_KEEP_SECONDS * 3)
    finally:
        cache.delete(f"{key}:fetching")


def school_buses(config, school_id):
    buses = assignments(config, school_id)
    if not buses:
        return {"buses": [], "configured": False, "message": "No buses have been linked to your school yet."}
    # A provider that cannot be read does not make the school's buses vanish:
    # they are listed as they are known, with nothing claimed about where they
    # are, and the reason is said once over the list.
    problem = None
    try:
        positions = fetch_positions(config)
    except TrackingUnavailable as exc:
        positions, problem = [], str(exc)
    allowed = {bus["id"] for bus in buses}
    latest = {}
    for position in positions:
        device_id = position.get("deviceId")
        if type(device_id) is not int or device_id not in allowed:
            continue
        previous = latest.get(device_id)
        date = timestamp(position.get("fixTime"))
        previous_date = timestamp(previous.get("fixTime")) if previous else None
        if previous is None or (date and (previous_date is None or date > previous_date)):
            latest[device_id] = position
    names = device_names(config) if not problem and any(not bus.get("name") for bus in buses) else {}
    now = timezone.now()
    rows = [{
        "id": bus["id"],
        "name": str(bus.get("name") or names.get(bus["id"]) or f"Bus {bus['id']}")[:120],
        **bus_state(latest.get(bus["id"], {}), now, clock_error(latest.get(bus["id"], {}))),
    } for bus in buses]
    # Where each bus is, in words. The address a fix arrived with is kept only
    # when the geocoder has nothing to say about the spot.
    places = place_names(config, {(row["latitude"], row["longitude"]) for row in rows if row["latitude"] is not None})
    for row in rows:
        row["address"] = places.get((row["latitude"], row["longitude"])) or row["address"]
    rows.sort(key=lambda bus: bus["name"].lower())
    result = {"buses": rows, "configured": True, "fetched_at": now.isoformat(), "refresh_seconds": REFRESH_SECONDS}
    if problem:
        for row in rows:
            row["status"] = "Tracking unavailable"
        result.update(unavailable=True, message=problem, refresh_seconds=15)
    return result
