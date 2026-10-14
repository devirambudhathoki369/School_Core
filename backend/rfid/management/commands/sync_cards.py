"""
Push RFID card numbers stored on student/staff profiles down to a device.

Use it when cards were saved on the profiles before the device existed (or were
entered without re-syncing), so they never reached the device and badge verify
fails even though the user is otherwise enrolled. This reads `rfid_card` from
every student/staff of the device's school, ensures an attendance-user link
exists, and queues `DATA UPDATE USERINFO ... Card=...` commands. The device
applies them on its next poll.

Usage:
    python manage.py sync_cards --device CQTW224560499            # by serial
    python manage.py sync_cards --device 3                        # by id
    python manage.py sync_cards --device CQTW224560499 --role staff
    python manage.py sync_cards --device CQTW224560499 --dry-run
"""

from django.core.management.base import BaseCommand, CommandError

from rfid.models.Device import Device
from rfid.models.Attendance import RFIDAttdUser
from rfid.services.UsersSyncReg import UsersSyncReg

DIS_STUDENT = 1
DIS_STAFF = 2


def _full_name(obj):
    parts = [obj.first_name, getattr(obj, "middle_name", "") or "", obj.last_name]
    return " ".join(p for p in parts if p).strip()


class Command(BaseCommand):
    help = "Push profile RFID cards to a device so badge verify works."

    def add_arguments(self, parser):
        parser.add_argument(
            "--device",
            required=True,
            help="Device serial number or numeric id.",
        )
        parser.add_argument(
            "--role",
            choices=["student", "staff", "both"],
            default="both",
            help="Which profiles to sync (default: both).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be synced without queuing anything.",
        )

    def _resolve_device(self, ref):
        device = Device.objects.filter(serial_number=ref).first()
        if device is None and ref.isdigit():
            device = Device.objects.filter(id=int(ref)).first()
        if device is None:
            raise CommandError(f"No device found for '{ref}'.")
        return device

    def _collect(self, queryset, discriminator, device_id):
        """Return [(pin, name, card, role, obj_id), ...] for carded profiles."""
        rows = []
        for obj in queryset:
            card = (obj.rfid_card or "").strip()
            if not card:
                continue
            pin = f"{device_id}{discriminator}{obj.id}"
            rows.append((pin, _full_name(obj), card, discriminator, obj.id))
        return rows

    def handle(self, *args, **options):
        # Imported here so the command stays importable even if app load order
        # shifts; keeps parity with how other rfid code references main models.
        from main.models.Student import Student
        from main.models.Staff import Staff

        device = self._resolve_device(options["device"])
        role = options["role"]
        dry = options["dry_run"]
        school_id = device.school_id

        rows = []
        if role in ("student", "both"):
            students = (
                Student.objects.filter(class_info__school=school_id)
                .exclude(rfid_card__isnull=True)
                .exclude(rfid_card="")
                .only("id", "first_name", "middle_name", "last_name", "rfid_card")
            )
            rows += self._collect(students, DIS_STUDENT, device.id)
        if role in ("staff", "both"):
            staffs = (
                Staff.objects.filter(school=school_id)
                .exclude(rfid_card__isnull=True)
                .exclude(rfid_card="")
                .only("id", "first_name", "middle_name", "last_name", "rfid_card")
            )
            rows += self._collect(staffs, DIS_STAFF, device.id)

        if not rows:
            self.stdout.write(
                self.style.WARNING(
                    f"No carded profiles found for device {device} "
                    f"(school {school_id})."
                )
            )
            return

        if dry:
            self.stdout.write(f"[dry-run] {len(rows)} card(s) would sync to {device}:")
            for pin, name, card, _, _ in rows:
                self.stdout.write(f"  PIN={pin}  Card={card}  {name}")
            return

        # Make sure each profile has an attendance-user link on this device, so a
        # badge punch maps back to the right student/staff. Existing rows are left
        # alone except for refreshing the card.
        existing = {
            u.pin: u
            for u in RFIDAttdUser.objects.filter(
                device=device, pin__in=[r[0] for r in rows]
            )
        }
        to_create = []
        to_update = []
        for pin, _name, card, dis, obj_id in rows:
            user = existing.get(pin)
            if user is None:
                to_create.append(
                    RFIDAttdUser(
                        device=device,
                        pin=pin,
                        card=card,
                        student_id=obj_id if dis == DIS_STUDENT else None,
                        staff_id=obj_id if dis == DIS_STAFF else None,
                    )
                )
            elif (user.card or "").strip() != card:
                user.card = card
                to_update.append(user)

        if to_create:
            RFIDAttdUser.objects.bulk_create(to_create, ignore_conflicts=True)
        if to_update:
            RFIDAttdUser.objects.bulk_update(to_update, ["card"])

        users_payload = [
            {"name": name.capitalize(), "card": card, "pin": pin}
            for pin, name, card, _, _ in rows
        ]
        UsersSyncReg.add_users(device, users_payload)

        self.stdout.write(
            self.style.SUCCESS(
                f"Queued {len(users_payload)} card(s) for {device}. "
                f"Created {len(to_create)} link(s), refreshed {len(to_update)}. "
                f"The device applies them on its next poll."
            )
        )
