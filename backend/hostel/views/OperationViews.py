"""Day-to-day hostel operations.

  /hostel/attendance     night roll call     GET (register) · POST (save a day)
  /hostel/leaves         gate passes         GET · POST · PUT · DELETE
  /hostel/visitors       gate register       GET · POST · PUT · DELETE
  /hostel/complaints     maintenance/grievance GET · POST · PUT · DELETE
  /hostel/mess-menu      weekly menu         GET · PUT (whole week at once)
  /hostel/discipline     incident register   GET · POST · PUT · DELETE

Every handler starts with `self.gate(request)`. See views/BaseViews.py.
"""

from django.db.models import CharField, F, Q, Value
from django.db.models.functions import Concat
from rest_framework.response import Response

from main.methods.nepaliDatetime import ndt_today
from ..constants import (
    ALLOC_ACTIVE,
    ATT_PRESENT,
    COMPLAINT_CATEGORY_CHOICES,
    COMPLAINT_RESOLVED,
    COMPLAINT_STATUS_CHOICES,
    HOSTEL_ATTENDANCE_CHOICES,
    LEAVE_APPROVED,
    LEAVE_RETURNED,
    LEAVE_STATUS_CHOICES,
    LEAVE_TYPE_CHOICES,
    MEAL_CHOICES,
    PRIORITY_CHOICES,
    WEEKDAY_CHOICES,
    label,
)
from ..models.Allocation import HostelAllocation
from ..models.Operations import (
    HostelAttendance,
    HostelComplaint,
    HostelDisciplineRecord,
    HostelLeave,
    HostelMessMenu,
    HostelVisitor,
)
from .BaseViews import HostelBaseView

STUDENT_NAME = Concat(
    "student__first_name", Value(" "), "student__last_name", output_field=CharField()
)


class HostelAttendanceView(HostelBaseView):
    """One night, one hostel, every resident.

    GET returns the FULL resident list with whatever was already recorded for
    that date — not just the saved rows. A roll-call screen that shows only the
    students somebody already ticked is useless on the first pass of the
    evening, which is the only pass that matters.
    """

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        params = request.query_params
        hostel_id = params.get("hostel")
        date = params.get("date") or ndt_today()
        if not hostel_id:
            return Response([])

        # Report mode: one student's history over a range.
        if params.get("student"):
            q = Q(
                school_id=self.school_id(request),
                hostel_id=hostel_id,
                student_id=params.get("student"),
            )
            if params.get("from"):
                q &= Q(date__gte=params.get("from"))
            if params.get("to"):
                q &= Q(date__lte=params.get("to"))
            rows = list(
                HostelAttendance.objects.filter(q)
                .order_by("-date")
                .values("id", "date", "status", "remarks")
            )
            for r in rows:
                r["status_name"] = label(HOSTEL_ATTENDANCE_CHOICES, r["status"])
            return Response(rows)

        residents = list(
            HostelAllocation.objects.filter(
                hostel_id=hostel_id,
                school_id=self.school_id(request),
                status=ALLOC_ACTIVE,
                is_active=True,
            )
            .annotate(
                student_name=STUDENT_NAME,
                room_no=F("room__room_no"),
                block_name=F("room__block__name"),
                bed_no=F("bed__bed_no"),
                class_info=F("student__class_info"),
            )
            .order_by("room__block__name", "room__room_no", "bed__bed_no")
            .values(
                "student", "student_name", "room_no", "block_name", "bed_no",
                "class_info",
            )
        )
        marked = {
            a["student_id"]: a
            for a in HostelAttendance.objects.filter(
                hostel_id=hostel_id, date=date, school_id=self.school_id(request)
            ).values("student_id", "status", "remarks", "id")
        }
        # Students on an approved leave covering this date are pre-marked, so a
        # warden is not asked to explain an absence the office already approved.
        on_leave = set(
            HostelLeave.objects.filter(
                hostel_id=hostel_id,
                status=LEAVE_APPROVED,
                is_active=True,
                from_date__lte=date,
                to_date__gte=date,
            ).values_list("student_id", flat=True)
        )
        for r in residents:
            saved = marked.get(r["student"])
            r["id"] = saved["id"] if saved else None
            r["status"] = saved["status"] if saved else (3 if r["student"] in on_leave else ATT_PRESENT)
            r["remarks"] = saved["remarks"] if saved else ""
            r["saved"] = saved is not None
            r["on_leave"] = r["student"] in on_leave
        return Response({"date": date, "residents": residents})

    def post(self, request):
        """Save (or correct) one night's roll call.

        `unique_together (student, date)` means a second save for the same night
        is an UPDATE, never a duplicate row — corrections are the normal case
        here, not the exception.
        """
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        hostel_id = data.get("hostel")
        date = data.get("date") or ndt_today()
        entries = data.get("entries")
        if not hostel_id or not isinstance(entries, list) or not entries:
            return self.RESPONSE__INVALID_REQUEST

        school_id = self.school_id(request)
        # Only students who actually live in this hostel may be marked in it.
        residents = set(
            HostelAllocation.objects.filter(
                hostel_id=hostel_id,
                school_id=school_id,
                status=ALLOC_ACTIVE,
                is_active=True,
            ).values_list("student_id", flat=True)
        )
        saved = 0
        for entry in entries:
            student_id = self.int_or_none(entry.get("student"))
            if student_id not in residents:
                continue
            HostelAttendance.objects.update_or_create(
                student_id=student_id,
                date=date,
                defaults={
                    "school_id": school_id,
                    "hostel_id": hostel_id,
                    "status": self.int_or_none(entry.get("status")) or ATT_PRESENT,
                    "remarks": entry.get("remarks") or None,
                    "is_active": True,
                },
            )
            saved += 1
        if saved < 1:
            return Response(
                {"message": "None of those students live in this hostel."}, status=400
            )
        return Response({"message": f"Attendance saved for {saved} resident(s)."})


