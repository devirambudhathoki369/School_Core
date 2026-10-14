"""
Reconcile staff/student attendance from already-stored RFID punch logs.

Use it to repair a day whose attendance rows were written by older code (e.g.
before check-in / check-out times existed, or when only status-0 punches counted
as present). It re-runs the current transfer, which marks anyone with a punch
present and derives check-in (first punch) and check-out (last punch >= 1h later,
if the school enables checkout).

Usage:
    python manage.py backfill_attendance                 # today (Nepali date)
    python manage.py backfill_attendance --date 2083-02-19   # a specific BS day
"""

from datetime import timedelta
from zoneinfo import ZoneInfo
from collections import defaultdict

from django.core.management.base import BaseCommand
from django.utils import timezone

from rfid.models.Attendance import RFIDAttdLogs
from rfid.services.AttendanceReg import AttendanceTransfer
from main.methods.nepaliDatetime import ndt_today, nepaliToEnglishDate

NEPAL_TZ = ZoneInfo("Asia/Kathmandu")


class Command(BaseCommand):
    help = "Reconcile staff/student attendance from stored RFID punch logs."

    def add_arguments(self, parser):
        parser.add_argument(
            "--date",
            type=str,
            default=None,
            help="Bikram-Sambat date YYYY-MM-DD to reconcile (default: today).",
        )

    def handle(self, *args, **options):
        bs_date = options.get("date") or ndt_today()
        try:
            eng = nepaliToEnglishDate(bs_date)
        except Exception:
            self.stderr.write(self.style.ERROR(f"Invalid BS date: {bs_date}"))
            return

        start_npt = timezone.datetime(
            eng.year, eng.month, eng.day, tzinfo=NEPAL_TZ
        )
        end_npt = start_npt + timedelta(days=1)

        logs = (
            RFIDAttdLogs.objects.filter(
                punch_time__gte=start_npt,
                punch_time__lt=end_npt,
                user__isnull=False,
            )
            .select_related("user__device")
            .only("punch_time", "user__id", "user__device")
        )

        # group the day's punchers per device: {device: {user_ids}}
        per_device = defaultdict(set)
        device_map = {}
        for log in logs:
            device = log.user.device
            device_map[device.id] = device
            per_device[device.id].add(log.user_id)

        if not per_device:
            self.stdout.write(self.style.WARNING(f"No punch logs found for {bs_date}."))
            return

        total_users = 0
        for device_id, user_ids in per_device.items():
            device = device_map[device_id]
            AttendanceTransfer.process_attendance_logs(device, user_ids, bs_date)
            total_users += len(user_ids)
            self.stdout.write(
                f"Device {device_id}: reconciled {len(user_ids)} user(s)."
            )

        self.stdout.write(
            self.style.SUCCESS(
                f"Done ({bs_date}). Reconciled {total_users} user(s) across "
                f"{len(per_device)} device(s)."
            )
        )
