"""Exam seat plan API.

A school sets a seat plan up in two steps:

  1. ROOMS -- created once, with no exam (name, benches, students per bench).
  2. SEATING -- for an exam: which classes go to which room. Saving it seats the
     students; the same rooms are seated again for the next exam.

Endpoints (all under /api/v1/exams/seat-plan):
  GET    /rooms ?school=       the school's rooms (no seating)
  POST   {room}                create a room
  PUT    {id, room}            update a room; with `sides`, also rearrange
                               the bench (which side goes, where a new one sits)
  GET    /sides ?school=&room= what sits on each side of a room, exam by exam
  DELETE ?id=&school=          delete a room -- and its seats in EVERY exam
  GET    ?school=&exam=        an exam's seating: every room, with the classes
                               sent to it for that exam and the saved seats
  POST   /seating {exam, rooms:[{id, classes}]}   save who sits where, and seat
  POST   /generate {exam}      seat again from today's student lists
  POST   /clear {exam, room}   take an exam's seating out of one room, or with
                               room "all" out of every room; nobody is re-seated
  GET    /plans ?school=       which exams have a seating, in head-counts
  POST   /copy {from_exam, to_exam}   start an exam from another exam's seating

Arrangement: each bench column is pinned to a class, so neighbours on a bench
come from different classes (anti-cheating). Students within a class are ordered
by the configurable `order_by` (roll / symbol / name / regd).

A column may carry several classes; they fill it in order, so benches a short
class leaves free can go to another class. Every response also carries
`class_counts` (running students per class) so the UI can show, live, how many
of each class are still without a seat.

POST/PUT also still accept the older shape -- `exam` and `classes` sent along
with the room -- so a browser tab opened before this change keeps working.
"""

import random

from django.db import transaction
from django.db.models import Count
from rest_framework import status
from rest_framework.response import Response

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)

from ...models.Student import Student
from ...models.ClassInfo import ClassInfo
from ...models.exams.Exam import Exam
from ...models.exams.Schedule import ExamSchedule
from ...models.exams.Result import ClassResult
from ...models.exams.SeatPlan import (
    SeatPlanRoom,
    SeatPlanRoomClass,
    SeatAllocation,
    ORDER_BY_ROLL,
    ORDER_BY_SYMBOL,
    ORDER_BY_NAME,
    ORDER_BY_REGD,
)
from ..BaseViews import SecuredAPIView

STUDENT_STATUS_RUNNING = 1

# Generation walks every seat, so a typo like 99999 benches must not get in.
MAX_BENCHES = 500
MAX_SEATS_PER_BENCH = 30


def _pos_int(value, default, maximum=None):
    """`value` as an int >= 1 (capped at `maximum`), or `default` if unusable."""
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    if number < 1:
        return default
    return min(number, maximum) if maximum else number


def _room_text_error(data):
    """What is wrong with a room's name or note, in words -- or None.

    Both are plain text columns of a fixed size. A longer value is refused by
    the database itself, which reached the user as a bare 500 ("value too long
    for type character varying(200)") with nothing to say what to change.
    """
    for field, label in (("name", "Room name"), ("note", "The note")):
        value = data.get(field)
        limit = SeatPlanRoom._meta.get_field(field).max_length
        if value is not None and len(str(value)) > limit:
            return f"{label} can be at most {limit} characters (this one has {len(str(value))})."
    return None


def _exam_param(value):
    """(ok, exam_id) for an optional `exam` in a request.

    Nothing given means the school's standing plan -> (True, None). Anything
    that is given but is not a positive number is a mistake, not "no exam":
    reading it as the standing plan would quietly point a write at the wrong
    plan -> (False, None).
    """
    if value is None or value == "":
        return True, None
    exam_id = _pos_int(value, None)
    return (True, exam_id) if exam_id else (False, None)


def _exam_in_school(exam_id, school_id):
    return Exam.objects.filter(id=exam_id, school_id=school_id).exists()


def _school_rooms(school_id):
    """The school's rooms, in the order they are seated (oldest first)."""
    return SeatPlanRoom.objects.filter(school_id=school_id, is_active=True).order_by("id")