class HostelLeaveView(HostelBaseView):
    FIELDS = (
        "id", "student", "student_name", "hostel", "leave_type", "from_date",
        "to_date", "out_time", "in_time", "reason", "contact_during_leave",
        "escorted_by", "status", "approved_by", "actual_return_date", "remarks",
        "room_no",
    )

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        params = request.query_params
        q = Q(school_id=self.school_id(request), is_active=True)
        if params.get("hostel"):
            q &= Q(hostel_id=params.get("hostel"))
        if params.get("student"):
            q &= Q(student_id=params.get("student"))
        if params.get("status"):
            parsed = self.int_or_none(params.get("status"))
            if parsed:
                q &= Q(status=parsed)
        if params.get("from"):
            q &= Q(to_date__gte=params.get("from"))
        if params.get("to"):
            q &= Q(from_date__lte=params.get("to"))

        rows = list(
            HostelLeave.objects.filter(q)
            .annotate(
                student_name=STUDENT_NAME,
                room_no=F("student__hostel_allocations__room__room_no"),
            )
            .order_by("-from_date", "-id")
            .values(*self.FIELDS)
            .distinct()
        )
        today = ndt_today()
        for r in rows:
            r["status_name"] = label(LEAVE_STATUS_CHOICES, r["status"])
            r["leave_type_name"] = label(LEAVE_TYPE_CHOICES, r["leave_type"])
            # The number that matters at 9pm: approved, the return date has
            # passed, and nobody has marked them back.
            r["overdue"] = (
                r["status"] in (LEAVE_APPROVED,)
                and not r["actual_return_date"]
                and str(r["to_date"]) < str(today)
            )
        if self.getBooleanValue(params.get("overdue_only")):
            rows = [r for r in rows if r["overdue"]]
        return Response(rows)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        school_id = self.school_id(request)
        student_id = self.int_or_none(data.get("student"))
        hostel_id = self.int_or_none(data.get("hostel"))
        if not student_id or not hostel_id:
            return self.RESPONSE__INVALID_REQUEST
        if not HostelAllocation.objects.filter(
            student_id=student_id,
            hostel_id=hostel_id,
            school_id=school_id,
            status=ALLOC_ACTIVE,
            is_active=True,
        ).exists():
            return Response(
                {"message": "That student does not currently live in this hostel."},
                status=400,
            )
        leave = HostelLeave.objects.create(
            school_id=school_id,
            hostel_id=hostel_id,
            student_id=student_id,
            leave_type=self.int_or_none(data.get("leave_type")) or 1,
            from_date=data.get("from_date") or ndt_today(),
            to_date=data.get("to_date") or data.get("from_date") or ndt_today(),
            out_time=data.get("out_time") or None,
            in_time=data.get("in_time") or None,
            reason=data.get("reason") or None,
            contact_during_leave=data.get("contact_during_leave") or None,
            escorted_by=data.get("escorted_by") or None,
            status=self.int_or_none(data.get("status")) or 1,
            approved_by_id=self.int_or_none(data.get("approved_by")),
            remarks=data.get("remarks") or None,
        )
        return Response({"message": "Gate pass saved!", "id": leave.id})

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        leave = HostelLeave.objects.filter(
            id=data.get("id"), school_id=self.school_id(request)
        ).first()
        if not leave:
            return self.RESPONSE__NOT_FOUND
        # Marking a return is the common edit and gets a shortcut, so the
        # frontend does not have to resend the whole record to close one out.
        if self.getBooleanValue(data.get("mark_returned")):
            leave.status = LEAVE_RETURNED
            leave.actual_return_date = data.get("actual_return_date") or ndt_today()
            leave.in_time = data.get("in_time") or leave.in_time
            leave.save()
            return Response({"message": "Marked returned!"})
        for field in (
            "leave_type", "status", "approved_by_id",
        ):
            key = field.replace("_id", "")
            if data.get(key) not in (None, ""):
                setattr(leave, field, self.int_or_none(data.get(key)))
        for field in (
            "from_date", "to_date", "out_time", "in_time", "reason",
            "contact_during_leave", "escorted_by", "actual_return_date", "remarks",
        ):
            if field in data:
                setattr(leave, field, data.get(field) or None)
        leave.save()
        return Response({"message": "Gate pass updated!"})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        leave = HostelLeave.objects.filter(
            id=request.query_params.get("id"), school_id=self.school_id(request)
        ).first()
        if not leave:
            return self.RESPONSE__NOT_FOUND
        leave.is_active = False
        leave.save(update_fields=["is_active"])
        return Response({"message": "Gate pass removed!"})


