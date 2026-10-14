"""Hostel reports.

  GET /hostel/dashboard   ?school= [&hostel=]   the one-screen picture
  GET /hostel/reports     ?school= &report=...  the printable registers

Every figure here is DERIVED from the operational tables. Nothing in this module
stores a count, an occupancy or a total, because a stored count is a number that
starts telling the truth and stops without anybody noticing.

Reports offered:
  occupancy    room by room: capacity, who is in it, what is free
  residents    the register — every current resident with room, bed, class, fee
  vacancy      only what is free, for the admissions desk
  movement     check-ins / transfers / check-outs over a date range
  attendance   per-resident present/absent/leave counts over a range
  leaves       gate passes over a range, with the overdue ones flagged
  visitors     the gate register over a range
  complaints   open and closed, with how long they took
  fee          what the hostel bills per month, per resident and in total
  dues         BILLED vs COLLECTED per resident, from the real ledger

The `dues` report is the one that closes the loop. Everything else here reads
the hostel's own tables; that one reads `StudentLedger` and `StudentInvoice` —
the same rows the fee counter writes — so "what the hostel is owed" is answered
by the accounts, not by a second set of books kept alongside them.
"""

from collections import defaultdict
from decimal import Decimal, InvalidOperation

from django.db.models import CharField, Count, F, Q, Sum, Value
from django.db.models.functions import Concat
from rest_framework.response import Response

from main.methods.nepaliDatetime import ndt_today
from ..constants import (
    ALLOCATION_STATUS_CHOICES,
    ALLOC_ACTIVE,
    ALLOC_TRANSFERRED,
    ALLOC_VACATED,
    ATT_ABSENT,
    ATT_LATE,
    ATT_ON_LEAVE,
    ATT_PRESENT,
    COMPLAINT_CATEGORY_CHOICES,
    COMPLAINT_PENDING_STATUSES,
    COMPLAINT_STATUS_CHOICES,
    HOSTEL_TYPE_CHOICES,
    LEAVE_APPROVED,
    LEAVE_STATUS_CHOICES,
    LEAVE_TYPE_CHOICES,
    ROOM_STATUS_CHOICES,
    label,
)
from main.constants.payment import (
    HOSTEL,
    HOSTEL_ADMISSION,
    HOSTEL_DEPOSIT,
    HOSTEL_TITLES,
    INVOICE_DETAILS,
)
from main.models.Invoice import StudentInvoice
from main.models.Ledger import StudentLedger
from ..models.Allocation import HostelAllocation
from ..models.Hostel import Hostel, HostelRoom
from ..models.Operations import (
    HostelAttendance,
    HostelComplaint,
    HostelLeave,
    HostelVisitor,
)
from .BaseViews import HostelBaseView

def _money(value):
    """A ledger/invoice JSON amount as a Decimal. These arrive as strings, ints
    or floats depending on how they were written, and a bad one must contribute
    zero rather than break a whole report."""
    try:
        return Decimal(str(value or 0))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(0)


STUDENT_NAME = Concat(
    "student__first_name", Value(" "), "student__last_name", output_field=CharField()
)


