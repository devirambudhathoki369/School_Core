"""
Ingest for controller-fronted UHF readers (UHF5E Pro -> ESP32 -> HTTP).

Different wire protocol from the ZK terminals, same destination: a scan ends up
as an RFIDAttdLogs row and is transferred to Student/StaffAttendance by the
existing AttendanceReg pipeline. Nothing downstream of `ingest_scan` knows or
cares which kind of reader produced the punch.

Two things this path has to solve that the ZK path doesn't:

1. **Debounce.** A ZK terminal is a deliberate act — you present a badge and it
   beeps once. A UHF reader in "Read Always" mode re-reads every tag in its ~4m
   field several times a second, so one person walking through a gate produces
   dozens of scans, and someone queueing nearby produces them continuously
   without ever entering. We drop repeats of the same EPC on the same reader
   inside a window (default 5 min) before they ever reach the database.

2. **Unknown tags.** The reader has no user table to verify against, so it emits
   the EPC of any Gen2 tag in range. Unrecognised ones are recorded in
   UnknownScan for the enrollment screen instead of being discarded.
"""

from django.core.cache import cache
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from main.models.Student import Student
from main.models.Staff import Staff

from ..models.Attendance import RFIDAttdUser
from ..models.UHF import UnknownScan
from .AttendanceReg import AttendanceIngest

# Repeat scans of the same EPC on the same reader inside this window are
# ignored. Long enough to cover a person loitering in the field, short enough
# that a genuine re-entry after break still registers.
DEFAULT_DEBOUNCE_SECONDS = 300

VERIFY_RFID_CARD = 4

# RFIDAttdUser.pin discriminators, matching serializers.AttendanceSerializers.
DIS_STUDENT = 1
DIS_STAFF = 2


def debounce_seconds():
    return int(getattr(settings, "UHF_SCAN_DEBOUNCE_SECONDS", DEFAULT_DEBOUNCE_SECONDS))


def normalize_epc(raw):
    """
    EPCs arrive as hex from the controller. Upper-case and strip so that
    'e2 00 47 11' and 'E2004711' compare equal, and so a value stored on a
    profile by hand matches one read off the air.
    """
    return "".join((raw or "").split()).upper()


class UHFIngest:

    @staticmethod
    def is_duplicate(device_id, epc):
        """
        True if this EPC was already accepted on this reader inside the window.

        `cache.add` is atomic on Redis (SET NX EX), so two workers handling
        simultaneous posts of the same tag can't both win — exactly one gets
        True back and the other is told it's a duplicate.
        """
        key = f"rfid:uhf:{device_id}:{epc}"
        accepted = cache.add(key, 1, timeout=debounce_seconds())
        return not accepted

    @staticmethod
    def resolve(device, epc):
        """
        EPC -> RFIDAttdUser for this device, or None if the tag is unenrolled.

        Looks first at users already linked to this device, then falls back to
        the profile card (Student/Staff.rfid_card), which is the source of truth
        and may have been filled in before this reader existed. On a profile
        hit we create the missing device link so subsequent scans take the fast
        path — the UHF reader stores nothing itself, so unlike the ZK flow there
        is no card to push back down to the device.
        """
        linked = (
            RFIDAttdUser.objects.filter(device=device, card=epc)
            .only("id", "pin", "student_id", "staff_id")
            .first()
        )
        if linked:
            return linked

        school_id = device.school_id
        student_id = (
            Student.objects.filter(rfid_card=epc, class_info__school=school_id)
            .values_list("id", flat=True)
            .first()
        )
        staff_id = None
        if not student_id:
            staff_id = (
                Staff.objects.filter(rfid_card=epc, school=school_id)
                .values_list("id", flat=True)
                .first()
            )
        if not student_id and not staff_id:
            return None

        discriminator = DIS_STUDENT if student_id else DIS_STAFF
        profile_id = student_id or staff_id
        attd_user, _ = RFIDAttdUser.objects.get_or_create(
            device=device,
            pin=f"{device.id}{discriminator}{profile_id}",
            defaults={
                "card": epc,
                "student_id": student_id,
                "staff_id": staff_id,
                "verify": VERIFY_RFID_CARD,
            },
        )
        # An existing link that predates the tag (card entered later, or the
        # student swapped to a UHF tag) still needs the EPC written on it.
        if attd_user.card != epc:
            attd_user.card = epc
            attd_user.save(update_fields=["card"])
        return attd_user

    @staticmethod
    def record_unknown(device, epc, bits, reader_id):
        """Keep the newest sighting per (device, epc), counting repeats."""
        obj, created = UnknownScan.objects.get_or_create(
            device=device,
            epc=epc,
            defaults={"bits": bits or 0, "reader_id": reader_id or ""},
        )
        if not created:
            UnknownScan.objects.filter(pk=obj.pk).update(
                seen_count=obj.seen_count + 1,
                bits=bits or obj.bits,
                last_seen=timezone.now(),
            )
        return obj

    @staticmethod
    def ingest_scan(device, epc, bits=0, reader_id="", direction=None, punch_time=None):
        """
        Handle one scan. Returns (outcome, detail) where outcome is one of
        'recorded' | 'duplicate' | 'unknown', so the controller gets an honest
        answer and we can show a live reason on the dashboard.

        Debounce runs BEFORE resolution on purpose: an unenrolled tag sitting in
        the field would otherwise hammer UnknownScan with writes all day.
        """
        epc = normalize_epc(epc)
        if not epc:
            return "invalid", None

        if UHFIngest.is_duplicate(device.id, epc):
            return "duplicate", None

        attd_user = UHFIngest.resolve(device, epc)
        if attd_user is None:
            unknown = UHFIngest.record_unknown(device, epc, bits, reader_id)
            return "unknown", unknown

        # Direction becomes the ZK status code, so the whole downstream
        # check-in/check-out derivation keeps working untouched.
        heading = direction or device.direction
        status = (
            AttendanceIngest.STATUS_CHECKIN
            if heading == device.DIRECTION_IN
            else 1  # Check-out
        )
        record = {
            "pin": attd_user.pin,
            "punch_time": punch_time or timezone.now(),
            "status": status,
            "verify": VERIFY_RFID_CARD,
            "workcode": 0,
        }
        with transaction.atomic():
            AttendanceIngest.ingest_attlog(device, None, _records=[record])
        return "recorded", attd_user