def _of_exam(exam_id):
    """Filter for the class rows / seats of one exam's seating."""
    return {"exam_id": exam_id} if exam_id else {"exam__isnull": True}


def _class_counts(school_id):
    """{class_info_id: running students} for every class of the school.

    Counts exactly the students `_class_students` would seat, so the numbers the
    UI works out from this always match what generating the plan produces.
    """
    rows = (
        Student.objects.filter(
            class_info__school_id=school_id,
            is_active=True,
            status=STUDENT_STATUS_RUNNING,
        )
        .values("class_info")
        .annotate(total=Count("id"))
    )
    return {r["class_info"]: r["total"] for r in rows}


def _eligible_class_ids(exam_id, school_id):
    """Classes a seat plan may use for this exam: every class of the SAME
    education level(s) the exam actually covers, in the exam's academic year.

    The exam's levels are inferred from the classes it touches (routine +
    results) — so a school-level exam never offers high-school classes, etc.
    Returns [] when nothing ties the exam to any class yet (frontend then shows
    all classes as a fallback) -- and for the standing plan, which has no exam
    and so may seat any class of the school.
    """
    if not exam_id:
        return []
    touched = set(
        ExamSchedule.objects.filter(
            exam_id=exam_id, is_active=True
        ).values_list("class_info", flat=True)
    )
    touched |= set(
        ClassResult.objects.filter(
            exam_id=exam_id, is_active=True
        ).values_list("class_info", flat=True)
    )
    if not touched:
        return []
    levels = list(
        ClassInfo.objects.filter(id__in=touched)
        .values_list("education_level", flat=True)
        .distinct()
    )
    academic_year_id = (
        Exam.objects.filter(id=exam_id)
        .values_list("academic_year", flat=True)
        .first()
    )
    qs = ClassInfo.objects.filter(
        school_id=school_id, education_level__in=levels, is_active=True
    )
    if academic_year_id:
        qs = qs.filter(academic_year=academic_year_id)
    return list(qs.values_list("id", flat=True))


def _student_name(s):
    parts = [s.get("first_name"), s.get("middle_name"), s.get("last_name")]
    return " ".join(p for p in parts if p).strip()


def _numeric(value):
    """Sort key that treats numeric strings numerically (roll '10' after '2')."""
    try:
        return (0, int(str(value)))
    except (TypeError, ValueError):
        return (1, str(value or "").lower())


def _sort_students(students, order_by):
    if order_by == ORDER_BY_SYMBOL:
        return sorted(students, key=lambda s: _numeric(s.get("symbol_no")))
    if order_by == ORDER_BY_REGD:
        return sorted(students, key=lambda s: _numeric(s.get("regd_no")))
    if order_by == ORDER_BY_NAME:
        return sorted(students, key=lambda s: _student_name(s).lower())
    # default: roll no
    return sorted(students, key=lambda s: _numeric(s.get("roll_no")))


def _class_students(class_info_id, order_by):
    rows = list(
        Student.objects.filter(
            class_info_id=class_info_id,
            is_active=True,
            status=STUDENT_STATUS_RUNNING,
        ).values(
            "id", "first_name", "middle_name", "last_name",
            "roll_no", "symbol_no", "regd_no",
        )
    )
    return _sort_students(rows, order_by)