class HostelVisitorView(HostelBaseView):
    FIELDS = (
        "id", "hostel", "student", "student_name", "name", "relation", "contact",
        "id_proof", "persons", "purpose", "visit_date", "in_time", "out_time",
        "remarks",
    )

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        params = request.query_params
        q = Q(school_id=self.school_id(request), is_active=True)
        if params.get("hostel"):
            q &= Q(hostel_id=params.get("hostel"))
        if params.get("student"):
            q &= Q(student_id=params.get("student"))
        if params.get("from"):
            q &= Q(visit_date__gte=params.get("from"))
        if params.get("to"):
            q &= Q(visit_date__lte=params.get("to"))
        if not params.get("from") and not params.get("to"):
            # The gate register is a TODAY screen by default — the whole
            # history would be thousands of rows and answers a different
            # question.
            q &= Q(visit_date=params.get("date") or ndt_today())
        rows = list(
            HostelVisitor.objects.filter(q)
            .annotate(student_name=STUDENT_NAME)
            .order_by("-visit_date", "-in_time", "-id")
            .values(*self.FIELDS)
        )
        for r in rows:
            r["inside"] = bool(r["in_time"]) and not r["out_time"]
        if self.getBooleanValue(params.get("inside_only")):
            rows = [r for r in rows if r["inside"]]
        return Response(rows)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        if not data.get("hostel") or not (data.get("name") or "").strip():
            return self.RESPONSE__INVALID_REQUEST
        visitor = HostelVisitor.objects.create(
            school_id=self.school_id(request),
            hostel_id=data.get("hostel"),
            student_id=self.int_or_none(data.get("student")),
            name=data.get("name").strip(),
            relation=data.get("relation") or None,
            contact=data.get("contact") or None,
            id_proof=data.get("id_proof") or None,
            persons=self.int_or_none(data.get("persons")) or 1,
            purpose=data.get("purpose") or None,
            visit_date=data.get("visit_date") or ndt_today(),
            in_time=data.get("in_time") or None,
            out_time=data.get("out_time") or None,
            remarks=data.get("remarks") or None,
        )
        return Response({"message": "Visitor recorded!", "id": visitor.id})

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        visitor = HostelVisitor.objects.filter(
            id=data.get("id"), school_id=self.school_id(request)
        ).first()
        if not visitor:
            return self.RESPONSE__NOT_FOUND
        # "Sign out" is one click at the gate — it must not require resending
        # the whole record.
        if self.getBooleanValue(data.get("sign_out")):
            visitor.out_time = data.get("out_time") or None
            if not visitor.out_time:
                from django.utils import timezone

                visitor.out_time = timezone.localtime().time().replace(microsecond=0)
            visitor.save()
            return Response({"message": "Visitor signed out!"})
        for field in (
            "name", "relation", "contact", "id_proof", "purpose", "visit_date",
            "in_time", "out_time", "remarks",
        ):
            if field in data:
                setattr(visitor, field, data.get(field) or None)
        if data.get("persons"):
            visitor.persons = self.int_or_none(data.get("persons")) or 1
        if "student" in data:
            visitor.student_id = self.int_or_none(data.get("student"))
        visitor.save()
        return Response({"message": "Visitor updated!"})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        visitor = HostelVisitor.objects.filter(
            id=request.query_params.get("id"), school_id=self.school_id(request)
        ).first()
        if not visitor:
            return self.RESPONSE__NOT_FOUND
        visitor.is_active = False
        visitor.save(update_fields=["is_active"])
        return Response({"message": "Visitor entry removed!"})


