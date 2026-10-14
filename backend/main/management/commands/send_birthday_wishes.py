from collections import defaultdict

from django.core.management.base import BaseCommand
from nepali_datetime import date as bs_date

from customs.Extract import ExtractMonth, ExtractDay
from main.models.Student import Student
from main.models.Staff import Staff
from main.methods.push import (
    dispatch_push,
    STUDENT_STATUS_RUNNING,
    STAFF_STATUS_EMPLOYED,
)
from main.models.Notification import RECIPIENT_ROLE_STUDENT, RECIPIENT_ROLE_STAFF

TITLE = "Happy Birthday! 🎉"


def _wish(first_name):
    name = (first_name or "").strip()
    who = f", {name}" if name else ""
    return f"Happy birthday{who}! 🎂 Wishing you a wonderful day ahead."


class Command(BaseCommand):
    help = (
        "Daily birthday push: notify every active, app-using student and staff "
        "whose birth date (BS) falls on today. Stored to each recipient's inbox. "
        "Run once a day from cron. Use --dry-run to preview without sending."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only report who would be wished; don't send.",
        )

    def handle(self, *args, **opts):
        w = self.stdout.write
        today = bs_date.today()
        cm, cd = today.month, today.day
        w(f"BS today: {today} (month={cm}, day={cd})")

        # students: birthday today, active+running, reachable. group per school.
        students = (
            Student.objects.filter(
                is_active=True,
                status=STUDENT_STATUS_RUNNING,
                account__app_device_token__isnull=False,
            )
            .annotate(m=ExtractMonth("birth_date"), d=ExtractDay("birth_date"))
            .filter(m=cm, d=cd)
            .values_list(
                "id", "class_info__school", "account__app_device_token", "first_name"
            )
        )
        # staff: birthday today via other_info, employed, reachable.
        staff = (
            Staff.objects.filter(
                is_active=True,
                status=STAFF_STATUS_EMPLOYED,
                account__app_device_token__isnull=False,
            )
            .annotate(
                m=ExtractMonth("other_info__birth_date"),
                d=ExtractDay("other_info__birth_date"),
            )
            .filter(m=cm, d=cd)
            .values_list("id", "school", "account__app_device_token", "first_name")
        )

        self._dispatch(RECIPIENT_ROLE_STUDENT, students, opts["dry_run"], "students")
        self._dispatch(RECIPIENT_ROLE_STAFF, staff, opts["dry_run"], "staff")

    def _dispatch(self, role, rows, dry_run, label):
        w = self.stdout.write
        # school_id -> [(recipient_id, token, first_name)]
        by_school = defaultdict(list)
        for rid, school_id, token, first_name in rows:
            by_school[school_id].append((rid, token, first_name))

        total = sum(len(v) for v in by_school.values())
        if not total:
            w(f"No {label} have a birthday today.")
            return
        w(f"{label}: {total} across {len(by_school)} schools.")

        if dry_run:
            w(f"  (dry-run) skipping send for {label}.")
            return

        for school_id, recipients in by_school.items():
            # one push per recipient so the body can carry their name; dispatch_push
            # records NotificationHistory + clears dead tokens per call.
            for rid, token, first_name in recipients:
                dispatch_push(
                    school_id,
                    role,
                    [(rid, token)],
                    TITLE,
                    _wish(first_name),
                    data={"type": "birthday"},
                    store=True,
                    include_notification=True,
                )
            w(f"  school {school_id}: wished {len(recipients)} {label}.")
        w(self.style.SUCCESS(f"Done wishing {label}."))