def generate_rooms(rooms, exam_id=None, shuffle=False):
    """Seat one exam: allocate students across ALL the given rooms, in room
    order, so a class's students FLOW from one room into the next when a room
    fills up (overflow), instead of being dropped. Each class is dealt from a
    SINGLE shared queue that is consumed across rooms, so a class sent to several
    rooms is never seated twice -- e.g. a class of 13 with only 10 benches in
    room 1 seats 10 there and its remaining 3 continue into room 2 (which can
    also seat other classes).

    Only the class rows and seats of `exam_id` are read and replaced; the same
    rooms' seats in other exams are left exactly as they are. Re-running is
    idempotent. When `shuffle` is set the students within each class are
    randomised. Returns (per_room_seated: {room_id: count}, unseated: int) where
    `unseated` is the number of students of any class in a room that got no seat.

    A column can list several classes: each seat goes to the first of them that
    still has students queued and has not reached its own `limit`.
    """
    rooms = list(rooms)
    of_exam = _of_exam(exam_id)
    # class_info_id -> remaining students, consumed in room/bench/column order
    queues = {}

    def queue_for(class_info_id, order_by):
        if class_info_id not in queues:
            students = _class_students(class_info_id, order_by)
            if shuffle:
                random.shuffle(students)
            queues[class_info_id] = students
        return queues[class_info_id]

    per_room_seated = {}
    with transaction.atomic():
        SeatAllocation.objects.filter(room__in=rooms, **of_exam).delete()
        for room in rooms:
            # column (bench side) -> its classes in fill order, each as
            # [class_info_id, order_by, limit, seated so far in this room]
            col_classes = {}
            for rc in room.room_classes.filter(is_active=True, **of_exam).order_by("column", "id"):
                col_classes.setdefault(rc.column, []).append(
                    [rc.class_info_id, rc.order_by or room.order_by, rc.limit, 0]
                )
            allocations = []
            seq = 0
            for bench in range(1, room.benches + 1):
                for col in range(1, room.seats_per_bench + 1):
                    for entry in col_classes.get(col, ()):
                        class_info_id, order_by, limit, taken = entry
                        if limit and taken >= limit:
                            continue
                        queue = queue_for(class_info_id, order_by)
                        if not queue:
                            continue
                        student = queue.pop(0)
                        entry[3] += 1
                        seq += 1
                        allocations.append(
                            SeatAllocation(
                                room=room,
                                exam_id=exam_id,
                                student_id=student["id"],
                                class_info_id=class_info_id,
                                bench_no=bench,
                                column=col,
                                sequence=seq,
                            )
                        )
                        break
            SeatAllocation.objects.bulk_create(allocations)
            per_room_seated[room.id] = len(allocations)
        # remember how this seating was made (see SeatPlanRoom.shuffled)
        SeatPlanRoom.objects.filter(id__in=[r.id for r in rooms]).update(shuffled=shuffle)
        for room in rooms:
            room.shuffled = shuffle
    # anyone still queued after every room is full has no seat anywhere
    unseated = sum(len(q) for q in queues.values())
    return per_room_seated, unseated


def _serialize_allocations(room, exam_id):
    rows = (
        SeatAllocation.objects.filter(room=room, **_of_exam(exam_id))
        .order_by("sequence")
        .values(
            "id", "student", "class_info", "bench_no", "column", "sequence",
            "student__first_name", "student__middle_name", "student__last_name",
            "student__roll_no", "student__symbol_no", "student__regd_no",
            "student__image",
            "student__class_info", "student__status", "student__is_active",
        )
    )
    out = []
    for r in rows:
        out.append({
            "id": r["id"],
            "student": r["student"],
            "class_info": r["class_info"],
            "bench_no": r["bench_no"],
            "column": r["column"],
            "sequence": r["sequence"],
            "name": _student_name({
                "first_name": r["student__first_name"],
                "middle_name": r["student__middle_name"],
                "last_name": r["student__last_name"],
            }),
            "roll_no": r["student__roll_no"],
            "symbol_no": r["student__symbol_no"],
            "regd_no": r["student__regd_no"],
            "image": r["student__image"] or None,
            # the student has since left the class they were seated as (moved
            # section, left school…): generating again would not seat them here
            "stale": (
                r["student__class_info"] != r["class_info"]
                or r["student__status"] != STUDENT_STATUS_RUNNING
                or not r["student__is_active"]
            ),
        })
    return out


