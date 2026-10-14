"""Putting students into the hostel, moving them, and checking them out.

  GET    /hostel/allocations    the resident register (filterable)
  POST   /hostel/allocations    check IN — one student, or a whole selection
  PUT    /hostel/allocations    edit an active stay's terms (fee, deposit, contacts)
  POST   /hostel/allocations/transfer   move a resident to another room/bed
  POST   /hostel/allocations/checkout   close a stay
  GET    /hostel/allocations/candidates students who could be admitted

THE TWO RULES THIS FILE EXISTS TO KEEP
--------------------------------------
1. A student lives in ONE place at a time.
2. A bed holds ONE student at a time.

Both are also database constraints (partial unique indexes — see
models/Allocation.py), so a double-submit or two wardens on two machines cannot
get past them. The checks here exist to turn the resulting IntegrityError into a
sentence a warden can act on, not to be the only line of defence. A guard that
lives only in application code is a guard that a race condition walks through.
"""

from django.db import IntegrityError, transaction
from django.db.models import Count, F, Q, Value, CharField
from django.db.models.functions import Concat
from rest_framework.response import Response

from main.methods.nepaliDatetime import ndt_today
from main.models.Student import Student
from ..constants import (
    ALLOCATION_STATUS_CHOICES,
    ALLOC_ACTIVE,
    ALLOC_TRANSFERRED,
    ALLOC_VACATED,
    ROOM_ALLOCATABLE_STATUSES,
    label,
)
from ..models.Allocation import HostelAllocation
from ..models.Hostel import Hostel, HostelBed, HostelRoom
from .BaseViews import HostelBaseView

STUDENT_NAME = Concat(
    "student__first_name",
    Value(" "),
    "student__last_name",
    output_field=CharField(),
)

REGISTER_FIELDS = (
    "id", "student", "student_name", "hostel", "hostel_name", "room", "room_no",
    "block_name", "bed", "bed_no", "academic_year", "check_in_date",
    "check_out_date", "status", "monthly_fee", "admission_fee",
    "security_deposit", "deposit_paid", "deposit_refunded",
    "emergency_contact_name", "emergency_contact", "emergency_contact_relation",
    "class_info", "roll_no", "remarks",
)


def annotated_allocations(q):
    return (
        HostelAllocation.objects.filter(q)
        .annotate(
            student_name=STUDENT_NAME,
            hostel_name=F("hostel__name"),
            room_no=F("room__room_no"),
            block_name=F("room__block__name"),
            bed_no=F("bed__bed_no"),
            class_info=F("student__class_info"),
            roll_no=F("student__roll_no"),
        )
        .values(*REGISTER_FIELDS)
    )


