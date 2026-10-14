"""
Normalize stored RFID card numbers by removing leading zeros.

Cards were sometimes entered zero-padded (e.g. 0004181677) but the device
reads/compares them as plain integers (4181677). This strips the padding across
the profile source-of-truth (Student/Staff.rfid_card) and the device-linked
copies (RFIDAttdUser.card) so what's shown matches what the reader emits.

Shared by the `strip_card_zeros` management command and the admin-panel
"Remove leading zeros" button (rfid.views.UserViews.StripCardZerosView).

Only numeric values that actually change are touched; blanks and non-numeric
values are left alone, and an all-zero value stays "0" (never blanked).
"""

from django.db import transaction

from main.models.Student import Student
from main.models.Staff import Staff
from rfid.models.Attendance import RFIDAttdUser


def strip_zeros(card):
    """Return the de-padded card, or None if it's blank/non-numeric/unchanged."""
    c = (card or "").strip()
    if not c or not c.isdigit():
        return None
    stripped = c.lstrip("0") or "0"
    return stripped if stripped != c else None


def _collect(queryset, field):
    """Return [(obj, old, new), ...] for rows whose card changes."""
    changes = []
    for obj in queryset.only("id", field):
        old = getattr(obj, field)
        new = strip_zeros(old)
        if new is not None:
            setattr(obj, field, new)
            changes.append((obj, old, new))
    return changes


def collect_card_changes(school_id=None):
    """
    Gather card values that need de-padding. Returns
    {"students": [...], "staffs": [...], "attd_users": [...]} where each list
    holds (obj, old, new) tuples (the objs already have the new value set).
    """
    students = Student.objects.exclude(rfid_card__isnull=True).exclude(rfid_card="")
    staffs = Staff.objects.exclude(rfid_card__isnull=True).exclude(rfid_card="")
    attd_users = RFIDAttdUser.objects.exclude(card="")
    if school_id:
        students = students.filter(class_info__school=school_id)
        staffs = staffs.filter(school=school_id)
        attd_users = attd_users.filter(device__school=school_id)
    return {
        "students": _collect(students, "rfid_card"),
        "staffs": _collect(staffs, "rfid_card"),
        "attd_users": _collect(attd_users, "card"),
    }


def apply_card_changes(changes):
    """Persist the collected changes in a single transaction."""
    with transaction.atomic():
        if changes["students"]:
            Student.objects.bulk_update(
                [o for o, _, _ in changes["students"]], ["rfid_card"]
            )
        if changes["staffs"]:
            Staff.objects.bulk_update(
                [o for o, _, _ in changes["staffs"]], ["rfid_card"]
            )
        if changes["attd_users"]:
            RFIDAttdUser.objects.bulk_update(
                [o for o, _, _ in changes["attd_users"]], ["card"]
            )


def strip_school_cards(school_id=None, dry_run=False):
    """Collect (and unless dry_run, apply) card de-padding. Returns the changes dict."""
    changes = collect_card_changes(school_id)
    if not dry_run:
        apply_card_changes(changes)
    return changes