def _serialize_room(room, exam_id=None, seating=True):
    """A room; with `seating`, also the classes sent to it for `exam_id` and the
    seats saved for that exam."""
    data = {
        "id": room.id,
        "name": room.name,
        "benches": room.benches,
        "seats_per_bench": room.seats_per_bench,
        "capacity": room.benches * room.seats_per_bench,
        "order_by": room.order_by,
        "note": room.note or "",
        "shuffled": room.shuffled,
    }
    if seating:
        data["exam"] = exam_id
        data["classes"] = list(
            room.room_classes.filter(is_active=True, **_of_exam(exam_id))
            .order_by("column", "id")
            .values("id", "class_info", "column", "order_by", "limit")
        )
        data["allocations"] = _serialize_allocations(room, exam_id)
    return data


def _save_room_classes(room, exam_id, classes):
    """Replace the classes sent to a room for ONE exam with the given list.

    The list's order is the fill order within each column: rows are recreated in
    that order, and generation reads them back by id. The room's classes in
    other exams are not touched.
    """
    SeatPlanRoomClass.objects.filter(room=room, **_of_exam(exam_id)).delete()
    rows = []
    seen = set()
    for c in classes or []:
        class_info = c.get("class_info")
        if not class_info:
            continue
        column = _pos_int(c.get("column"), 1)
        # a side the room no longer has, or the same class twice on one side
        if column > room.seats_per_bench or (column, str(class_info)) in seen:
            continue
        seen.add((column, str(class_info)))
        rows.append(
            SeatPlanRoomClass(
                room=room,
                exam_id=exam_id,
                class_info_id=class_info,
                column=column,
                order_by=c.get("order_by") or None,
                limit=_pos_int(c.get("limit"), None),
            )
        )
    if rows:
        SeatPlanRoomClass.objects.bulk_create(rows)


def _room_sides(room):
    """What sits on each side of a room's bench, exam by exam -- newest first.

    Shown before a room's "students per bench" is changed, so the school can
    choose the side to take away (or where a new one goes) knowing what that
    does: [{exam, name, academic_year_name, sides: [{column, classes: [{id,
    name}], seated}]}]. A side with neither a class nor a seat is left out.
    """
    plans = {}

    def side_of(row):
        plan = plans.setdefault(
            row["exam"],
            {
                "exam": row["exam"],
                "name": row["exam__name"],
                "academic_year_name": row["exam__academic_year__name"],
                "sides": {},
            },
        )
        side = plan["sides"].setdefault(
            row["column"], {"column": row["column"], "classes": [], "seated": 0}
        )
        if row["class_info"] not in [c["id"] for c in side["classes"]]:
            side["classes"].append({"id": row["class_info"], "name": row["class_info__name"]})
        return side

    fields = ("exam", "exam__name", "exam__academic_year__name", "column", "class_info", "class_info__name")
    for row in (
        SeatPlanRoomClass.objects.filter(room=room, is_active=True)
        .order_by("column", "id")
        .values(*fields)
    ):
        side_of(row)
    for row in (
        SeatAllocation.objects.filter(room=room)
        .values(*fields)
        .annotate(seated=Count("id"))
        .order_by("column", "class_info")
    ):
        side_of(row)["seated"] += row["seated"]
    ordered = sorted(plans.values(), key=lambda p: (p["exam"] is None, -(p["exam"] or 0)))
    for plan in ordered:
        plan["sides"] = [plan["sides"][column] for column in sorted(plan["sides"])]
    return ordered


def _sides_error(sides, old_width, new_width):
    """Why `sides` cannot rearrange a bench, in words -- or None.

    `sides` reads left to right across the NEW bench: the number of an existing
    side that is kept there, or null for a new, empty side.
    """
    if not isinstance(sides, (list, tuple)) or len(sides) != new_width:
        return f"The bench has {new_width} side(s); say what each one is."
    kept = [side for side in sides if side is not None]
    for side in kept:
        if isinstance(side, bool) or not isinstance(side, int) or not 1 <= side <= old_width:
            return f"A side to keep must be one of the bench's sides (1 to {old_width})."
    if len(set(kept)) != len(kept):
        return "A side can be kept only once."
    return None


# A column number no bench reaches (MAX_SEATS_PER_BENCH is 30): sides are parked
# here while they swap places, so two of them never share a number mid-move.
_PARKED = 100000


