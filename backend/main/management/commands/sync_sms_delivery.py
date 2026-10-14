import os
import time

import requests
from django.core.management.base import BaseCommand
from django.utils import timezone

from main.models.SMSLog import SMSLog, STATUS_DELIVERED, STATUS_QUEUED
from main.models.SchoolAdmin import SchoolAdmin


REPORT_API = os.environ.get(
    "SMS_REPORT_API", "https://sms.aakashsms.com/sms/v1/report/api"
)


class Command(BaseCommand):
    """
    Turn "queued" into "delivered" on the school's SMS report.

    The gateway answers a SEND with `queued` — accepted, not yet delivered. Its
    delivery report is a separate, page-only feed per API key (no date filter, no
    lookup by id), so the only way to reconcile is to walk the recent pages and
    match on the provider's message id, which is exactly what we stored.

    Read-only against the provider and idempotent: it only ever moves a row from
    queued to delivered, so re-running it changes nothing that is already done.
    """

    help = "Mark queued SMS as delivered using the provider's delivery report."

    def add_arguments(self, parser):
        parser.add_argument(
            "--school", type=int, help="Only this school (default: every school)."
        )
        parser.add_argument(
            "--pages",
            type=int,
            default=3,
            help="Report pages to walk per school, newest first (default 3).",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Write the updates. Without it, only reports what would change.",
        )

    def handle(self, *args, **opts):
        w = self.stdout.write
        schools = SchoolAdmin.objects.exclude(account__sms_api__isnull=True).exclude(
            account__sms_api=""
        )
        if opts.get("school"):
            schools = schools.filter(id=opts["school"])
        schools = schools.values_list("id", "name", "account__sms_api")
        if not schools:
            w(self.style.WARNING("no school has an SMS API key"))
            return

        total = 0
        for school_id, name, api_key in schools:
            # nothing outstanding for this school? then don't call the provider.
            pending = set(
                SMSLog.objects.filter(
                    school_id=school_id, status=STATUS_QUEUED, provider_id__isnull=False
                ).values_list("provider_id", flat=True)
            )
            if not pending:
                continue
            delivered = self._delivered_ids(api_key, opts["pages"]) & pending
            w(f"{name} [{school_id}]: {len(pending)} queued, {len(delivered)} delivered")
            if delivered and opts["apply"]:
                total += SMSLog.objects.filter(
                    school_id=school_id, provider_id__in=delivered
                ).update(status=STATUS_DELIVERED, delivered_at=timezone.now())
        if opts["apply"]:
            w(self.style.SUCCESS(f"updated {total} row(s)"))
        else:
            w(self.style.WARNING("dry run — re-run with --apply to write"))

    def _delivered_ids(self, api_key, pages):
        """Message ids the provider's delivery report lists (= delivered)."""
        ids = set()
        for page in range(1, max(1, pages) + 1):
            try:
                res = requests.post(
                    REPORT_API,
                    {"auth_token": api_key, "page": page},
                    timeout=(5, 90),
                )
                body = res.json()
            except (requests.RequestException, ValueError) as e:
                self.stdout.write(self.style.ERROR(f"  page {page}: {e}"))
                break
            rows = body.get("data") if isinstance(body, dict) else None
            if not rows:
                break
            for row in rows:
                try:
                    ids.add(int(row.get("id")))
                except (TypeError, ValueError):
                    continue
            if page >= (body.get("total_page") or page):
                break
            # the provider is slow and rate-sensitive; don't hammer it.
            time.sleep(1)
        return ids
