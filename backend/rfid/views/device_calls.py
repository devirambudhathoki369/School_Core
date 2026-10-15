from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from django.http import HttpResponse, HttpResponseBadRequest, HttpResponseForbidden
import hashlib
import hmac
import json

from django.conf import settings
from django.utils import timezone
from zoneinfo import ZoneInfo

from ..models.Device import Device
from ..services.DeviceReg import DeviceRegistry
from ..services.AttendanceReg import AttendanceIngest
from ..services.DeviceCommandQueueReg import CommandQueue
from ..services.DeviceReadback import reconcile_users, describe_rows
from ..services.Commands import is_access_control
from .builders import (
    build_init_response,
    build_registered_response,
    build_push_param_response,
)

NEPAL_TZ = ZoneInfo("Asia/Kathmandu")

# shared


def _check_push_key(request):
    # Per-device comm key, opt-in: a device only has to present ?pushcommkey=
    # once its own row carries one. Every live reader's key is blank, so they
    # are unaffected until someone deliberately sets one.
    #
    # This replaces a global settings.PUSH_COMM_KEY check that was dead code —
    # .env defines PUSH_COMM_KEY but settings.py never reads it, so it always
    # resolved to None. Worse, it was all-or-nothing: defining that setting
    # would have locked out the entire fleet in one step.
    #
    # Until a device has a key, its serial is all that identifies it -- and
    # whoever knows it can read the enrolment commands queued for it (card
    # numbers, PINs) and post punches as it. ICLOCK_REQUIRE_PUSH_KEY closes
    # that once every reader is keyed: a keyless device is then refused.
    sn = request.GET.get("SN")
    if not sn:
        return None

    expected = (
        Device.objects.filter(serial_number=sn)
        .values_list("push_comm_key", flat=True)
        .first()
        or ""
    )
    if not expected:
        if getattr(settings, "ICLOCK_REQUIRE_PUSH_KEY", False):
            return HttpResponseForbidden("device has no pushcommkey")
        return None

    given = request.GET.get("pushcommkey", "") or ""
    if not hmac.compare_digest(given.encode(), expected.encode()):
        return HttpResponseForbidden("invalid pushcommkey")
    return None


def _registry_code(serial):
    # Stable per-device token the newer push firmware stores after registering
    # and echoes back. We don't validate it on return, so deriving it from the
    # serial keeps it constant across requests without extra storage/migration.
    return hashlib.md5(("zk-reg-" + (serial or "")).encode()).hexdigest()[:16]


# newer-push registration handshake; without this the device loops
# cdata(options=all) <-> registry(404) forever and never polls getrequest.
@csrf_exempt
@require_POST
def registry(request):
    forbidden = _check_push_key(request)
    if forbidden is not None:
        return forbidden

    sn = request.GET.get("SN")
    if not sn:
        return HttpResponseBadRequest("missing SN")
    device = DeviceRegistry.touch(sn, request)
    # The body of this request is the device describing ITSELF — machine type,
    # the access functions it supports, its verification modes, how many doors
    # and readers it believes it has. The vendor's server parses it straight
    # into its device record (ListenClient.DevRegistry -> Tools.InitModel); we
    # were discarding it, which is why every question about how a panel is
    # wired had to be answered by guessing.
    DeviceRegistry.record_self_report(device, request.body)
    return HttpResponse(
        "RegistryCode=%s" % _registry_code(sn), content_type="text/plain"
    )


# device polling
@require_GET
def getrequest(request):
    forbidden = _check_push_key(request)
    if forbidden is not None:
        return forbidden

    sn = request.GET.get("SN")
    if not sn:
        return HttpResponseBadRequest("missing SN")
    device = DeviceRegistry.touch(sn, request)

    info = request.GET.get("INFO")
    if info:
        DeviceRegistry.update_counters(device, info)

    pending = CommandQueue.pop_pending(device)
    if not pending:
        return HttpResponse("OK", content_type="text/plain")

    body = "\n".join("C:%s:%s" % (c.cmd_id, c.cmd_content) for c in pending)
    return HttpResponse(body, content_type="text/plain")


