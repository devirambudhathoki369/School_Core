from datetime import datetime, timedelta, timezone as dt_timezone
from typing import Iterator
from zoneinfo import ZoneInfo

from django.utils import timezone

# An access panel's clock runs the school's wall time, but this box runs UTC
# (settings.TIME_ZONE), so reading a panel's timestamp as "current timezone"
# files every punch 5h45m out — and that is before the panel's own timezone
# setting is wrong, as PQU8260900014's was (UTC-7, so a 15:11 tap was stored
# as 08:11 and the day looked like it stopped at breakfast).
#
# Only the access-control path uses this. Attendance terminals go through
# parse_attlog and are deliberately left exactly as they were.
PANEL_TZ = ZoneInfo("Asia/Kathmandu")


def _decode(body):
    return body.decode("utf-8", errors="replace")


def decode_zk_packed_time(value):
    """
    ZK's packed clock -> an aware datetime in the device's local time.

    Despite the field being called `time_second`, this is NOT a Unix epoch. It
    counts seconds from 2000 with every month taken as exactly 31 days, and is
    the exact inverse of the encoder we already use to SET a device's clock
    (device_calls._zk_encoded_time). The vendor's own reader,
    Tools.GetDateTimeBySeconds, does the same divisions in the same order.

    Reading it as a Unix timestamp is not slightly wrong, it is decades wrong:
    a 2026 punch packs to roughly 8.3e8, which as an epoch lands in 1996.

    Returns None rather than raising on a value that doesn't decode to a real
    date — a single malformed record must not sink the batch it arrived in.
    """
    seconds = int(value)
    if seconds < 0:
        return None
    sec = seconds % 60
    seconds //= 60
    minute = seconds % 60
    seconds //= 60
    hour = seconds % 24
    seconds //= 24
    day = seconds % 31 + 1
    seconds //= 31
    month = seconds % 12 + 1
    year = seconds // 12 + 2000
    try:
        naive = datetime(year, month, day, hour, minute, sec)
    except ValueError:
        return None
    # Naive on purpose: the caller applies the panel's clock offset before
    # attaching a timezone, so the correction happens in exactly one place.
    return naive


