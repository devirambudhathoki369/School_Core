from datetime import timedelta
from zoneinfo import ZoneInfo

from ..models.Device import Device, DeviceCommand
from django.utils import timezone

NEPAL_TZ = ZoneInfo("Asia/Kathmandu")
# A device that hasn't been seen for at least this long, then reconnects, is
# treated as "was offline" — we auto-ask it to re-upload the punches it buffered
# while away. Short enough to catch real outages, long enough to ignore the
# normal few-seconds polling cadence.
AUTO_PULL_GAP = timedelta(hours=1)


class DeviceRegistry:

    @staticmethod
    def touch(serial, request):
        ip = request.META.get("REMOTE_ADDR")
        device, created = Device.objects.get_or_create(
            serial_number=serial,
            defaults={"ip_address": ip, "state": Device.STATE_CONNECTING},
        )
        # the last time we heard from this device BEFORE this request — used to
        # detect a reconnect after an offline gap.
        prev_last_seen = None if created else device.last_seen
        Device.objects.filter(pk=device.pk).update(
            ip_address=ip or device.ip_address,
            last_seen=timezone.now(),
            state=Device.STATE_ONLINE,
        )
        device.refresh_from_db()
        DeviceRegistry._auto_recover_logs(device, prev_last_seen)
        return device

    @staticmethod
    def _auto_recover_logs(device, prev_last_seen):
        """
        If the device just reconnected after being silent for >= AUTO_PULL_GAP,
        queue a DATA QUERY ATTLOG for the missed window so it re-uploads the
        punches it buffered while offline — automatically, in real time, with no
        admin action. Idempotent ingest makes the re-upload safe. We skip if a
        pull is already pending so repeated polls don't pile up duplicate commands.
        """
        if not prev_last_seen:
            return
        if (timezone.now() - prev_last_seen) < AUTO_PULL_GAP:
            return
        already_queued = DeviceCommand.objects.filter(
            device=device,
            status=DeviceCommand.STATUS_PENDING,
            cmd_content__startswith="DATA QUERY ATTLOG",
        ).exists()
        if already_queued:
            return
        # Bound the window in the device's local clock (Nepal): from the start of
        # the day it went silent through now.
        start_local = prev_last_seen.astimezone(NEPAL_TZ).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        start = start_local.strftime("%Y-%m-%d %H:%M:%S")
        end = timezone.now().astimezone(NEPAL_TZ).strftime("%Y-%m-%d %H:%M:%S")
        # imported here to avoid a circular import at module load.
        from .DeviceCommandQueueReg import CommandQueue

        CommandQueue.enqueue_pull_attlog(device, start=start, end=end)

    @staticmethod
    def update_stamp(device, table, stamp):
        if not stamp:
            return
        attr_for = {
            "ATTLOG": "attlog_stamp",
            "OPERLOG": "operlog_stamp",
            "ATTPHOTO": "photo_stamp",
        }
        attr = attr_for.get(table)
        if attr:
            setattr(device, attr, stamp)
            device.save(update_fields=[attr])

    # One pinned row per device holds its latest self-description. Pinned so a
    # panel that re-registers every 45 minutes leaves one row, not a pile.
    SELF_REPORT_PREFIX = "devinfo-"
    SELF_REPORT_MAX = 3500

    @staticmethod
    def record_self_report(device, body):
        """
        Keep what a device says about itself when it registers.

        The body is comma/tab separated key=value pairs (some keys prefixed
        with ~) covering MachineType, AccSupportFunList, VerifyStyles,
        EventTypes and friends — the vendor reflects it straight onto its
        device record. Knowing a panel's door and reader configuration is the
        difference between diagnosing a wiring fault and guessing at one.

        Stored on a pinned command row rather than new columns: this is
        diagnostic detail whose shape varies by firmware, and it is not worth a
        migration on a table sixteen live readers depend on.
        """
        if not body:
            return
        try:
            text = body.decode("utf-8", errors="replace").strip()
        except Exception:
            return
        if not text:
            return

        from ..models.Device import DeviceCommand

        cmd_id = f"{DeviceRegistry.SELF_REPORT_PREFIX}{device.id}"[:16]
        DeviceCommand.objects.update_or_create(
            cmd_id=cmd_id,
            defaults={
                "device": device,
                # Never STATUS_PENDING: this is a record, not an instruction,
                # and a pending row would be handed to the device to execute.
                "status": DeviceCommand.STATUS_DONE,
                "cmd_content": "(device self-report at registry)",
                "return_info": text[: DeviceRegistry.SELF_REPORT_MAX],
                "return_code": 0,
                "finished_at": timezone.now(),
            },
        )

    @staticmethod
    def set_user_count(device, count):
        """
        Record how many users a device says it holds.

        Attendance terminals volunteer this in their INFO= poll; access panels
        only ever say it in reply to a DATA QUERY, so it arrives through a
        different door and is set on its own here.
        """
        if device.user_count == count:
            return
        device.user_count = count
        device.save(update_fields=["user_count"])

    @staticmethod
    def update_counters(device, info):
        # info is comma-separated: firmware, users, fp, trans, ip, ..., faces
        parts = info.split(",")
        if len(parts) >= 1:
            device.firmware = parts[0]
        if len(parts) >= 2 and parts[1].isdigit():
            device.user_count = int(parts[1])
        if len(parts) >= 3 and parts[2].isdigit():
            device.fp_count = int(parts[2])
        if len(parts) >= 4 and parts[3].isdigit():
            device.trans_count = int(parts[3])
        if len(parts) >= 5:
            device.ip_address = parts[4] or device.ip_address
        if len(parts) >= 9 and parts[8].isdigit():
            device.face_count = int(parts[8])
        device.save()
