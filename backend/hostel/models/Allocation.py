"""Who lives where — and what that costs them.

ONE ROW PER STAY. A student who moves from room 12 to room 20 does not have
their allocation edited; the first row is closed as TRANSFERRED and a second
one opens. That is what makes "who was in room 12 in Mangsir" answerable at all,
and it is the same reason `monthly_fee` is snapshot here instead of being read
through to the room type: a bill has to stay explainable after the price list
changes.

Two database-level constraints hold the invariants that a busy warden and two
open browser tabs will otherwise break:

  · a student can hold only ONE active allocation;
  · a bed can hold only ONE active allocation.

Both are partial unique indexes (they only bind rows that are active), so
closed history is free to repeat as often as it likes.
"""

from django.db.models import (
    ForeignKey,
    IntegerField,
    DecimalField,
    BooleanField,
    TextField,
    Q,
    UniqueConstraint,
    CASCADE,
    SET_NULL,
    PROTECT,
)

from customs.NepaliDateField import NepaliDateField
from main.models.BaseModel import BaseModel, CustomCharField, _allow_empty
from main.methods.nepaliDatetime import ndt_today
from ..constants import ALLOCATION_STATUS_CHOICES, ALLOC_ACTIVE

MONEY = {"max_digits": 10, "decimal_places": 2}


class HostelAllocation(BaseModel):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    student = ForeignKey(
        "main.Student", on_delete=CASCADE, related_name="hostel_allocations"
    )
    hostel = ForeignKey(
        "hostel.Hostel", on_delete=CASCADE, related_name="allocations"
    )
    # PROTECT, deliberately: deleting a room that somebody is living in (or has
    # ever lived in) would erase the record their hostel bills were raised
    # against. The room views refuse the delete and say why.
    room = ForeignKey(
        "hostel.HostelRoom", on_delete=PROTECT, related_name="allocations"
    )
    bed = ForeignKey(
        "hostel.HostelBed", on_delete=SET_NULL, related_name="allocations",
        **_allow_empty,
    )
    academic_year = ForeignKey("main.AcademicYear", on_delete=CASCADE)

    check_in_date = NepaliDateField(default=ndt_today)
    check_out_date = NepaliDateField(**_allow_empty)
    status = IntegerField(choices=ALLOCATION_STATUS_CHOICES, default=ALLOC_ACTIVE)

    # ---- money, as agreed at check-in -------------------------------------
    # Snapshot of HostelRoomType.monthly_fee. This is the rate the billing seam
    # reads (see main/constants/payment.py, title "hs"), so a concession is
    # given by simply writing a lower figure here for that student — there is
    # deliberately no separate hostel-discount table to keep in step.
    monthly_fee = DecimalField(default=0, **MONEY)
    admission_fee = DecimalField(default=0, **MONEY)
    security_deposit = DecimalField(default=0, **MONEY)
    deposit_paid = BooleanField(default=False)
    deposit_refunded = BooleanField(default=False)

    # ---- who to call at 2am ------------------------------------------------
    # The student record already carries the guardian. This is the person for
    # THIS stay, which for a boarder is often a local relative rather than the
    # guardian in the village.
    emergency_contact_name = CustomCharField(
        min_length=2, max_length=60, **_allow_empty
    )
    emergency_contact = CustomCharField(min_length=6, max_length=15, **_allow_empty)
    emergency_contact_relation = CustomCharField(
        min_length=2, max_length=30, **_allow_empty
    )

    remarks = TextField(**_allow_empty)

    class Meta:
        constraints = (
            UniqueConstraint(
                fields=("student",),
                condition=Q(status=ALLOC_ACTIVE, is_active=True),
                name="hostel_one_active_allocation_per_student",
            ),
            UniqueConstraint(
                fields=("bed",),
                condition=Q(status=ALLOC_ACTIVE, is_active=True),
                name="hostel_one_active_allocation_per_bed",
            ),
        )
        indexes = ()

    def __str__(self):
        return f"{self.student_id} @ {self.room_id}"