def _reshape_sides(room, sides):
    """Rearrange the sides of a room's bench, in EVERY exam's seating.

    `sides[i]` is the old side that becomes side i+1; None is a new, empty one.
    A side that is not listed is removed: the classes sent to it and the
    students seated on it go, in every exam -- those students are then simply
    without a seat there, and show as such in step 2. Everything on a kept side
    moves with it, so a seat stays the same bench with the same neighbours.
    Seats left over on a side the bench no longer had are cleared the same way.

    Returns how many seats were removed.
    """
    moves = {old: new for new, old in enumerate(sides, start=1) if old is not None}
    changed = {old: new for old, new in moves.items() if old != new}
    seats_removed = 0
    for model in (SeatPlanRoomClass, SeatAllocation):
        rows = model.objects.filter(room=room)
        gone = rows.exclude(column__in=list(moves))
        if model is SeatAllocation:
            seats_removed = gone.count()
        gone.delete()
        for old in changed:
            rows.filter(column=old).update(column=_PARKED + old)
        for old, new in changed.items():
            rows.filter(column=_PARKED + old).update(column=new)
    # a room fills bench by bench, side by side: keep `sequence` saying so
    exams = SeatAllocation.objects.filter(room=room).values_list("exam", flat=True).distinct()
    for exam_id in list(exams):
        seats = list(
            SeatAllocation.objects.filter(room=room, **_of_exam(exam_id))
            .order_by("bench_no", "column", "id")
        )
        for sequence, seat in enumerate(seats, start=1):
            seat.sequence = sequence
        SeatAllocation.objects.bulk_update(seats, ["sequence"])
    return seats_removed


def _seated(rooms, exam_id, shuffle, school_id, message):
    """Seat `exam_id` across `rooms` and answer with the seating as it now stands."""
    # Global allocation: overflow flows room -> room (see generate_rooms).
    per_room_seated, total_unseated = generate_rooms(rooms, exam_id, shuffle=shuffle)
    serialized = []
    for room in rooms:
        data = _serialize_room(room, exam_id)
        # per-room overflow no longer exists (it flows onward); the only
        # leftover is the global unseated, surfaced on the last room so the
        # UI's "add more benches/rooms" warning still fires.
        data["unseated"] = 0
        serialized.append(data)
    if serialized:
        serialized[-1]["unseated"] = total_unseated
    return Response(
        {
            "message": message,
            "seated": sum(per_room_seated.values()),
            "unseated": total_unseated,
            "rooms": serialized,
            "class_counts": _class_counts(school_id),
        }
    )


SEAT_PLAN_AUTH = (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)


class SeatPlanRoomsView(SecuredAPIView):
    """The school's rooms, with no seating: step 1 of the page."""

    authentication_classes = SEAT_PLAN_AUTH

    def get(self, request):
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        return Response(
            {"rooms": [_serialize_room(r, seating=False) for r in _school_rooms(school_id)]}
        )


class SeatPlanRoomSidesView(SecuredAPIView):
    """What sits on each side of one room's bench, in every exam's seating --
    read before the room's "students per bench" is changed."""

    authentication_classes = SEAT_PLAN_AUTH

    def get(self, request):
        school_id = request.query_params.get("school")
        room_id = _pos_int(request.query_params.get("room"), None)
        if not school_id or not room_id:
            return self.RESPONSE__INVALID_REQUEST
        room = SeatPlanRoom.objects.filter(
            id=room_id, school_id=school_id, is_active=True
        ).first()
        if not room:
            return self.RESPONSE__NOT_FOUND
        return Response(
            {"room": _serialize_room(room, seating=False), "exams": _room_sides(room)}
        )


