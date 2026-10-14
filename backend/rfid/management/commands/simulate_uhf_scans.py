"""
Fire fake UHF scans at /rfid/scan so the whole path can be exercised before any
hardware exists.

Deliberately posts over HTTP rather than calling the service directly — that way
it also proves out the reader-key auth, the URL routing and the JSON shape the
ESP32 will use, not just the ingest logic.

    # what a real gate looks like: every tag re-read many times per pass
    python manage.py simulate_uhf_scans --reader 30000913825430175 \
        --key <reader_key> --url http://127.0.0.1:8000/rfid/scan --burst 8

    # a tag nobody has enrolled -> should land in UnknownScan
    python manage.py simulate_uhf_scans --reader ... --key ... --epc E20047118813

    # pull real cards for the reader's school instead of inventing EPCs
    python manage.py simulate_uhf_scans --reader ... --key ... --from-profiles 5
"""

import json
import random
import time
import urllib.error
import urllib.request

from django.core.management.base import BaseCommand, CommandError

from main.models.Student import Student
from rfid.models.Device import Device


class Command(BaseCommand):
    help = "Simulate UHF reader scans against the /rfid/scan endpoint."

    def add_arguments(self, parser):
        parser.add_argument("--reader", required=True, help="device serial_number")
        parser.add_argument("--key", required=True, help="the device's reader_key")
        parser.add_argument(
            "--url", default="http://127.0.0.1:8000/rfid/scan", help="endpoint URL"
        )
        parser.add_argument(
            "--epc", action="append", help="EPC to send (repeatable)"
        )
        parser.add_argument(
            "--from-profiles",
            type=int,
            default=0,
            metavar="N",
            help="use N real student rfid_cards from the reader's school",
        )
        parser.add_argument(
            "--burst",
            type=int,
            default=1,
            help="times to re-send each EPC (simulates Read-Always re-reads)",
        )
        parser.add_argument(
            "--delay", type=float, default=0.15, help="seconds between posts"
        )
        parser.add_argument(
            "--direction", choices=("in", "out"), help="override reader direction"
        )
        parser.add_argument("--bits", type=int, default=98, help="Wiegand bit length")

    def handle(self, *args, **opts):
        device = Device.objects.filter(serial_number=opts["reader"]).first()
        if device is None:
            raise CommandError(
                f"No device registered with serial {opts['reader']!r}. "
                "Register it first (RFID > Devices) with reader_kind='uhf'."
            )

        epcs = list(opts.get("epc") or [])
        if opts["from_profiles"]:
            cards = list(
                Student.objects.filter(
                    class_info__school=device.school_id, is_active=True
                )
                .exclude(rfid_card__isnull=True)
                .exclude(rfid_card="")
                .values_list("rfid_card", flat=True)[: opts["from_profiles"]]
            )
            if not cards:
                self.stderr.write(
                    self.style.WARNING(
                        f"No students with an rfid_card in school {device.school_id}; "
                        "falling back to random EPCs."
                    )
                )
            epcs.extend(cards)
        if not epcs:
            # EPC-96 style: E2 + random hex, the shape a Gen2 tag actually emits.
            epcs = ["E2%022X" % random.getrandbits(88) for _ in range(3)]

        self.stdout.write(
            f"reader={device.serial_number} school={device.school_id} "
            f"kind={device.reader_kind} dir={device.direction} -> {opts['url']}"
        )

        tally = {}
        for epc in epcs:
            for n in range(opts["burst"]):
                outcome = self._post(opts, epc)
                tally[outcome] = tally.get(outcome, 0) + 1
                marker = "  (re-read)" if n else ""
                self.stdout.write(f"  {epc:<26} -> {outcome}{marker}")
                if opts["delay"]:
                    time.sleep(opts["delay"])

        summary = "  ".join(f"{k}={v}" for k, v in sorted(tally.items()))
        self.stdout.write(self.style.SUCCESS(f"\ndone: {summary}"))
        if tally.get("duplicate"):
            self.stdout.write(
                "debounce swallowed %d re-read(s) — that is the gate-accuracy "
                "guard working." % tally["duplicate"]
            )

    def _post(self, opts, epc):
        payload = {
            "reader_id": opts["reader"],
            "epc": epc,
            "bits": opts["bits"],
        }
        if opts.get("direction"):
            payload["direction"] = opts["direction"]

        req = urllib.request.Request(
            opts["url"],
            data=json.dumps(payload).encode(),
            headers={
                "Content-Type": "application/json",
                "X-Reader-Key": opts["key"],
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode()).get("status", "?")
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")[:120]
            return f"HTTP {e.code}: {body}"
        except urllib.error.URLError as e:
            raise CommandError(f"cannot reach {opts['url']}: {e.reason}")