class HostelAllocationView(HostelBaseView):
    # ------------------------------------------------------------------ read
    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        params = request.query_params
        q = Q(school_id=self.school_id(request), is_active=True)
        if params.get("hostel"):
            q &= Q(hostel_id=params.get("hostel"))
        if params.get("room"):
            q &= Q(room_id=params.get("room"))
        if params.get("block"):
            q &= Q(room__block_id=params.get("block"))
        if params.get("student"):
            q &= Q(student_id=params.get("student"))
        if params.get("academic_year"):
            q &= Q(academic_year_id=params.get("academic_year"))
        if params.get("class_info"):
            q &= Q(student__class_info_id=params.get("class_info"))

        # Default view is the CURRENT register. `status=all` opens the history,
        # which is the only way to answer "who was in room 12 last year".
        status_param = (params.get("status") or "").lower()
        if status_param not in ("all", "any", ""):
            parsed = self.int_or_none(status_param)
            if parsed:
                q &= Q(status=parsed)
        elif status_param == "":
            q &= Q(status=ALLOC_ACTIVE)

        rows = list(
            annotated_allocations(q).order_by(
                "room__block__name", "room__room_no", "bed__bed_no", "student_name"
            )
        )
        for r in rows:
            r["status_name"] = label(ALLOCATION_STATUS_CHOICES, r["status"])
        return Response(rows)

    # --------------------------------------------------------------- check-in
    def post(self, request):
        """Admit one student, or several at once.

        Accepts `student` (an id) or `students` (a list of ids). The bulk form
        is what makes the start of a session bearable — a warden admitting
        forty boarders one dialog at a time is how allocation registers end up
        being kept in a notebook instead.

        Bulk admission fills beds in order and reports, per student, what
        happened. It is deliberately NOT all-or-nothing: rejecting the whole
        batch because the thirty-ninth student is already housed would throw
        away thirty-eight correct admissions.
        """
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        school_id = self.school_id(request)

        hostel = Hostel.objects.filter(
            id=data.get("hostel"), school_id=school_id, is_active=True
        ).first()
        room = HostelRoom.objects.filter(
            id=data.get("room"), hostel=hostel, is_active=True
        ).first()
        academic_year = data.get("academic_year")
        if not hostel or not room or not academic_year:
            return self.RESPONSE__INVALID_REQUEST
        if room.status not in ROOM_ALLOCATABLE_STATUSES:
            return Response(
                {"message": f"Room {room.room_no} is not available for allocation."},
                status=400,
            )

        student_ids = data.get("students")
        if not isinstance(student_ids, list) or not student_ids:
            single = self.int_or_none(data.get("student"))
            student_ids = [single] if single else []
        student_ids = [s for s in (self.int_or_none(x) for x in student_ids) if s]
        if not student_ids:
            return self.RESPONSE__INVALID_REQUEST

        # Only this school's students, and only ones not already housed.
        valid = set(
            Student.objects.filter(
                id__in=student_ids, class_info__school_id=school_id, is_active=True
            ).values_list("id", flat=True)
        )
        already = set(
            HostelAllocation.objects.filter(
                student_id__in=student_ids, status=ALLOC_ACTIVE, is_active=True
            ).values_list("student_id", flat=True)
        )

        defaults = self._terms(data, room)
        explicit_bed = self.int_or_none(data.get("bed"))
        admitted, skipped = [], []

        for student_id in student_ids:
            if student_id not in valid:
                skipped.append({"student": student_id, "reason": "not a student of this school"})
                continue
            if student_id in already:
                skipped.append({"student": student_id, "reason": "already has an active hostel place"})
                continue
            free = self._room_space(room)
            if free < 1:
                skipped.append({"student": student_id, "reason": f"room {room.room_no} is full"})
                continue
            bed_id = explicit_bed if len(student_ids) == 1 else None
            if bed_id is None:
                bed_id = self._next_free_bed(room)
            try:
                with transaction.atomic():
                    allocation = HostelAllocation.objects.create(
                        school_id=school_id,
                        student_id=student_id,
                        hostel=hostel,
                        room=room,
                        bed_id=bed_id,
                        academic_year_id=academic_year,
                        check_in_date=data.get("check_in_date") or ndt_today(),
                        **defaults,
                    )
                admitted.append(allocation.id)
                already.add(student_id)
            except IntegrityError:
                # The database said no — almost always the "one active place"
                # or "one per bed" rule, hit by a second tab or a retry.
                skipped.append(
                    {"student": student_id, "reason": "already housed, or that bed was just taken"}
                )

        if not admitted:
            return Response(
                {
                    "message": skipped[0]["reason"].capitalize() + "!"
                    if len(skipped) == 1
                    else "Nobody could be admitted — see the details.",
                    "skipped": skipped,
                },
                status=400,
            )
        message = f"{len(admitted)} student(s) admitted to room {room.room_no}."
        if skipped:
            message += f" {len(skipped)} skipped."
        return Response({"message": message, "admitted": admitted, "skipped": skipped})

    # ------------------------------------------------------------ edit terms
    def put(self, request):
        """Change the terms of a CURRENT stay — the fee, the deposit, the
        emergency contact, a remark.

        Moving somebody is not an edit; it is `/transfer`, which closes this row
        and opens another, because a room number silently overwritten is a
        history that never happened.
        """
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        allocation = HostelAllocation.objects.filter(
            id=data.get("id"), school_id=self.school_id(request), is_active=True
        ).first()
        if not allocation:
            return self.RESPONSE__NOT_FOUND
        if allocation.status != ALLOC_ACTIVE:
            return Response(
                {"message": "This stay is already closed and cannot be edited."},
                status=400,
            )
        for field, value in self._terms(data, allocation.room).items():
            setattr(allocation, field, value)
        if data.get("check_in_date"):
            allocation.check_in_date = data.get("check_in_date")
        allocation.save()
        return Response({"message": "Allocation updated!"})

    # -------------------------------------------------------------- helpers
    def _terms(self, data, room):
        room_type = room.room_type
        return {
            "monthly_fee": self.decimal_or_zero(
                data.get("monthly_fee")
                if data.get("monthly_fee") not in (None, "")
                else (room_type.monthly_fee if room_type else 0)
            ),
            "admission_fee": self.decimal_or_zero(
                data.get("admission_fee")
                if data.get("admission_fee") not in (None, "")
                else (room_type.admission_fee if room_type else 0)
            ),
            "security_deposit": self.decimal_or_zero(
                data.get("security_deposit")
                if data.get("security_deposit") not in (None, "")
                else (room_type.security_deposit if room_type else 0)
            ),
            "deposit_paid": bool(data.get("deposit_paid")),
            "deposit_refunded": bool(data.get("deposit_refunded")),
            "emergency_contact_name": data.get("emergency_contact_name") or None,
            "emergency_contact": data.get("emergency_contact") or None,
            "emergency_contact_relation": data.get("emergency_contact_relation") or None,
            "remarks": data.get("remarks") or None,
        }

    def _room_space(self, room):
        used = HostelAllocation.objects.filter(
            room=room, status=ALLOC_ACTIVE, is_active=True
        ).count()
        return room.capacity - used

    def _next_free_bed(self, room):
        taken = set(
            HostelAllocation.objects.filter(
                room=room, status=ALLOC_ACTIVE, is_active=True, bed__isnull=False
            ).values_list("bed_id", flat=True)
        )
        bed = (
            HostelBed.objects.filter(room=room, is_active=True)
            .exclude(id__in=taken)
            .order_by("bed_no")
            .first()
        )
        return bed.id if bed else None


