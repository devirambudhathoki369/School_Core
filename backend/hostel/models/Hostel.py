"""The physical hostel: buildings, room types, rooms, beds.

    Hostel          one residence a school runs (Boys / Girls / Mixed)
      HostelBlock     a wing or building inside it            (optional)
        HostelRoom      a numbered room, of some HostelRoomType
          HostelBed       one sleeping place — what a student is actually given

BLOCKS AND BEDS ARE OPTIONAL LAYERS. A small hostel that only tracks rooms
never has to create a block, and `HostelAllocation.bed` is nullable so a school
that thinks in rooms is not forced to number beds first. The layers exist for
the hostels that DO need them, and cost nothing to the ones that don't.

Occupancy is never stored. It is counted from the active allocations, the same
way inventory stock is derived from its transaction ledger — a stored counter
drifts the first time a row is edited outside the one code path that maintains
it, and then the hostel is "full" with empty beds in it.
"""

from django.db.models import (
    ForeignKey,
    IntegerField,
    DecimalField,
    BooleanField,
    TextField,
    JSONField,
    CASCADE,
    SET_NULL,
)

from main.models.BaseModel import BaseModel, CustomCharField, _allow_empty
from ..constants import (
    HOSTEL_TYPE_CHOICES,
    HOSTEL_MIXED,
    ROOM_STATUS_CHOICES,
    ROOM_AVAILABLE,
)

MONEY = {"max_digits": 10, "decimal_places": 2}


class Hostel(BaseModel):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="hostels")
    name = CustomCharField(min_length=2, max_length=60)
    hostel_type = IntegerField(choices=HOSTEL_TYPE_CHOICES, default=HOSTEL_MIXED)
    address = CustomCharField(min_length=2, max_length=80, **_allow_empty)
    contact = CustomCharField(min_length=6, max_length=15, **_allow_empty)
    # The member of staff answerable for this hostel. SET_NULL, not CASCADE:
    # a warden leaving the school must never delete the hostel with them.
    warden = ForeignKey(
        "main.Staff", on_delete=SET_NULL, related_name="warden_of_hostels", **_allow_empty
    )
    remarks = TextField(**_allow_empty)
    preferences = JSONField(default=dict)

    class Meta:
        unique_together = ("school", "name")

    def __str__(self):
        return f"{self.school_id} > {self.name}"


class HostelBlock(BaseModel):
    hostel = ForeignKey("hostel.Hostel", on_delete=CASCADE, related_name="blocks")
    name = CustomCharField(min_length=1, max_length=40)
    floors = IntegerField(default=1)
    warden = ForeignKey(
        "main.Staff", on_delete=SET_NULL, related_name="warden_of_blocks", **_allow_empty
    )
    remarks = CustomCharField(min_length=1, max_length=80, **_allow_empty)

    class Meta:
        unique_together = ("hostel", "name")

    def __str__(self):
        return f"{self.hostel_id} > {self.name}"


class HostelRoomType(BaseModel):
    """What a room IS, and what living in one costs per month.

    The fee lives here rather than on the room so a school prices its hostel
    once ("4-seater non-AC = Rs. 4,500") instead of on every room. The amount a
    particular student pays is SNAPSHOT onto their allocation at check-in, so
    re-pricing next year's rooms never silently re-prices this year's bills.
    """

    hostel = ForeignKey("hostel.Hostel", on_delete=CASCADE, related_name="room_types")
    name = CustomCharField(min_length=1, max_length=40)
    bed_count = IntegerField(default=1)  # default capacity when a room is created
    monthly_fee = DecimalField(default=0, **MONEY)
    admission_fee = DecimalField(default=0, **MONEY)  # one-time, at check-in
    security_deposit = DecimalField(default=0, **MONEY)  # refundable
    is_ac = BooleanField(default=False)
    remarks = CustomCharField(min_length=1, max_length=80, **_allow_empty)

    class Meta:
        unique_together = ("hostel", "name")

    def __str__(self):
        return f"{self.hostel_id} > {self.name}"


class HostelRoom(BaseModel):
    hostel = ForeignKey("hostel.Hostel", on_delete=CASCADE, related_name="rooms")
    block = ForeignKey(
        "hostel.HostelBlock", on_delete=SET_NULL, related_name="rooms", **_allow_empty
    )
    room_no = CustomCharField(min_length=1, max_length=20)
    floor = IntegerField(default=0)
    room_type = ForeignKey(
        "hostel.HostelRoomType", on_delete=SET_NULL, related_name="rooms", **_allow_empty
    )
    # How many people the room sleeps. Copied from the room type at creation and
    # then editable, because real buildings have one odd room.
    capacity = IntegerField(default=1)
    status = IntegerField(choices=ROOM_STATUS_CHOICES, default=ROOM_AVAILABLE)
    remarks = CustomCharField(min_length=1, max_length=80, **_allow_empty)

    class Meta:
        unique_together = ("hostel", "room_no")

    def __str__(self):
        return f"{self.hostel_id} > Room {self.room_no}"


class HostelBed(BaseModel):
    """One sleeping place. Optional — see the module docstring."""

    room = ForeignKey("hostel.HostelRoom", on_delete=CASCADE, related_name="beds")
    bed_no = CustomCharField(min_length=1, max_length=10)
    remarks = CustomCharField(min_length=1, max_length=80, **_allow_empty)

    class Meta:
        unique_together = ("room", "bed_no")

    def __str__(self):
        return f"{self.room_id} > Bed {self.bed_no}"
