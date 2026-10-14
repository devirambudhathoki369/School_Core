from collections import defaultdict

from django.core.management.base import BaseCommand

from main.models.Attendance import StudentAttendance
from main.methods.nepaliDatetime import ndt_today
from main.methods.push import dispatch_push, STUDENT_STATUS_RUNNING
from main.models.Notification import RECIPIENT_ROLE_STUDENT

TITLE = "Attendance"
BODY = "You were marked absent today."


class Command(BaseCommand):
    help = (
        "Daily absent push: notify every active, app-using student marked ABSENT "
        "today (BS). Run ONCE per day AFTER the attendance in-time cutoff, so late "
        "punchers aren't wrongly told they're absent. Only schools that took "
        "attendance today have rows, so this self-scopes to active RFID schools. "
        "Stored to each recipient's inbox. Use --date YYYY-MM-DD (BS) to repeat a "
        "past day, --dry-run to preview."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--date", default=None, help="BS date YYYY-MM-DD (default: today)."
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only report who would be notified; don't send.",
        )

    def handle(self, *args, **opts):
        w = self.stdout.write
        date = opts["date"] or ndt_today()
        w(f"Absent notifications for BS date: {date}")

        rows = (
            StudentAttendance.objects.filter(
                class_attendance__date=date,
                status=False,
                is_active=True,
                student__is_active=True,
                student__status=STUDENT_STATUS_RUNNING,
                student__account__app_device_token__isnull=False,
            )
            .values_list(
                "student_id",
                "class_attendance__school",
                "student__account__app_device_token",
            )
            .distinct()
        )

        by_school = defaultdict(list)
        for student_id, school_id, token in rows:
            by_school[school_id].append((student_id, token))

        total = sum(len(v) for v in by_school.values())
        if not total:
            w("No reachable absent students today. Nothing to send.")
            return
        w(f"Reachable absent students: {total} across {len(by_school)} schools.")

        if opts["dry_run"]:
            for school_id, recipients in by_school.items():
                w(f"  (dry-run) school {school_id}: {len(recipients)}")
            return

        for school_id, recipients in by_school.items():
            result = dispatch_push(
                school_id,
                RECIPIENT_ROLE_STUDENT,
                recipients,
                TITLE,
                BODY,
                data={"type": "attendance"},
                store=True,
                include_notification=True,
            )
            w(
                f"  school {school_id}: sent={result.get('sent', 0)} "
                f"failed={result.get('failed', 0)} "
                f"stale={len(result.get('stale_tokens', []))}"
            )
        w(self.style.SUCCESS("Done sending absent notifications."))