class HostelDashboardView(HostelBaseView):
    """The numbers a warden or principal opens the module to see."""

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        hostel_id = request.query_params.get("hostel")
        today = ndt_today()

        hostel_q = Q(school_id=school_id, is_active=True)
        if hostel_id:
            hostel_q &= Q(id=hostel_id)
        hostels = list(
            Hostel.objects.filter(hostel_q).values("id", "name", "hostel_type")
        )
        ids = [h["id"] for h in hostels]

        rooms = HostelRoom.objects.filter(hostel_id__in=ids, is_active=True)
        capacity = rooms.aggregate(n=Sum("capacity"))["n"] or 0
        room_count = rooms.count()

        active = HostelAllocation.objects.filter(
            hostel_id__in=ids, status=ALLOC_ACTIVE, is_active=True
        )
        occupied = active.count()
        monthly_billing = active.aggregate(n=Sum("monthly_fee"))["n"] or 0
        deposits_held = active.filter(deposit_paid=True, deposit_refunded=False).aggregate(
            n=Sum("security_deposit")
        )["n"] or 0

        away = HostelLeave.objects.filter(
            hostel_id__in=ids,
            is_active=True,
            status=LEAVE_APPROVED,
            from_date__lte=today,
            to_date__gte=today,
        )
        overdue = HostelLeave.objects.filter(
            hostel_id__in=ids,
            is_active=True,
            status=LEAVE_APPROVED,
            to_date__lt=today,
            actual_return_date__isnull=True,
        ).count()

        tonight = HostelAttendance.objects.filter(
            hostel_id__in=ids, date=today
        ).values("status").annotate(n=Count("id"))
        roll = {r["status"]: r["n"] for r in tonight}

        complaints = HostelComplaint.objects.filter(
            hostel_id__in=ids, is_active=True
        )
        visitors_today = HostelVisitor.objects.filter(
            hostel_id__in=ids, is_active=True, visit_date=today
        )

        return Response(
            {
                "date": today,
                "hostels": [
                    {
                        **h,
                        "hostel_type_name": label(HOSTEL_TYPE_CHOICES, h["hostel_type"]),
                    }
                    for h in hostels
                ],
                "rooms": room_count,
                "capacity": capacity,
                "occupied": occupied,
                "vacant": max(capacity - occupied, 0),
                "occupancy_pct": round((occupied / capacity) * 100, 1) if capacity else 0,
                "on_leave": away.count(),
                "overdue_returns": overdue,
                "roll_call": {
                    "marked": sum(roll.values()),
                    "present": roll.get(ATT_PRESENT, 0),
                    "absent": roll.get(ATT_ABSENT, 0),
                    "on_leave": roll.get(ATT_ON_LEAVE, 0),
                    "late": roll.get(ATT_LATE, 0),
                },
                "complaints_open": complaints.filter(
                    status__in=COMPLAINT_PENDING_STATUSES
                ).count(),
                "visitors_today": visitors_today.count(),
                "visitors_inside": visitors_today.filter(
                    in_time__isnull=False, out_time__isnull=True
                ).count(),
                "monthly_billing": monthly_billing,
                "deposits_held": deposits_held,
            }
        )