class SeatPlanView(SecuredAPIView):
    authentication_classes = SEAT_PLAN_AUTH

    def get(self, request):
        school_id = request.query_params.get("school")
        ok, exam_id = _exam_param(request.query_params.get("exam"))
        if not ok or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        return Response(
            {
                "rooms": [_serialize_room(r, exam_id) for r in _school_rooms(school_id)],
                # classes the seat plan may use (exam's education level(s) only)
                "eligible_classes": _eligible_class_ids(exam_id, school_id),
                "class_counts": _class_counts(school_id),
            }
        )

    def post(self, request):
        data = request.data
        school_id = data.get("school")
        ok, exam_id = _exam_param(data.get("exam"))
        if not ok or not school_id or not data.get("name"):
            return self.RESPONSE__INVALID_REQUEST
        # `school` is the caller's own (checked at sign-in); the exam must be
        # that school's too, or classes could be hung on another school's exam
        if exam_id and not _exam_in_school(exam_id, school_id):
            return self.RESPONSE__INVALID_REQUEST
        error = _room_text_error(data)
        if error:
            return Response({"message": error}, status=status.HTTP_400_BAD_REQUEST)
        room = SeatPlanRoom.objects.create(
            school_id=school_id,
            name=data.get("name"),
            benches=_pos_int(data.get("benches"), 1, MAX_BENCHES),
            seats_per_bench=_pos_int(data.get("seats_per_bench"), 2, MAX_SEATS_PER_BENCH),
            order_by=data.get("order_by") or ORDER_BY_ROLL,
            note=data.get("note") or None,
        )
        if "classes" in data:
            _save_room_classes(room, exam_id, data.get("classes"))
        return Response(
            {"message": "Room saved!", "room": _serialize_room(room, seating=False)}
        )

    def put(self, request):
        data = request.data
        room_id = data.get("id")
        school_id = data.get("school")
        ok, exam_id = _exam_param(data.get("exam"))
        if not ok or not room_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        room = SeatPlanRoom.objects.filter(
            id=room_id, school_id=school_id, is_active=True
        ).first()
        if not room:
            return self.RESPONSE__NOT_FOUND
        if exam_id and not _exam_in_school(exam_id, school_id):
            return self.RESPONSE__INVALID_REQUEST
        error = _room_text_error(data)
        if error:
            return Response({"message": error}, status=status.HTTP_400_BAD_REQUEST)
        old_width = room.seats_per_bench
        new_width = old_width
        if data.get("seats_per_bench") is not None:
            new_width = _pos_int(data.get("seats_per_bench"), old_width, MAX_SEATS_PER_BENCH)
        # `sides`: how the bench is rearranged -- which side goes, where a new
        # one sits. Checked before anything is changed.
        sides = data.get("sides")
        if sides is not None:
            error = _sides_error(sides, old_width, new_width)
            if error:
                return Response({"message": error}, status=status.HTTP_400_BAD_REQUEST)
        seats_removed = 0
        with transaction.atomic():
            for field in ("name", "order_by"):
                if field in data and data.get(field) is not None:
                    setattr(room, field, data.get(field))
            if data.get("benches") is not None:
                room.benches = _pos_int(data.get("benches"), room.benches, MAX_BENCHES)
            room.seats_per_bench = new_width
            if "note" in data:
                room.note = data.get("note") or None
            room.save()
            if sides is not None:
                seats_removed = _reshape_sides(room, sides)
            else:
                # A page that does not say how (opened before `sides` existed):
                # fewer students per bench drops the last sides' classes, in
                # every exam; their seats go at that exam's next seating.
                SeatPlanRoomClass.objects.filter(room=room, column__gt=room.seats_per_bench).delete()
            if "classes" in data:
                _save_room_classes(room, exam_id, data.get("classes"))
        return Response(
            {
                "message": "Room updated!",
                "room": _serialize_room(room, seating=False),
                "seats_removed": seats_removed,
            }
        )

    def delete(self, request):
        room_id = request.query_params.get("id")
        school_id = request.query_params.get("school")
        if not room_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        room = SeatPlanRoom.objects.filter(
            id=room_id, school_id=school_id
        ).first()
        if not room:
            return self.RESPONSE__NOT_FOUND
        room.delete()  # cascades its classes + seats, in every exam
        return Response({"message": "Room deleted!"})