def parse_attlog(body) -> Iterator[dict]:
    # ATTLOG: one record per line, tab-separated.
    # PIN  Time  Status  Verify  Workcode  ...
    for raw in _decode(body).splitlines():
        line = raw.strip()
        if not line:
            continue
        fields = line.split("\t")
        if len(fields) < 4:
            continue
        pin = fields[0]
        try:
            naive = datetime.strptime(fields[1], "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
        punch_time = timezone.make_aware(naive, timezone.get_current_timezone())
        status = int(fields[2]) if fields[2].lstrip("-").isdigit() else 0
        verify = int(fields[3]) if fields[3].lstrip("-").isdigit() else 0
        workcode = 0
        if len(fields) >= 5 and fields[4].lstrip("-").isdigit():
            workcode = int(fields[4])
        yield {
            "pin": pin,
            "punch_time": punch_time,
            "status": status,
            "verify": verify,
            "workcode": workcode,
        }


def parse_rtlog(body, clock_offset_min: int = 0) -> Iterator[dict]:
    # clock_offset_min: minutes to ADD to this panel's clock to get the
    # school's wall time. PQU8260900014 runs UTC-7 and will not be talked out
    # of it — `SET OPTIONS TimeZone` is ignored, and `Get OPTIONS` answers 0 to
    # every name, so the panel can neither be corrected nor interrogated. The
    # offset is therefore measured (tap at 15:20 recorded as 08:20) and applied
    # here, where it is visible and reversible, rather than left to disguise
    # itself as an attendance day that ends at breakfast.
    # rtlog is what access-control panels (DeviceType=acc) push instead of
    # ATTLOG. Same idea, different table: one event per line, tab-separated
    # key=value pairs. Two dialects are in the wild --
    #   plain:       time=..  pin=..  cardno=..  eventaddr=..  event=..
    #                inoutstatus=..  verifytype=..  index=..
    #   transaction: time_second=<epoch>  pin=..  cardno=..  doorid=..
    #                eventtype=..  inoutstate=..  verified=..  index=..
    # We read by key name rather than position so either shape works, and
    # yield the same record dict parse_attlog does so the whole attendance
    # pipeline can be reused unchanged.
    for raw in _decode(body).splitlines():
        line = raw.strip()
        if not line:
            continue

        kv = {}
        for token in line.replace("transaction", "").split("\t"):
            if "=" in token:
                k, _, v = token.partition("=")
                kv[k.strip().lower()] = v.strip()
        if not kv:
            continue

        # A door alarm / exit-button event carries no person; only real card
        # or biometric verifications map to attendance. A card read the PANEL
        # could not match also arrives with pin=0 — but it carries the badge,
        # and if that badge is one of ours the punch is perfectly attributable.
        # Keeping it is what stopped a whole school's attendance from being
        # silently discarded while the panel had every tap recorded; the
        # caller resolves the badge and drops anything still anonymous.
        pin = kv.get("pin", "").strip()
        cardno = kv.get("cardno", "").strip()
        if (not pin or pin == "0") and not cardno:
            continue

        punch_time = None
        naive = None
        if kv.get("time"):
            try:
                naive = datetime.strptime(kv["time"], "%Y-%m-%d %H:%M:%S")
            except ValueError:
                naive = None
        if naive is None and kv.get("time_second", "").lstrip("-").isdigit():
            naive = decode_zk_packed_time(int(kv["time_second"]))
        if naive is None:
            continue
        if clock_offset_min:
            naive += timedelta(minutes=clock_offset_min)
        punch_time = timezone.make_aware(naive, PANEL_TZ)

        def _int(*names):
            for n in names:
                v = kv.get(n, "")
                if v.lstrip("-").isdigit():
                    value = int(v)
                    # status/verify are 32-bit columns, and a panel can put a
                    # wider bitmask in either. Storing 0 loses a diagnostic
                    # label; letting it through loses the punch AND every
                    # punch behind it, because the insert raises, the push
                    # 500s, and the device re-sends the same batch forever.
                    # Attendance needs the person and the time, not this.
                    if -(2**31) <= value < 2**31:
                        return value
                    return 0
            return 0

        yield {
            "pin": pin,
            # Panels report the badge in hex; kept raw so the caller can match
            # it against either base.
            "cardno": cardno,
            "punch_time": punch_time,
            # in/out direction is the closest analogue to an ATTLOG status;
            # AttendanceTransfer treats any punch as present either way.
            "status": _int("inoutstatus", "inoutstate"),
            "verify": _int("verifytype", "verified"),
            "workcode": 0,
        }


def parse_kv_after_prefix(line):
    # Lines look like: "PREFIX K1=V1\tK2=V2\t..."
    if " " in line:
        _, _, rest = line.partition(" ")
    else:
        rest = line
    out = {}
    for token in rest.split("\t"):
        if "=" in token:
            k, _, v = token.partition("=")
            out[k.strip()] = v
    return out


def parse_operlog(body):
    for raw in _decode(body).splitlines():
        line = raw.strip()
        if not line:
            continue
        prefix = line.split(" ", 1)[0]
        yield prefix, parse_kv_after_prefix(line)


def parse_options_body(body):
    out = {}
    for token in _decode(body).split(","):
        token = token.strip()
        if "=" in token:
            k, _, v = token.partition("=")
            out[k.strip()] = v.strip()
    return out


def parse_table_rows(body) -> Iterator[dict]:
    """
    Rows of a table an access panel uploads in reply to a DATA QUERY.

    One record per line, tab-separated key=value pairs, exactly like rtlog but
    with whatever columns the queried table happens to have. Keys are lowered
    so a caller can read them without caring that the panel writes "CardNo"
    here and "cardno" there.
    """
    for raw in _decode(body).splitlines():
        line = raw.strip()
        if not line:
            continue
        kv = {}
        for token in line.split("\t"):
            if "=" in token:
                k, _, v = token.partition("=")
                kv[k.strip().lower()] = v.strip()
        if kv:
            yield kv