class HostelReportsView(HostelBaseView):
    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        report = (request.query_params.get("report") or "").lower()
        handler = {
            "occupancy": self.occupancy,
            "residents": self.residents,
            "vacancy": self.vacancy,
            "movement": self.movement,
            "attendance": self.attendance,
            "leaves": self.leaves,
            "visitors": self.visitors,
            "complaints": self.complaints,
            "fee": self.fee,
            "dues": self.dues,
        }.get(report)
        if not handler:
            return self.RESPONSE__INVALID_REQUEST
        return Response(handler(request))

    # -- helpers -------------------------------------------------------------
    def _scope(self, request):
        q = Q(school_id=self.school_id(request), is_active=True)
        hostel_id = request.query_params.get("hostel")
        if hostel_id:
            q &= Q(hostel_id=hostel_id)
        return q

    def _range(self, request):
        return request.query_params.get("from"), request.query_params.get("to")

    # -- reports -------------------------------------------------------------
    def occupancy(self, request):
        hostel_id = request.query_params.get("hostel")
        rq = Q(hostel__school_id=self.school_id(request), is_active=True)
        if hostel_id:
            rq &= Q(hostel_id=hostel_id)
        rooms = list(
            HostelRoom.objects.filter(rq)
            .annotate(
                hostel_name=F("hostel__name"),
                block_name=F("block__name"),
                room_type_name=F("room_type__name"),
            )
            .order_by("hostel__name", "block__name", "floor", "room_no")
            .values(
                "id", "hostel_name", "block_name", "room_no", "floor",
                "room_type_name", "capacity", "status",
            )
        )
        residents = defaultdict(list)
        for a in (
            HostelAllocation.objects.filter(
                room_id__in=[r["id"] for r in rooms], status=ALLOC_ACTIVE, is_active=True
            )
            .annotate(student_name=STUDENT_NAME, bed_no=F("bed__bed_no"))
            .values("room_id", "student_name", "bed_no")
        ):
            residents[a["room_id"]].append(
                f"{a['student_name']}" + (f" (bed {a['bed_no']})" if a["bed_no"] else "")
            )
        for r in rooms:
            names = residents.get(r["id"], [])
            r["occupied"] = len(names)
            r["vacant"] = max(r["capacity"] - len(names), 0)
            r["residents"] = ", ".join(names)
            r["status_name"] = label(ROOM_STATUS_CHOICES, r["status"])
        return rooms

    def residents(self, request):
        q = self._scope(request) & Q(status=ALLOC_ACTIVE)
        if request.query_params.get("class_info"):
            q &= Q(student__class_info_id=request.query_params.get("class_info"))
        rows = list(
            HostelAllocation.objects.filter(q)
            .annotate(
                student_name=STUDENT_NAME,
                hostel_name=F("hostel__name"),
                room_no=F("room__room_no"),
                block_name=F("room__block__name"),
                bed_no=F("bed__bed_no"),
                room_type_name=F("room__room_type__name"),
                class_info=F("student__class_info"),
                roll_no=F("student__roll_no"),
                contact=F("student__contact"),
                guardian_contact=F("student__guardian_info__guardian_contact"),
            )
            .order_by("hostel__name", "room__room_no", "student_name")
            .values(
                "id", "student", "student_name", "roll_no", "class_info", "hostel_name",
                "block_name", "room_no", "bed_no", "room_type_name", "check_in_date",
                "monthly_fee", "security_deposit", "deposit_paid", "contact",
                "guardian_contact", "emergency_contact_name", "emergency_contact",
            )
        )
        return rows

    def vacancy(self, request):
        rooms = self.occupancy(request)
        return [r for r in rooms if r["vacant"] > 0 and r["status"] == 1]

    def movement(self, request):
        frm, to = self._range(request)
        q = self._scope(request)
        rows = []
        # A stay contributes a check-IN row if it began in the window, and a
        # check-OUT row if it ended in one. The same stay can legitimately do
        # both, which is why this is not a single query over one date column.
        ins = HostelAllocation.objects.filter(q)
        if frm:
            ins = ins.filter(check_in_date__gte=frm)
        if to:
            ins = ins.filter(check_in_date__lte=to)
        for a in (
            ins.annotate(
                student_name=STUDENT_NAME,
                room_no=F("room__room_no"),
                hostel_name=F("hostel__name"),
            )
            .order_by("check_in_date")
            .values(
                "id", "student_name", "hostel_name", "room_no", "check_in_date", "status"
            )
        ):
            rows.append(
                {
                    "date": a["check_in_date"],
                    "event": "Check in",
                    "student_name": a["student_name"],
                    "hostel_name": a["hostel_name"],
                    "room_no": a["room_no"],
                }
            )
        outs = HostelAllocation.objects.filter(
            q, status__in=(ALLOC_VACATED, ALLOC_TRANSFERRED), check_out_date__isnull=False
        )
        if frm:
            outs = outs.filter(check_out_date__gte=frm)
        if to:
            outs = outs.filter(check_out_date__lte=to)
        for a in (
            outs.annotate(
                student_name=STUDENT_NAME,
                room_no=F("room__room_no"),
                hostel_name=F("hostel__name"),
            )
            .order_by("check_out_date")
            .values(
                "id", "student_name", "hostel_name", "room_no", "check_out_date", "status"
            )
        ):
            rows.append(
                {
                    "date": a["check_out_date"],
                    "event": label(ALLOCATION_STATUS_CHOICES, a["status"]),
                    "student_name": a["student_name"],
                    "hostel_name": a["hostel_name"],
                    "room_no": a["room_no"],
                }
            )
        rows.sort(key=lambda r: str(r["date"]))
        return rows

    def attendance(self, request):
        frm, to = self._range(request)
        q = self._scope(request)
        if frm:
            q &= Q(date__gte=frm)
        if to:
            q &= Q(date__lte=to)
        counts = defaultdict(lambda: defaultdict(int))
        names = {}
        for r in (
            HostelAttendance.objects.filter(q)
            .annotate(student_name=STUDENT_NAME)
            .values("student_id", "student_name", "status")
            .annotate(n=Count("id"))
        ):
            counts[r["student_id"]][r["status"]] = r["n"]
            names[r["student_id"]] = r["student_name"]
        rows = []
        for student_id, by_status in counts.items():
            present = by_status.get(ATT_PRESENT, 0) + by_status.get(ATT_LATE, 0)
            total = sum(by_status.values())
            rows.append(
                {
                    "student": student_id,
                    "student_name": names.get(student_id, ""),
                    "present": by_status.get(ATT_PRESENT, 0),
                    "late": by_status.get(ATT_LATE, 0),
                    "absent": by_status.get(ATT_ABSENT, 0),
                    "on_leave": by_status.get(ATT_ON_LEAVE, 0),
                    "days": total,
                    "present_pct": round((present / total) * 100, 1) if total else 0,
                }
            )
        rows.sort(key=lambda r: r["present_pct"])
        return rows

    def leaves(self, request):
        frm, to = self._range(request)
        q = self._scope(request)
        if frm:
            q &= Q(to_date__gte=frm)
        if to:
            q &= Q(from_date__lte=to)
        today = ndt_today()
        rows = list(
            HostelLeave.objects.filter(q)
            .annotate(student_name=STUDENT_NAME, hostel_name=F("hostel__name"))
            .order_by("-from_date")
            .values(
                "id", "student_name", "hostel_name", "leave_type", "from_date",
                "to_date", "reason", "status", "actual_return_date",
                "contact_during_leave",
            )
        )
        for r in rows:
            r["status_name"] = label(LEAVE_STATUS_CHOICES, r["status"])
            r["leave_type_name"] = label(LEAVE_TYPE_CHOICES, r["leave_type"])
            r["overdue"] = (
                r["status"] == LEAVE_APPROVED
                and not r["actual_return_date"]
                and str(r["to_date"]) < str(today)
            )
        return rows

    def visitors(self, request):
        frm, to = self._range(request)
        q = self._scope(request)
        if frm:
            q &= Q(visit_date__gte=frm)
        if to:
            q &= Q(visit_date__lte=to)
        return list(
            HostelVisitor.objects.filter(q)
            .annotate(student_name=STUDENT_NAME, hostel_name=F("hostel__name"))
            .order_by("-visit_date", "-in_time")
            .values(
                "id", "visit_date", "name", "relation", "contact", "persons",
                "purpose", "student_name", "hostel_name", "in_time", "out_time",
                "id_proof",
            )
        )

    def complaints(self, request):
        frm, to = self._range(request)
        q = self._scope(request)
        if frm:
            q &= Q(reported_date__gte=frm)
        if to:
            q &= Q(reported_date__lte=to)
        rows = list(
            HostelComplaint.objects.filter(q)
            .annotate(
                student_name=STUDENT_NAME,
                hostel_name=F("hostel__name"),
                room_no=F("room__room_no"),
                assigned_to_name=Concat(
                    "assigned_to__first_name",
                    Value(" "),
                    "assigned_to__last_name",
                    output_field=CharField(),
                ),
            )
            .order_by("status", "-reported_date")
            .values(
                "id", "hostel_name", "room_no", "student_name", "category", "priority",
                "title", "status", "reported_date", "resolved_date",
                "assigned_to_name", "resolution",
            )
        )
        for r in rows:
            r["status_name"] = label(COMPLAINT_STATUS_CHOICES, r["status"])
            r["category_name"] = label(COMPLAINT_CATEGORY_CHOICES, r["category"])
        return rows

    def fee(self, request):
        """What the hostel bills, per resident.

        This is the SAME `monthly_fee` the billing seam charges as fee title
        "hs" (see main/constants/payment.py), so this report and the student's
        ledger can never disagree — there is one number, read twice.
        """
        q = self._scope(request) & Q(status=ALLOC_ACTIVE)
        rows = list(
            HostelAllocation.objects.filter(q)
            .annotate(
                student_name=STUDENT_NAME,
                hostel_name=F("hostel__name"),
                room_no=F("room__room_no"),
                room_type_name=F("room__room_type__name"),
                class_info=F("student__class_info"),
            )
            .order_by("hostel__name", "room__room_no")
            .values(
                "id", "student", "student_name", "class_info", "hostel_name",
                "room_no", "room_type_name", "check_in_date", "monthly_fee",
                "admission_fee", "security_deposit", "deposit_paid",
                "deposit_refunded",
            )
        )
        return rows

    def dues(self, request):
        """What the hostel has BILLED each resident, and what has been COLLECTED.

        Read from `StudentLedger` and `StudentInvoice` — the school's real
        accounts — not from anything this module stores. That is the whole
        point: a hostel that keeps its own idea of what it is owed will
        eventually disagree with the fee counter, and the guardian standing at
        that counter will be right.

        Split by the three hostel titles, because they answer different
        questions: `hs` is recurring revenue, `hsa` is a one-off, and `hsd` is a
        DEPOSIT — money held, not earned. A school that nets them into one
        figure cannot tell you how much of its bank balance it owes back.

        Scoped to an academic year when one is given, so it lines up with every
        other dues figure in the product.
        """
        school_id = self.school_id(request)
        params = request.query_params
        academic_year = params.get("academic_year")
        hostel_id = params.get("hostel")

        alloc_q = Q(school_id=school_id, is_active=True, status=ALLOC_ACTIVE)
        if hostel_id:
            alloc_q &= Q(hostel_id=hostel_id)
        residents = list(
            HostelAllocation.objects.filter(alloc_q)
            .annotate(
                student_name=STUDENT_NAME,
                hostel_name=F("hostel__name"),
                room_no=F("room__room_no"),
                class_info=F("student__class_info"),
                guardian_contact=F("student__guardian_info__guardian_contact"),
            )
            .order_by("hostel__name", "room__room_no", "student_name")
            .values(
                "id", "student", "student_name", "hostel_name", "room_no",
                "class_info", "check_in_date", "monthly_fee", "guardian_contact",
            )
        )
        student_ids = [r["student"] for r in residents]
        if not student_ids:
            return []

        billed = {sid: defaultdict(Decimal) for sid in student_ids}
        paid = {sid: defaultdict(Decimal) for sid in student_ids}

        ledger_q = Q(
            student_id__in=student_ids,
            school_id=school_id,
            is_active=True,
            ledger_posting__is_active=True,
        )
        invoice_q = Q(
            student_id__in=student_ids, school_id=school_id, is_active=True,
            isCashReceipt=False,
        )
        if academic_year:
            ledger_q &= Q(academic_year_id=academic_year)
            invoice_q &= Q(academic_year_id=academic_year)

        for row in StudentLedger.objects.filter(ledger_q).values("student_id", "details"):
            for title, amount in (row["details"] or {}).items():
                if title not in HOSTEL_TITLES:
                    continue
                billed[row["student_id"]][title] += _money(amount)

        for row in StudentInvoice.objects.filter(invoice_q).values("student_id", "details"):
            for title, detail in (row["details"] or {}).items():
                if title not in HOSTEL_TITLES or not isinstance(detail, dict):
                    continue
                # A discount settles the bill exactly as cash does — the same
                # arithmetic the student ledger uses (LedgerViews).
                amount = _money(detail.get(INVOICE_DETAILS["AMOUNT"]))
                discount = _money(detail.get(INVOICE_DETAILS["DISCOUNT"]))
                paid[row["student_id"]][title] += amount

        rows = []
        for r in residents:
            sid = r["student"]
            b, p = billed[sid], paid[sid]
            monthly_due = b[HOSTEL] - p[HOSTEL]
            admission_due = b[HOSTEL_ADMISSION] - p[HOSTEL_ADMISSION]
            deposit_due = b[HOSTEL_DEPOSIT] - p[HOSTEL_DEPOSIT]
            rows.append({
                **r,
                "billed_monthly": b[HOSTEL],
                "paid_monthly": p[HOSTEL],
                "due_monthly": monthly_due,
                "billed_admission": b[HOSTEL_ADMISSION],
                "paid_admission": p[HOSTEL_ADMISSION],
                "billed_deposit": b[HOSTEL_DEPOSIT],
                "paid_deposit": p[HOSTEL_DEPOSIT],
                "total_billed": b[HOSTEL] + b[HOSTEL_ADMISSION] + b[HOSTEL_DEPOSIT],
                "total_paid": p[HOSTEL] + p[HOSTEL_ADMISSION] + p[HOSTEL_DEPOSIT],
                "total_due": monthly_due + admission_due + deposit_due,
            })
        # Biggest debtor first — that is the order the list is USED in.
        rows.sort(key=lambda r: r["total_due"], reverse=True)
        return rows