class SeatPlanSeatingView(SecuredAPIView):
    """Save who sits where for an exam -- every room at once -- and seat it.

    `rooms` lists the rooms whose classes are being set: [{id, classes: [{
    class_info, column, limit}]}]. A room that is left out keeps the classes it
    has. One request and one transaction, so the page never shows a seating that
    is half saved.
    """

    authentication_classes = SEAT_PLAN_AUTH

    def post(self, request):
        data = request.data
        school_id = data.get("school")
        ok, exam_id = _exam_param(data.get("exam"))
        if not ok or not school_id or not exam_id:
            return self.RESPONSE__INVALID_REQUEST
        if not _exam_in_school(exam_id, school_id):
            return self.RESPONSE__INVALID_REQUEST
        rooms = list(_school_rooms(school_id))
        if not rooms:
            return Response(
                {"message": "Add the rooms first."}, status=status.HTTP_404_NOT_FOUND
            )
        by_id = {room.id: room for room in rooms}
        order_by = _pos_int(data.get("order_by"), None)
        if order_by not in (None, ORDER_BY_ROLL, ORDER_BY_SYMBOL, ORDER_BY_NAME, ORDER_BY_REGD):
            return self.RESPONSE__INVALID_REQUEST
        with transaction.atomic():
            for entry in data.get("rooms") or []:
                room = by_id.get(_pos_int((entry or {}).get("id"), None))
                if room:  # a room of another school is simply not there
                    _save_room_classes(room, exam_id, entry.get("classes"))
            if order_by:
                SeatPlanRoom.objects.filter(id__in=list(by_id)).update(order_by=order_by)
                for room in rooms:
                    room.order_by = order_by
            return _seated(
                rooms, exam_id, bool(data.get("shuffle")), school_id, "Students seated!"
            )


class SeatPlanGenerateView(SecuredAPIView):
    authentication_classes = SEAT_PLAN_AUTH

    def post(self, request):
        school_id = request.data.get("school")
        ok, exam_id = _exam_param(request.data.get("exam"))
        shuffle = bool(request.data.get("shuffle"))
        if not ok or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        rooms = list(_school_rooms(school_id))
        if not rooms:
            return self.RESPONSE__NOT_FOUND
        return _seated(rooms, exam_id, shuffle, school_id, "Seat plan generated!")


ALL_ROOMS = "all"


def _room_id(value):
    """`value` as a room's id, or None -- read strictly, because what it names
    is about to be emptied. Only a whole number, or its digits as text, will do:
    `int()` alone would also take 1.5 or True and clear room 1."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value > 0 else None
    if isinstance(value, str) and value.isascii() and value.isdigit():
        return int(value) or None
    return None


class SeatPlanClearView(SecuredAPIView):
    """Take an exam's seating out of one room -- or out of every room.

    The classes sent to the room for that exam and the seats made there are
    removed. The room itself stays, and so does everything it holds for other
    exams.

    Nobody is seated again. The other rooms keep every seat exactly as it is --
    a class that carried on from the cleared room into a later one is not moved
    up -- so a chart already printed for another room stays right. The students
    who sat in the cleared room are simply without a seat, and step 2 shows
    them as such.

    `room` is a room's id, or "all" for every room. It is never optional: a
    request that lost its room on the way must not empty the whole exam.
    """

    authentication_classes = SEAT_PLAN_AUTH

    def post(self, request):
        data = request.data
        school_id = data.get("school")
        ok, exam_id = _exam_param(data.get("exam"))
        if not ok or not school_id or not exam_id:
            return self.RESPONSE__INVALID_REQUEST
        if not _exam_in_school(exam_id, school_id):
            return self.RESPONSE__INVALID_REQUEST
        rooms = list(_school_rooms(school_id))
        which = data.get("room")
        if which == ALL_ROOMS:
            targets = rooms
        else:
            room_id = _room_id(which)
            if not room_id:
                return self.RESPONSE__INVALID_REQUEST
            # a room of another school is simply not there
            targets = [room for room in rooms if room.id == room_id]
            if not targets:
                return self.RESPONSE__NOT_FOUND
        with transaction.atomic():
            seats = SeatAllocation.objects.filter(room__in=targets, exam_id=exam_id)
            seats_removed = seats.count()
            seats.delete()
            SeatPlanRoomClass.objects.filter(room__in=targets, exam_id=exam_id).delete()
        if which == ALL_ROOMS:
            message = "Every room cleared!"
        else:
            message = f"{targets[0].name} cleared!"
        return Response(
            {
                "message": message,
                "seats_removed": seats_removed,
                "rooms": [_serialize_room(room, exam_id) for room in rooms],
                "class_counts": _class_counts(school_id),
            }
        )


class SeatPlanListView(SecuredAPIView):
    """Which exams the school has a seating for, in head-counts -- newest exam
    first. This is what lets the page open on the exam being worked on and offer
    an earlier exam's seating to start a new one from."""

    authentication_classes = SEAT_PLAN_AUTH

    def get(self, request):
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        rooms = _school_rooms(school_id)
        plans = {
            row["exam"]: {
                "exam": row["exam"],
                "name": row["exam__name"],
                "academic_year": row["exam__academic_year"],
                "academic_year_name": row["exam__academic_year__name"],
                "rooms": row["rooms"],
                "seated": 0,
            }
            for row in SeatPlanRoomClass.objects.filter(room__in=rooms, is_active=True)
            .values("exam", "exam__name", "exam__academic_year", "exam__academic_year__name")
            .annotate(rooms=Count("room", distinct=True))
        }
        for row in (
            SeatAllocation.objects.filter(room__in=rooms)
            .values("exam")
            .annotate(seated=Count("id"))
        ):
            if row["exam"] in plans:
                plans[row["exam"]]["seated"] = row["seated"]
        ordered = sorted(
            plans.values(), key=lambda p: (p["exam"] is not None, -(p["exam"] or 0))
        )
        return Response({"plans": ordered, "rooms": rooms.count()})


