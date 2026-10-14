import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from django.core.management.base import BaseCommand, CommandError

from account.models import StudentAccount, StaffAccount
from backend.firebase.utils import get_access_token
from backend.firebase.messaging import _is_stale_token

FCM_URL = os.environ.get("FCM_URL")

# per-token validation outcomes.
LIVE = "live"      # FCM accepts the token (a real, registered device).
DEAD = "dead"      # FCM reports UNREGISTERED/INVALID_ARGUMENT -> safe to clear.
ERROR = "error"    # transient/unknown (network, quota, 5xx) -> leave it alone.


class Command(BaseCommand):
    help = (
        "Validate every stored FCM device token via FCM's validate_only dry-run. "
        "NO notification is delivered — it only asks FCM whether each token is a "
        "real, registered device. Reports live/dead/error counts per role so you "
        "can see true push reachability. With --clean, nulls the tokens FCM "
        "reports dead (UNREGISTERED/INVALID_ARGUMENT) so coverage stats stay honest "
        "and a re-login re-seeds a live token."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--clean",
            action="store_true",
            help="Null out tokens FCM reports as dead. Without it, read-only.",
        )
        parser.add_argument(
            "--role",
            choices=["student", "staff", "all"],
            default="all",
            help="Which account type(s) to validate (default: all).",
        )
        parser.add_argument(
            "--workers",
            type=int,
            default=20,
            help="Concurrent FCM requests (default: 20). FCM has no multicast, so "
            "each token is one request; this parallelises the sweep.",
        )

    def _validate(self, access_token, token):
        """Dry-run one token against FCM. Delivers nothing. Returns LIVE/DEAD/ERROR."""
        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json; UTF-8",
        }
        body = {"validate_only": True, "message": {"token": token, "data": {"ping": "1"}}}
        try:
            res = requests.post(
                FCM_URL, headers=headers, data=json.dumps(body), timeout=15
            )
        except requests.RequestException:
            return ERROR
        if res.status_code == 200:
            return LIVE
        return DEAD if _is_stale_token(res) else ERROR

    def handle(self, *args, **opts):
        w = self.stdout.write
        if not FCM_URL:
            raise CommandError("FCM_URL is not configured.")
        access_token = get_access_token()
        if not access_token:
            raise CommandError("Could not obtain an FCM access token.")

        models = []
        if opts["role"] in ("student", "all"):
            models.append(("student", StudentAccount))
        if opts["role"] in ("staff", "all"):
            models.append(("staff", StaffAccount))

        workers = max(1, opts["workers"])
        grand = {LIVE: 0, DEAD: 0, ERROR: 0}

        for label, model in models:
            tokens = list(
                model.objects.exclude(app_device_token__isnull=True)
                .exclude(app_device_token="")
                .values_list("app_device_token", flat=True)
            )
            tokens = list(dict.fromkeys(tokens))  # de-dupe shared-device tokens
            if not tokens:
                w(f"{label}: no stored tokens.")
                continue

            counts = {LIVE: 0, DEAD: 0, ERROR: 0}
            dead_tokens = []
            with ThreadPoolExecutor(max_workers=workers) as ex:
                futures = {ex.submit(self._validate, access_token, t): t for t in tokens}
                for fut in as_completed(futures):
                    outcome = fut.result()
                    counts[outcome] += 1
                    if outcome == DEAD:
                        dead_tokens.append(futures[fut])

            total = len(tokens)
            live_pct = counts[LIVE] / total * 100
            w(
                f"{label}: total={total}  live={counts[LIVE]} ({live_pct:.0f}%)  "
                f"dead={counts[DEAD]}  error={counts[ERROR]}"
            )
            for k in grand:
                grand[k] += counts[k]

            if opts["clean"] and dead_tokens:
                cleaned = model.objects.filter(
                    app_device_token__in=dead_tokens
                ).update(app_device_token=None)
                w(f"  cleaned {cleaned} dead {label} token(s).")

        total_all = sum(grand.values())
        if total_all:
            w(
                f"\nTOTAL: {total_all}  live={grand[LIVE]}  "
                f"dead={grand[DEAD]}  error={grand[ERROR]}"
            )
        if not opts["clean"]:
            w("\nRead-only validation (nothing delivered, nothing cleaned). "
              "Re-run with --clean to null the dead tokens.")
