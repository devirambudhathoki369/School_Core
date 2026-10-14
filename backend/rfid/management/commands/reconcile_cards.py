"""
Bring device-linked card copies back in line with the profiles.

Until CardPropagation existed, editing a card in Users Setup wrote it to the
student/staff profile and stopped there: the RFIDAttdUser row kept whatever
number it was enrolled with, and so did the reader. That leaves people whose
profile says one card and whose badge is still the old one — the Registered
Users list shows the stale number and the door does too.

This walks the enrolments, finds every copy that disagrees with its profile,
writes the profile's number onto the copy, and queues it down to the device.
The profile is always the winner; nothing here ever edits a profile.

Zero-padded profile cards are reported and SKIPPED rather than pushed — a
reader emits 4181677, never 0004181677, so sending the padded form would
break a badge that currently works. Run `strip_card_zeros` first if any turn
up, then run this again.

Usage:
    python manage.py reconcile_cards --dry-run                  # whole fleet
    python manage.py reconcile_cards --school 25 --dry-run
    python manage.py reconcile_cards --device NYU7255003471
    python manage.py reconcile_cards --school 25 --no-push      # DB copies only
"""

from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError

from rfid.models.Attendance import RFIDAttdUser
from rfid.models.Device import Device
from rfid.services.UsersSyncReg import UsersSyncReg, profile_name


class Command(BaseCommand):
    help = "Re-align RFIDAttdUser.card (and the devices) with profile rfid_card."

    def add_arguments(self, parser):
        parser.add_argument("--school", type=int, help="Limit to one school id.")
        parser.add_argument(
            "--device", help="Limit to one device (serial number or numeric id)."
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report the drift without writing or queuing anything.",
        )
        parser.add_argument(
            "--no-push",
            action="store_true",
            help="Fix the stored copies but queue nothing to the devices.",
        )

    def _resolve_device(self, ref):
        device = Device.objects.filter(serial_number=ref).first()
        if device is None and ref.isdigit():
            device = Device.objects.filter(id=int(ref)).first()
        if device is None:
            raise CommandError(f"No device found for '{ref}'.")
        return device

    def handle(self, *args, **options):
        rows = RFIDAttdUser.objects.select_related(
            "device", "student", "staff"
        ).order_by("device_id", "pin")
        if options["school"]:
            rows = rows.filter(device__school_id=options["school"])
        if options["device"]:
            rows = rows.filter(device=self._resolve_device(options["device"]))

        stale = []
        padded = []
        per_device = defaultdict(list)
        for u in rows:
            profile = u.student or u.staff
            if profile is None:
                continue
            card = (getattr(profile, "rfid_card", "") or "").strip()
            held = (u.card or "").strip()
            if not card or card == held:
                continue
            if card.isdigit() and card.lstrip("0") != card:
                padded.append((u, held, card))
                continue
            self.stdout.write(
                f"  {u.device.serial_number}  PIN={u.pin}  "
                f"{held or '(blank)'} -> {card}  {profile_name(profile)}"
            )
            u.card = card
            stale.append(u)
            per_device[u.device].append(
                {"pin": u.pin, "card": card, "name": profile_name(profile)}
            )

        for u, held, card in padded:
            self.stdout.write(
                self.style.WARNING(
                    f"  SKIPPED (zero-padded profile card) "
                    f"{u.device.serial_number} PIN={u.pin} {held} -> {card}"
                )
            )

        if not stale:
            self.stdout.write(
                self.style.SUCCESS(
                    "Nothing to reconcile — every enrolment matches its profile."
                    + (f" {len(padded)} zero-padded card(s) skipped." if padded else "")
                )
            )
            return

        if options["dry_run"]:
            self.stdout.write(
                self.style.WARNING(
                    f"[dry-run] {len(stale)} copy(ies) across {len(per_device)} "
                    "device(s) would be corrected. Nothing written."
                )
            )
            return

        RFIDAttdUser.objects.bulk_update(stale, ["card"])

        queued = 0
        if not options["no_push"]:
            for device, payload in per_device.items():
                queued += len(UsersSyncReg.update_cards(device, payload))

        self.stdout.write(
            self.style.SUCCESS(
                f"Corrected {len(stale)} stored copy(ies) across "
                f"{len(per_device)} device(s); queued {queued} command(s). "
                "Devices apply them on their next poll."
                + (f" {len(padded)} zero-padded card(s) skipped." if padded else "")
            )
        )