# device commands
@csrf_exempt
@require_POST
def devicecmd(request):
    forbidden = _check_push_key(request)
    if forbidden is not None:
        return forbidden

    sn = request.GET.get("SN")
    if not sn:
        return HttpResponseBadRequest("missing SN")
    DeviceRegistry.touch(sn, request)

    for raw in request.body.decode("utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line:
            continue
        params = {}
        for p in line.split("&"):
            if "=" in p:
                k, _, v = p.partition("=")
                params[k] = v
        cmd_id = params.get("ID")
        ret = params.get("Return")
        if cmd_id and ret is not None:
            try:
                CommandQueue.mark_done(cmd_id, int(ret), line)
            except ValueError:
                pass
    return HttpResponse("OK", content_type="text/plain")


def _zk_encoded_time(local_dt):
    # ZK's packed clock format (Tools.OldEncodeTime in the C# reference):
    # seconds since 2000, counting every month as 31 days.
    days = (
        (local_dt.year - 2000) * 12 * 31
        + (local_dt.month - 1) * 31
        + local_dt.day
        - 1
    )
    return days * 86400 + (local_dt.hour * 60 + local_dt.minute) * 60 + local_dt.second


# clock sync — newer panels ask us for the time instead of trusting their own
@require_GET
def rtdata(request):
    forbidden = _check_push_key(request)
    if forbidden is not None:
        return forbidden

    sn = request.GET.get("SN")
    if sn:
        DeviceRegistry.touch(sn, request)

    if request.GET.get("type") != "time":
        return HttpResponse("OK", content_type="text/plain")

    # Punches are read back as Nepal local time (AttendanceReg.NEPAL_TZ), so
    # the clock we hand the device has to be Nepal local too, not the box's UTC.
    now = timezone.now().astimezone(NEPAL_TZ)
    body = "DateTime=%d,ServerTZ=%s" % (_zk_encoded_time(now), now.strftime("%z"))
    return HttpResponse(body, content_type="text/plain")


# Answers a "DATA QUERY tablename=..." on an access-control panel.
#
# Attendance terminals report their counters in an INFO= parameter tacked onto
# every getrequest poll. Access panels never send INFO — they poll bare — so
# there is no passive way to learn what one holds. The active way is to ask,
# and the panel answers HERE rather than on cdata, carrying the row count in
# the query string:
#
#   POST /iclock/querydata?SN=..&type=tabledata&tablename=user&count=31
#                              &cmdid=..&packcnt=1&packidx=1
#
# Without this route that POST 404s, the panel never gets an acknowledgement,
# and it retries the same upload every few seconds forever — while the user
# count it was trying to report stays stuck at whatever we last guessed (0).
@csrf_exempt
def querydata(request):
    forbidden = _check_push_key(request)
    if forbidden is not None:
        return forbidden

    sn = request.GET.get("SN")
    if not sn:
        return HttpResponseBadRequest("missing SN")
    device = DeviceRegistry.touch(sn, request)

    tablename = (request.GET.get("tablename") or "").strip().lower()
    count = request.GET.get("count")
    summary = None
    if tablename == "user":
        if count is not None and str(count).isdigit():
            DeviceRegistry.set_user_count(device, int(count))
        # The body carries the rows themselves. Reading them is what turns
        # "the panel reports 31" into something anyone can check: whose PIN is
        # actually on it, and whether the card stored there is the card the
        # student is carrying.
        summary = reconcile_users(device, request.body)
    elif tablename == "transaction":
        # A panel's stored punches arrive here, not on cdata — this is the
        # backfill an access panel can do that "DATA QUERY ATTLOG" never could.
        # Rows carry the same fields as a live rtlog, so the ordinary ingest
        # handles them, deduping against punches we already hold.
        n = AttendanceIngest.ingest_rtlog(device, request.body)
        summary = {"transactions_ingested": n}
        if not n:
            # Ingesting nothing out of a non-empty upload means the rows did
            # not look the way the parser expects. Keep enough of the shape to
            # see why, without keeping the whole table.
            summary["shape"] = describe_rows(request.body)
    elif tablename == "options":
        # A panel answers "Get OPTIONS ..." here, with the values in the body
        # and nothing but a bare count in the query string. Keep them: this is
        # how the device reports its own door and reader configuration, and
        # reading that back is the difference between diagnosing how a
        # controller is wired and guessing at it.
        summary = {"options": (request.body or b"").decode("utf-8", "replace")[:1500]}
    elif tablename:
        # Any other table a panel is asked for — reader/door properties, card
        # formats. We do not act on these, but keeping a bounded sample is what
        # makes a controller's own configuration readable instead of inferred.
        summary = {
            "table": tablename,
            "sample": (request.body or b"").decode("utf-8", "replace")[:1200],
        }

    # The panel splits big tables across packets and re-sends until every one
    # is acknowledged; the command is only finished once the last has landed.
    cmd_id = request.GET.get("cmdid")
    if cmd_id:
        try:
            packcnt = int(request.GET.get("packcnt") or 1)
            packidx = int(request.GET.get("packidx") or 1)
        except (TypeError, ValueError):
            packcnt = packidx = 1
        if packidx >= packcnt:
            info = request.META.get("QUERY_STRING", "")
            if summary:
                info = f"{info}\n{json.dumps(summary)}"
            CommandQueue.mark_done(cmd_id, 0, info)

    # The acknowledgement has to echo "<tablename>=<count>" back. A plain "OK"
    # is not recognised as one, and the panel simply re-uploads the same packet
    # every five seconds until it hears the phrasing it expects. (Vendor AC Push
    # demo, ListenClient.DevSendData — the tabledata branch.)
    if tablename and count is not None:
        return HttpResponse(f"{tablename}={count}", content_type="text/plain")
    return HttpResponse("OK", content_type="text/plain")


# config pull made by newer firmware after it registers
@csrf_exempt
def push(request):
    forbidden = _check_push_key(request)
    if forbidden is not None:
        return forbidden

    sn = request.GET.get("SN")
    if not sn:
        return HttpResponseBadRequest("missing SN")
    device = DeviceRegistry.touch(sn, request)

    # The reference server MD5-checks token against (RegistryCode, SN, timestamp)
    # and silently drops the request on mismatch. We don't: these endpoints have
    # no authentication today anyway, and a failed check would strand a device
    # with no diagnosable symptom.
    return HttpResponse(
        build_push_param_response(device, _registry_code(sn)),
        content_type="text/plain",
    )


# ping
@require_GET
def ping(request):
    sn = request.GET.get("SN")
    if sn:
        DeviceRegistry.touch(sn, request)
    return HttpResponse("OK", content_type="text/plain")


# handle incoming attendance logs
@csrf_exempt
def cdata(request):
    forbidden = _check_push_key(request)
    if forbidden is not None:
        return forbidden

    sn = request.GET.get("SN")
    if not sn:
        return HttpResponseBadRequest("missing SN")
    device = DeviceRegistry.touch(sn, request)

    if request.method == "GET":
        if request.GET.get("options") == "all":
            pushver = request.GET.get("pushver")
            device_type = request.GET.get("DeviceType")
            if pushver:
                device.push_version = pushver
            if device_type:
                device.device_type = device_type
            device.save(update_fields=["push_version", "device_type"])
            # Newer push firmware advertises PushOptionsFlag=1 and expects the
            # registry-style options block; legacy devices keep the original
            # "GET OPTION FROM" response untouched.
            #
            # An access panel gets that block whether or not it sets the flag.
            # Ours does not set it, so it had been served the legacy
            # "GET OPTION FROM" reply all along — the one that carries
            # TransFlag and an attendance terminal's table list, and no
            # TransTables at all. The vendor's server makes no such
            # distinction: InitDeviceConnect hands GetDeviceInitInfo to any
            # registered device, flag or no flag.
            if request.GET.get("PushOptionsFlag") == "1" or is_access_control(
                device
            ):
                return HttpResponse(
                    build_registered_response(device, _registry_code(sn)),
                    content_type="text/plain",
                )
            return HttpResponse(build_init_response(device), content_type="text/plain")
        return HttpResponse("OK", content_type="text/plain")

    if request.method == "POST":
        table = request.GET.get("table", "")
        stamp = request.GET.get("Stamp")
        DeviceRegistry.update_stamp(device, table, stamp)
        body = request.body
        if table == "ATTLOG":
            n = AttendanceIngest.ingest_attlog(device, body)
            return HttpResponse(f"OK: {n}", content_type="text/plain")
        if table == "OPERLOG":
            n = AttendanceIngest.ingest_operlog(device, body)
            return HttpResponse(f"OK: {n}", content_type="text/plain")
        # Access-control panels push their card reads as table=rtlog instead of
        # ATTLOG. Same destination once parsed; see AttendanceIngest.ingest_rtlog.
        if table.lower() == "rtlog":
            n = AttendanceIngest.ingest_rtlog(device, body)
            return HttpResponse(f"OK: {n}", content_type="text/plain")
        # options / ATTPHOTO / rtstate / anything else — just ack.
        return HttpResponse("OK", content_type="text/plain")

    return HttpResponseBadRequest("unsupported method")