class HostelTransferView(HostelBaseView):
    """Move a resident. Closes the old stay as TRANSFERRED, opens a new one.

    The new row inherits the money terms of the old one unless the caller sends
    new ones: moving somebody to a different room mid-session is usually an
    operational shuffle, not a re-negotiation of their fee. When the room type
    genuinely differs and the school DOES want the new rate, they send it.
    """

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        school_id = self.school_id(request)
        current = HostelAllocation.objects.filter(
            id=data.get("allocation"),
            school_id=school_id,
            status=ALLOC_ACTIVE,
            is_active=True,
        ).first()
        if not current:
            return self.RESPONSE__NOT_FOUND
        room = HostelRoom.objects.filter(
            id=data.get("room"), hostel__school_id=school_id, is_active=True
        ).first()
        if not room:
            return self.RESPONSE__NOT_FOUND
        if room.id == current.room_id and not data.get("bed"):
            return Response({"message": "That is the room they are already in."}, status=400)
        if room.status not in ROOM_ALLOCATABLE_STATUSES:
            return Response({"message": f"Room {room.room_no} is not available."}, status=400)

        used = HostelAllocation.objects.filter(
            room=room, status=ALLOC_ACTIVE, is_active=True
        ).count()
        if used >= room.capacity:
            return Response({"message": f"Room {room.room_no} is full."}, status=400)

        bed_id = self.int_or_none(data.get("bed"))
        if bed_id:
            clash = HostelAllocation.objects.filter(
                bed_id=bed_id, status=ALLOC_ACTIVE, is_active=True
            ).exists()
            if clash:
                return Response({"message": "That bed is taken."}, status=400)

        date = data.get("date") or ndt_today()
        try:
            with transaction.atomic():
                current.status = ALLOC_TRANSFERRED
                current.check_out_date = date
                current.save(update_fields=["status", "check_out_date", "updated_at"])
                fresh = HostelAllocation.objects.create(
                    school_id=school_id,
                    student_id=current.student_id,
                    hostel=room.hostel,
                    room=room,
                    bed_id=bed_id,
                    academic_year_id=current.academic_year_id,
                    check_in_date=date,
                    monthly_fee=self.decimal_or_zero(
                        data.get("monthly_fee")
                        if data.get("monthly_fee") not in (None, "")
                        else current.monthly_fee
                    ),
                    admission_fee=0,  # already charged on admission
                    security_deposit=current.security_deposit,
                    deposit_paid=current.deposit_paid,
                    emergency_contact_name=current.emergency_contact_name,
                    emergency_contact=current.emergency_contact,
                    emergency_contact_relation=current.emergency_contact_relation,
                    remarks=data.get("remarks") or None,
                )
        except IntegrityError:
            return Response(
                {"message": "That bed or student was just taken — refresh and retry."},
                status=409,
            )
        return Response({"message": "Student transferred!", "id": fresh.id})


