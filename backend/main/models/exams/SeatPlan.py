"""Exam seat plan.

A school sets its seat plan up in two steps, and the model follows them:

  1. ROOMS belong to the school, not to an exam. A room is created once (name,
     benches, students per bench) and is there for every exam after that.
  2. SEATING belongs to an exam: which classes are sent to which room, and the
     seat each student got. The same rooms are seated again for the next exam,
     either afresh or starting from an earlier exam's choices
     (see `SeatPlanCopyView`).

    SchoolAdmin
      └─ SeatPlanRoom             one physical room (benches × seats)
           ├─ SeatPlanRoomClass   for ONE exam: a class on a bench column/side
           └─ SeatAllocation      for ONE exam: a student's saved seat

Adjacent seats on a bench are filled from DIFFERENT classes (anti-cheating);
students within a class are ordered by the room's configurable `order_by`.

A side may list SEVERAL classes: they fill it one after another (in row-id
order), so the benches a short class leaves empty can be given to another class.
A class that does not fit in one room continues in whichever other room lists it.
"""

from django.db.models import (
    BooleanField,
    ForeignKey,
    IntegerField,
    PositiveIntegerField,
    CASCADE,
)

from ..BaseModel import BaseModel, CustomCharField, _allow_empty


# How students are ordered within a class when seats are assigned.
ORDER_BY_ROLL = 1
ORDER_BY_SYMBOL = 2
ORDER_BY_NAME = 3
ORDER_BY_REGD = 4
ORDER_BY_CHOICES = (
    (ORDER_BY_ROLL, "Roll No"),
    (ORDER_BY_SYMBOL, "Symbol No"),
    (ORDER_BY_NAME, "Name (alphabetical)"),
    (ORDER_BY_REGD, "Registration No"),
)


class SeatPlanRoom(BaseModel):
    """One physical room of the school: a grid of benches × seats."""

    # LEGACY, no longer read. A room used to be created inside one exam's plan;
    # it now belongs to the school, and the exam lives on the room's class rows
    # and seats instead. Rooms made before that keep the exam they were made
    # for here; new rooms leave it empty.
    exam = ForeignKey(
        "main.Exam",
        on_delete=CASCADE,
        related_name="seat_plan_rooms",
        **_allow_empty,
    )
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    name = CustomCharField(min_length=1, max_length=50)  # e.g. "Room 101"
    benches = PositiveIntegerField(default=1)
    seats_per_bench = PositiveIntegerField(default=2)
    # Default ordering for classes in this room (a class can override its own).
    order_by = IntegerField(choices=ORDER_BY_CHOICES, default=ORDER_BY_ROLL)
    note = CustomCharField(min_length=1, max_length=200, **_allow_empty)
    # Whether the saved seating was generated with "shuffle" on. Remembered so
    # re-generating after a room change keeps a shuffled plan shuffled instead
    # of quietly putting it back in roll order.
    shuffled = BooleanField(default=False)


class SeatPlanRoomClass(BaseModel):
    """A class sent to a room for one exam, pinned to a bench column (side).

    Several rows may share a column; they fill it in id order (the order they
    were saved in), each starting where the previous one ran out of students.
    """

    room = ForeignKey(
        "main.SeatPlanRoom", on_delete=CASCADE, related_name="room_classes"
    )
    # The exam this class is sent to the room for. (NULL only on rows nobody
    # tied to an exam.)
    exam = ForeignKey(
        "main.Exam",
        on_delete=CASCADE,
        related_name="seat_plan_classes",
        **_allow_empty,
    )
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)
    # Which seat/side on each bench this class occupies (1 .. seats_per_bench).
    column = PositiveIntegerField(default=1)
    # Optional per-class override of the room's ordering; null = use the room's.
    order_by = IntegerField(choices=ORDER_BY_CHOICES, **_allow_empty)
    # Optional cap on how many of this class's students sit here; null = as
    # many as fit. The rest stay queued for the other rooms that list the class.
    limit = PositiveIntegerField(**_allow_empty)


class SeatAllocation(BaseModel):
    """A student's saved seat. Persisted so an exam's seat plan can be reprinted
    verbatim and a result can be traced to the room/bench the student sat at."""

    room = ForeignKey(
        "main.SeatPlanRoom", on_delete=CASCADE, related_name="allocations"
    )
    # The exam this seat is for -- the same room is seated once per exam.
    exam = ForeignKey(
        "main.Exam",
        on_delete=CASCADE,
        related_name="seat_allocations",
        **_allow_empty,
    )
    student = ForeignKey("main.Student", on_delete=CASCADE)
    # Snapshot of the student's class at seating time.
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)
    bench_no = PositiveIntegerField()
    column = PositiveIntegerField()  # seat/side on the bench
    sequence = PositiveIntegerField()  # overall fill order within the room