class SeatPlanCopyView(SecuredAPIView):
    """Start an exam from another exam's seating: the classes sent to each room
    are copied, then the exam is seated from TODAY's student lists.

    The students are deliberately not copied seat for seat. A seating made last
    term may hold students who have since left or changed class; which class
    goes to which room is what a school means by "the same seat plan".

    Only ever fills an exam that has NO classes in any room yet -- it never
    replaces choices that are already there, so there is nothing a mistaken copy
    can destroy.
    """

    authentication_classes = SEAT_PLAN_AUTH

    def post(self, request):
        data = request.data
        school_id = data.get("school")
        ok_from, from_exam = _exam_param(data.get("from_exam"))
        ok_to, to_exam = _exam_param(data.get("to_exam"))
        if not school_id or not ok_from or not ok_to or from_exam == to_exam:
            return self.RESPONSE__INVALID_REQUEST
        if to_exam and not _exam_in_school(to_exam, school_id):
            return self.RESPONSE__INVALID_REQUEST
        rooms = list(_school_rooms(school_id))
        source = list(
            SeatPlanRoomClass.objects.filter(
                room__in=rooms, is_active=True, **_of_exam(from_exam)
            ).order_by("id")
        )
        if not source:
            return Response(
                {"message": "That exam has no seating to copy."},
                status=status.HTTP_404_NOT_FOUND,
            )
        with transaction.atomic():
            if SeatPlanRoomClass.objects.filter(
                room__in=rooms, is_active=True, **_of_exam(to_exam)
            ).exists():
                return Response(
                    {
                        "message": "This exam already has classes in its rooms. "
                        "A seating can only be copied into an exam that has none."
                    },
                    status=status.HTTP_409_CONFLICT,
                )
            # in id order: that IS the fill order within a side
            SeatPlanRoomClass.objects.bulk_create(
                [
                    SeatPlanRoomClass(
                        room_id=rc.room_id,
                        exam_id=to_exam,
                        class_info_id=rc.class_info_id,
                        column=rc.column,
                        order_by=rc.order_by,
                        limit=rc.limit,
                    )
                    for rc in source
                ]
            )
            # a shuffled plan stays a shuffled plan (a fresh shuffle, on purpose)
            shuffle = any(room.shuffled for room in rooms)
            return _seated(rooms, to_exam, shuffle, school_id, "Seating copied!")