class HostelCheckoutView(HostelBaseView):
    """Close a stay. Supports one id or a list, for end-of-session clear-outs."""

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        ids = data.get("allocations")
        if not isinstance(ids, list) or not ids:
            single = self.int_or_none(data.get("allocation"))
            ids = [single] if single else []
        ids = [i for i in (self.int_or_none(x) for x in ids) if i]
        if not ids:
            return self.RESPONSE__INVALID_REQUEST

        date = data.get("date") or ndt_today()
        refund = bool(data.get("deposit_refunded"))
        rows = HostelAllocation.objects.filter(
            id__in=ids,
            school_id=self.school_id(request),
            status=ALLOC_ACTIVE,
            is_active=True,
        )
        count = rows.count()
        if count < 1:
            return Response(
                {"message": "Nothing to check out — those stays are already closed."},
                status=400,
            )
        # Saved row by row rather than with a queryset `.update()`: `.update()`
        # skips `auto_now` and skips the model signals that write the history
        # log, and a check-out is exactly the kind of act somebody later needs
        # to see an audit trail for. Batches here are a class at a time, not a
        # migration.
        remarks = data.get("remarks") or None
        for allocation in rows:
            allocation.status = ALLOC_VACATED
            allocation.check_out_date = date
            if remarks:
                allocation.remarks = remarks
            if refund:
                allocation.deposit_refunded = True
            allocation.save()
        return Response({"message": f"{count} student(s) checked out."})


class HostelCandidatesView(HostelBaseView):
    """Students who COULD be admitted — the picker behind "add students".

    Filterable by class, and by name, because a warden admitting a class of
    boarders wants that class, not a scroll of the whole school. Students who
    already hold an active place are excluded by construction: offering someone
    who cannot be admitted, and failing when they are picked, is a worse
    experience than never offering them.
    """

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        params = request.query_params
        school_id = self.school_id(request)

        housed = HostelAllocation.objects.filter(
            status=ALLOC_ACTIVE, is_active=True
        ).values_list("student_id", flat=True)

        q = Q(class_info__school_id=school_id, is_active=True, status=1)
        if params.get("class_info"):
            q &= Q(class_info_id=params.get("class_info"))
        if params.get("academic_year"):
            q &= Q(academic_year_id=params.get("academic_year"))
        if params.get("gender"):
            q &= Q(gender=params.get("gender"))
        name = (params.get("name") or "").strip()
        if name:
            q &= (
                Q(first_name__icontains=name)
                | Q(last_name__icontains=name)
                | Q(middle_name__icontains=name)
            )

        students = (
            Student.objects.filter(q)
            .exclude(id__in=housed)
            .annotate(
                name=Concat(
                    "first_name", Value(" "), "last_name", output_field=CharField()
                ),
                guardian_contact=F("guardian_info__guardian_contact"),
                father_name=F("guardian_info__father_name"),
            )
            .order_by("name")
            .values(
                "id", "name", "roll_no", "gender", "contact",
                "guardian_contact", "father_name", "class_info", "academic_year",
            )[:500]
        )
        return Response(list(students))
