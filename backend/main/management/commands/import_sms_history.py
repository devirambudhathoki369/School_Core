import os
from datetime import datetime

import requests
import nepali_datetime
from django.core.management.base import BaseCommand
from django.utils import timezone

from main.models.SMSLog import (
    SMSLog,
    SMS_TYPE_OTHER,
    SMS_TYPE_OTP,
    STATUS_DELIVERED,
)
from main.methods.smsLog import OTP_MESSAGE_PLACEHOLDER, looks_like_otp
from main.models.SchoolAdmin import SchoolAdmin
from main.methods.nepaliDatetime import npt


REPORT_API = os.environ.get(
    "SMS_REPORT_API", "https://sms.aakashsms.com/sms/v1/report/api"
)

# The provider stamps a delivery time; which of these it uses is not documented,
# so all the plausible shapes are tried rather than guessed at.
_STAMP_FORMATS = (
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d",
)


class Command(BaseCommand):
    """
    Backfill the SMS report with messages sent BEFORE we started logging.

    Our own log begins the day this feature shipped, so a school opening the
    report sees an empty page even though it has been texting parents for years.
    The provider keeps that history and will hand it back a page at a time; this
    imports it so the report is useful on day one.

    Idempotent: a message is matched on the provider's own id, so re-running
    imports only what is missing. Historical rows carry their real send time and
    are typed "Other" — the provider's report does not say WHICH feature sent a
    message, and inventing that would put wrong labels on real messages. The one
    exception is a bare run of digits, which is an OTP and is masked on the way
    in; the provider's history holds those in the clear, and this report is read
    by every admin of the school.
    """

    help = "Import SMS history from the provider's report API into SMSLog."

    def add_arguments(self, parser):
        parser.add_argument(
            "--school", type=int, help="Only this school (default: every school)."
        )
        parser.add_argument(
            "--pages",
            type=int,
            default=5,
            help="Report pages to pull per school, newest first (default 5).",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Write the rows. Without it, only reports what would import.",
        )
        parser.add_argument(
            "--sample",
            action="store_true",
            help="Print one raw row per school (to verify the provider's shape).",
        )

    def handle(self, *args, **opts):
        w = self.stdout.write
        schools = SchoolAdmin.objects.exclude(account__sms_api__isnull=True).exclude(
            account__sms_api=""
        )
        if opts.get("school"):
            schools = schools.filter(id=opts["school"])
        schools = list(schools.values_list("id", "name", "account__sms_api"))
        if not schools:
            w(self.style.WARNING("no school has an SMS API key"))
            return

        grand_total = 0
        for school_id, name, api_key in schools:
            rows = self._fetch(api_key, opts["pages"])
            if not rows:
                w(f"{name} [{school_id}]: nothing returned")
                continue
            if opts["sample"]:
                w(f"  sample row: {rows[0]}")
            known = set(
                SMSLog.objects.filter(
                    school_id=school_id, provider_id__isnull=False
                ).values_list("provider_id", flat=True)
            )
            logs, seen, undated = [], set(), 0
            for row in rows:
                pid = self._int(row.get("id"), None)
                # No id means nothing to dedupe on: importing it would create a
                # fresh duplicate on every run.
                if pid is None or pid in known or pid in seen:
                    continue
                text = str(row.get("message") or "")
                is_otp = looks_like_otp(text)
                stamp = self._stamp(row.get("delivery_at"))
                if not stamp:
                    # Rather than stamp it "now" — which would date a years-old
                    # message to today and float it to the top of the report —
                    # leave it out and say so. A run that skips everything means
                    # the provider changed its date format: check --sample.
                    undated += 1
                    continue
                seen.add(pid)
                logs.append(
                    SMSLog(
                        school_id=school_id,
                        sms_type=SMS_TYPE_OTP if is_otp else SMS_TYPE_OTHER,
                        receiver=str(row.get("receiver") or "")[:20],
                        # the code itself never reaches the school's report
                        message=OTP_MESSAGE_PLACEHOLDER if is_otp else text,
                        network=str(row.get("network") or "")[:20],
                        credit=self._int(row.get("api_credit"), 0),
                        status=STATUS_DELIVERED,
                        provider_id=pid,
                        date=self._bs_date(stamp),
                        sent_at=stamp,
                        delivered_at=stamp,
                    )
                )
            note = f", {undated} skipped (unreadable date)" if undated else ""
            w(f"{name} [{school_id}]: {len(rows)} fetched, {len(logs)} new{note}")
            if logs and opts["apply"]:
                SMSLog.objects.bulk_create(logs, batch_size=500)
                grand_total += len(logs)
        if opts["apply"]:
            w(self.style.SUCCESS(f"imported {grand_total} message(s)"))
        else:
            w(self.style.WARNING("dry run — re-run with --apply to write"))

    def _fetch(self, api_key, pages):
        rows = []
        for page in range(1, max(1, pages) + 1):
            try:
                res = requests.post(
                    REPORT_API, {"auth_token": api_key, "page": page}, timeout=(5, 90)
                )
                body = res.json()
            except (requests.RequestException, ValueError) as e:
                self.stdout.write(self.style.ERROR(f"  page {page}: {e}"))
                break
            page_rows = body.get("data") if isinstance(body, dict) else None
            if not page_rows:
                break
            rows.extend(r for r in page_rows if isinstance(r, dict))
            if page >= (body.get("total_page") or page):
                break
        return rows

    @staticmethod
    def _stamp(value):
        text = str(value or "").strip()
        for fmt in _STAMP_FORMATS:
            try:
                parsed = datetime.strptime(text, fmt)
            except ValueError:
                continue
            # The provider writes Nepal local time; reading it as UTC would
            # shift every imported message by 5h45m.
            return npt(parsed)
        # An unparseable stamp must not become "now": that would date a
        # years-old message to today and put it at the top of the report.
        return None

    @staticmethod
    def _bs_date(stamp):
        if not stamp:
            return ""
        return str(nepali_datetime.date.from_datetime_date(npt(stamp).date()))

    @staticmethod
    def _int(value, default=0):
        try:
            return int(value)
        except (TypeError, ValueError):
            return default