class HostelComplaintView(HostelBaseView):
    FIELDS = (
        "id", "hostel", "room", "room_no", "student", "student_name", "category",
        "priority", "title", "description", "status", "assigned_to",
        "assigned_to_name", "reported_date", "resolved_date", "resolution",
    )

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        params = request.query_params
        q = Q(school_id=self.school_id(request), is_active=True)
        if params.get("hostel"):
            q &= Q(hostel_id=params.get("hostel"))
        if params.get("status"):
            parsed = self.int_or_none(params.get("status"))
            if parsed:
                q &= Q(status=parsed)
        if params.get("category"):
            parsed = self.int_or_none(params.get("category"))
            if parsed:
                q &= Q(category=parsed)
        if params.get("room"):
            q &= Q(room_id=params.get("room"))
        rows = list(
            HostelComplaint.objects.filter(q)
            .annotate(
                student_name=STUDENT_NAME,
                room_no=F("room__room_no"),
                assigned_to_name=Concat(
                    "assigned_to__first_name",
                    Value(" "),
                    "assigned_to__last_name",
                    output_field=CharField(),
                ),
            )
            .order_by("status", "-priority", "-reported_date", "-id")
            .values(*self.FIELDS)
        )
        for r in rows:
            r["status_name"] = label(COMPLAINT_STATUS_CHOICES, r["status"])
            r["category_name"] = label(COMPLAINT_CATEGORY_CHOICES, r["category"])
            r["priority_name"] = label(PRIORITY_CHOICES, r["priority"])
        return Response(rows)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        title = (data.get("title") or "").strip()
        if not data.get("hostel") or not title:
            return self.RESPONSE__INVALID_REQUEST
        c = HostelComplaint.objects.create(
            school_id=self.school_id(request),
            hostel_id=data.get("hostel"),
            room_id=self.int_or_none(data.get("room")),
            student_id=self.int_or_none(data.get("student")),
            category=self.int_or_none(data.get("category")) or 8,
            priority=self.int_or_none(data.get("priority")) or 2,
            title=title,
            description=data.get("description") or None,
            assigned_to_id=self.int_or_none(data.get("assigned_to")),
            reported_date=data.get("reported_date") or ndt_today(),
        )
        return Response({"message": "Complaint logged!", "id": c.id})

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        c = HostelComplaint.objects.filter(
            id=data.get("id"), school_id=self.school_id(request)
        ).first()
        if not c:
            return self.RESPONSE__NOT_FOUND
        for key in ("category", "priority", "status"):
            if data.get(key) not in (None, ""):
                setattr(c, key, self.int_or_none(data.get(key)) or getattr(c, key))
        if "room" in data:
            c.room_id = self.int_or_none(data.get("room"))
        if "student" in data:
            c.student_id = self.int_or_none(data.get("student"))
        if "assigned_to" in data:
            c.assigned_to_id = self.int_or_none(data.get("assigned_to"))
        for key in ("title", "description", "resolution", "reported_date"):
            if key in data:
                setattr(c, key, data.get(key) or None)
        # Closing a complaint stamps the date automatically — asking someone to
        # type today's date to close a ticket is how resolved_date ends up empty
        # on half the register.
        if c.status in (COMPLAINT_RESOLVED, 4) and not c.resolved_date:
            c.resolved_date = data.get("resolved_date") or ndt_today()
        if c.status not in (COMPLAINT_RESOLVED, 4):
            c.resolved_date = None
        c.save()
        return Response({"message": "Complaint updated!"})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        c = HostelComplaint.objects.filter(
            id=request.query_params.get("id"), school_id=self.school_id(request)
        ).first()
        if not c:
            return self.RESPONSE__NOT_FOUND
        c.is_active = False
        c.save(update_fields=["is_active"])
        return Response({"message": "Complaint removed!"})


