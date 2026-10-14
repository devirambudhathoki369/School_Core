"""
Carry a re-issued card outward from the profile it was typed on.

Users Setup writes the number on the student/staff profile — the source of
truth. Everything downstream holds a COPY: one RFIDAttdUser row per device the
person is enrolled on (that copy is what the Registered Users list shows, and
what a later re-sync falls back to), and the device's own user table.

Nothing used to carry an EDIT out to those copies. The enrolment path bulk
creates with ignore_conflicts, so an already-enrolled person's row kept the
first card it was ever given: the profile said one number, the reader held
another, and the badge quietly stopped matching with nothing on screen to
explain it. This is the missing step, and the only place that writes a card
change to both copies at once.
"""

from collections import defaultdict

from django.db.models import Q

from ..models.Attendance import RFIDAttdUser
from .UsersSyncReg import UsersSyncReg, profile_name

KIND_STUDENT = "student"
KIND_STAFF = "staff"


def propagate_card_changes(school_id, changed, skip_command_device_id=None):
    """
    Push changed cards onto every device-linked copy in `school_id`.

    `changed` maps ("student"|"staff", profile_id) -> new card, as returned by
    AttdUserViews._store_cards_on_profiles.

    `skip_command_device_id` names a device the caller is already sending a
    full enrolment to in the same request. Its stored copy is still corrected
    here — it has to be, nothing else does it — but the command is left to the
    caller so the device isn't handed the same card twice.

    Returns (copies_updated, devices_notified).
    """
    if not changed:
        return 0, 0

    student_ids = [pid for kind, pid in changed if kind == KIND_STUDENT]
    staff_ids = [pid for kind, pid in changed if kind == KIND_STAFF]

    who = Q()
    if student_ids:
        who |= Q(student_id__in=student_ids)
    if staff_ids:
        who |= Q(staff_id__in=staff_ids)

    rows = RFIDAttdUser.objects.filter(who, device__school_id=school_id).select_related(
        "device", "student", "staff"
    )

    per_device = defaultdict(list)
    stale = []
    for u in rows:
        profile = u.student or u.staff
        if profile is None:
            continue
        kind = KIND_STUDENT if u.student_id else KIND_STAFF
        card = changed.get((kind, profile.id))
        if not card or (u.card or "").strip() == card:
            continue
        u.card = card
        stale.append(u)
        # Access panels have no card-only update, so update_cards() re-sends
        # the whole enrolment for them — which needs the name too.
        per_device[u.device].append(
            {"pin": u.pin, "card": card, "name": profile_name(profile)}
        )

    if stale:
        RFIDAttdUser.objects.bulk_update(stale, ["card"])

    notified = 0
    for device, payload in per_device.items():
        if skip_command_device_id and device.id == int(skip_command_device_id):
            continue
        UsersSyncReg.update_cards(device, payload)
        notified += 1

    return len(stale), notified