class HostelMessMenuView(HostelBaseView):
    """The weekly menu, read and written as a WHOLE WEEK.

    A menu is edited as a grid — seven days across, four meals down — so the
    write is one PUT of the grid rather than 28 separate saves. Rows that come
    back empty are deleted, which is how a hostel that serves no evening snack
    ends up with a blank cell instead of the word "None".
    """

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        hostel_id = request.query_params.get("hostel")
        if not hostel_id:
            return Response({"days": [], "meals": [], "menu": {}})
        rows = HostelMessMenu.objects.filter(
            hostel_id=hostel_id, school_id=self.school_id(request), is_active=True
        ).values("day_of_week", "meal", "items")
        menu = {}
        for r in rows:
            menu.setdefault(str(r["day_of_week"]), {})[str(r["meal"])] = r["items"] or ""
        return Response(
            {
                "days": [{"value": v, "name": n} for v, n in WEEKDAY_CHOICES],
                "meals": [{"value": v, "name": n} for v, n in MEAL_CHOICES],
                "menu": menu,
            }
        )

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        hostel_id = data.get("hostel")
        menu = data.get("menu")
        if not hostel_id or not isinstance(menu, dict):
            return self.RESPONSE__INVALID_REQUEST
        school_id = self.school_id(request)
        valid_days = {v for v, _ in WEEKDAY_CHOICES}
        valid_meals = {v for v, _ in MEAL_CHOICES}
        written, cleared = 0, 0
        for day, meals in menu.items():
            day_no = self.int_or_none(day)
            if day_no not in valid_days or not isinstance(meals, dict):
                continue
            for meal, items in meals.items():
                meal_no = self.int_or_none(meal)
                if meal_no not in valid_meals:
                    continue
                text = (items or "").strip()
                if text:
                    HostelMessMenu.objects.update_or_create(
                        hostel_id=hostel_id,
                        day_of_week=day_no,
                        meal=meal_no,
                        defaults={
                            "school_id": school_id,
                            "items": text,
                            "is_active": True,
                        },
                    )
                    written += 1
                else:
                    cleared += HostelMessMenu.objects.filter(
                        hostel_id=hostel_id, day_of_week=day_no, meal=meal_no
                    ).delete()[0]
        return Response({"message": f"Menu saved ({written} meal(s))."})


class HostelDisciplineView(HostelBaseView):
    FIELDS = (
        "id", "hostel", "student", "student_name", "date", "severity",
        "description", "action_taken", "reported_by", "guardian_informed",
        "room_no",
    )

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        params = request.query_params
        q = Q(school_id=self.school_id(request), is_active=True)
        if params.get("hostel"):
            q &= Q(hostel_id=params.get("hostel"))
        if params.get("student"):
            q &= Q(student_id=params.get("student"))
        if params.get("from"):
            q &= Q(date__gte=params.get("from"))
        if params.get("to"):
            q &= Q(date__lte=params.get("to"))
        rows = list(
            HostelDisciplineRecord.objects.filter(q)
            .annotate(
                student_name=STUDENT_NAME,
                room_no=F("student__hostel_allocations__room__room_no"),
            )
            .order_by("-date", "-id")
            .values(*self.FIELDS)
            .distinct()
        )
        for r in rows:
            r["severity_name"] = label(PRIORITY_CHOICES, r["severity"])
        return Response(rows)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        if not data.get("hostel") or not data.get("student") or not data.get("description"):
            return self.RESPONSE__INVALID_REQUEST
        rec = HostelDisciplineRecord.objects.create(
            school_id=self.school_id(request),
            hostel_id=data.get("hostel"),
            student_id=data.get("student"),
            date=data.get("date") or ndt_today(),
            severity=self.int_or_none(data.get("severity")) or 2,
            description=data.get("description"),
            action_taken=data.get("action_taken") or None,
            reported_by_id=self.int_or_none(data.get("reported_by")),
            guardian_informed=1 if data.get("guardian_informed") else 0,
        )
        return Response({"message": "Record saved!", "id": rec.id})

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        data = request.data
        rec = HostelDisciplineRecord.objects.filter(
            id=data.get("id"), school_id=self.school_id(request)
        ).first()
        if not rec:
            return self.RESPONSE__NOT_FOUND
        for key in ("date", "description", "action_taken"):
            if key in data:
                setattr(rec, key, data.get(key) or None)
        if data.get("severity"):
            rec.severity = self.int_or_none(data.get("severity")) or rec.severity
        if "reported_by" in data:
            rec.reported_by_id = self.int_or_none(data.get("reported_by"))
        rec.guardian_informed = 1 if data.get("guardian_informed") else 0
        rec.save()
        return Response({"message": "Record updated!"})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        rec = HostelDisciplineRecord.objects.filter(
            id=request.query_params.get("id"), school_id=self.school_id(request)
        ).first()
        if not rec:
            return self.RESPONSE__NOT_FOUND
        rec.is_active = False
        rec.save(update_fields=["is_active"])
        return Response({"message": "Record removed!"})
