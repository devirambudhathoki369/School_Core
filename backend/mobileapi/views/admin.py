"""The school admin's screens (mobile/SPEC.md §5, phase 5).

The figures are the portal's: attendance through `school_attendance_on` (the
dashboard's own count), money through `collected_on` and `collection_totals`,
one student's dues through the fees counter's calculation, and the dues of
many students by the formula of the portal's dues report (billed, less paid
and discounted, in each student's own academic year).
"""
from datetime import timedelta

from django.db.models import DecimalField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response

from main.methods.collections import collection_totals
from main.models.Attendance import StaffAttendance
from main.models.ClassInfo import ClassInfo
from main.models.Guardian import Guardian, StudentGuardian
from main.models.Invoice import PAYMENT_MODES_MAPPING, StudentInvoice
from main.models.Ledger import StudentLedger
from main.models.Staff import Staff
from main.models.Student import Student
from main.views.school.SchoolDashView import collected_on, school_attendance_on

from ..access import (
    TAKE_PAYMENTS, UPDATE_STUDENTS, forbidden, staff_of, staff_permissions, bs_date, bs_month, not_found, page_by_offset, paisa, require_role,
)
from ..auth import STAFF_EMPLOYED, STUDENT_RUNNING
from ..errors import MobileError
from ..guardians import FAMILY_CODE_DAYS, issue_family_code
from ..idempotency import idempotent
from ..models import AppSession
from ..profiles import _media, _name, student_payload
from .base import MobileAPIView
from .staff import class_name
from .students import (
    AttendanceTotalsOut, ChildOut, FeesDueOut, day_marks, dues, student_days,
)

RELATIONS = {1: "father", 2: "mother", 3: "guardian", 4: "other"}
LINK_STATES = {1: "linked", 2: "review", 3: "rejected"}
GENDERS = {1: "male", 2: "female", 3: "other"}
ZERO = Value(0, output_field=DecimalField(max_digits=12, decimal_places=2))


# --- responses ----------------------------------------------------------------
class HeadcountOut(serializers.Serializer):
    total = serializers.IntegerField()
    present = serializers.IntegerField()
    absent = serializers.IntegerField()


class ClassHeadcountOut(HeadcountOut):
    name = serializers.CharField()


class ModeAmountOut(serializers.Serializer):
    mode = serializers.IntegerField()
    label = serializers.CharField()
    amount_paisa = serializers.IntegerField()


class CollectedOut(serializers.Serializer):
    amount_paisa = serializers.IntegerField()
    receipts = serializers.IntegerField()
    by_mode = ModeAmountOut(many=True)


class DashboardOut(serializers.Serializer):
    date = serializers.CharField()
    students = HeadcountOut()
    staff = HeadcountOut()
    classes = ClassHeadcountOut(many=True)
    collected = CollectedOut()
    month_label = serializers.CharField()
    collected_month_paisa = serializers.IntegerField()
    dues_paisa = serializers.IntegerField()
    links_to_review = serializers.IntegerField()


class StudentRowOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    class_name = serializers.CharField()
    roll_no = serializers.CharField(allow_null=True)
    photo_url = serializers.CharField(allow_null=True)


class StudentListOut(serializers.Serializer):
    items = StudentRowOut(many=True)
    next_cursor = serializers.CharField(allow_null=True)


class StudentProfileOut(serializers.Serializer):
    gender = serializers.CharField(allow_null=True)
    birth_date = serializers.CharField(allow_null=True)
    contact = serializers.CharField(allow_null=True)
    address = serializers.CharField(allow_null=True)
    father_name = serializers.CharField(allow_null=True)
    mother_name = serializers.CharField(allow_null=True)
    guardian_name = serializers.CharField(allow_null=True)
    guardian_contact = serializers.CharField(allow_null=True)


class GuardianLinkBriefOut(serializers.Serializer):
    link_id = serializers.IntegerField()
    guardian_id = serializers.IntegerField()
    name = serializers.CharField()
    phone = serializers.CharField()
    email = serializers.CharField(allow_null=True)
    relation = serializers.CharField()
    state = serializers.ChoiceField(choices=sorted(LINK_STATES.values()))
    on_app = serializers.BooleanField()


class MonthTotalsOut(AttendanceTotalsOut):
    label = serializers.CharField()


class AdminStudentOut(serializers.Serializer):
    student = ChildOut()
    profile = StudentProfileOut()
    guardians = GuardianLinkBriefOut(many=True)
    dues = FeesDueOut(allow_null=True, help_text="Left out for staff without the payments permission (103)")
    attendance = MonthTotalsOut()


class ClassDuesOut(serializers.Serializer):
    class_id = serializers.IntegerField()
    class_name = serializers.CharField()
    students = serializers.IntegerField()
    owing = serializers.IntegerField(help_text="Students who owe something")
    due_paisa = serializers.IntegerField()


class StudentDueOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    roll_no = serializers.CharField(allow_null=True)
    due_paisa = serializers.IntegerField()


class DuesOut(serializers.Serializer):
    total_paisa = serializers.IntegerField()
    classes = ClassDuesOut(many=True)
    students = StudentDueOut(many=True, help_text="Only when one class is asked for")


class DayAmountOut(serializers.Serializer):
    date = serializers.CharField()
    amount_paisa = serializers.IntegerField()


class CollectionsOut(serializers.Serializer):
    start = serializers.CharField()
    end = serializers.CharField()
    total_paisa = serializers.IntegerField()
    days = DayAmountOut(many=True)
    by_mode = ModeAmountOut(many=True)


class StaffRowOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    designation = serializers.CharField()
    phone = serializers.CharField(allow_null=True)
    photo_url = serializers.CharField(allow_null=True)
    status = serializers.ChoiceField(choices=["present", "absent", "not_taken"])
    checked_in_at = serializers.DateTimeField(allow_null=True)
    checked_out_at = serializers.DateTimeField(allow_null=True)


class StaffDayOut(serializers.Serializer):
    date = serializers.CharField()
    totals = HeadcountOut()
    items = StaffRowOut(many=True)


class LinkGuardianOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    phone = serializers.CharField()
    email = serializers.CharField(allow_null=True)


class LinkOut(serializers.Serializer):
    id = serializers.IntegerField()
    relation = serializers.CharField()
    state = serializers.ChoiceField(choices=sorted(LINK_STATES.values()))
    created_at = serializers.DateTimeField()
    guardian = LinkGuardianOut()
    student = StudentRowOut()
    shared_with = serializers.ListField(child=serializers.CharField(),
                                        help_text="Other children on this number")


class LinkListOut(serializers.Serializer):
    items = LinkOut(many=True)
    next_cursor = serializers.CharField(allow_null=True)


class DecisionIn(serializers.Serializer):
    decision = serializers.ChoiceField(choices=["confirm", "reject"])


class FamilyCodeOut(serializers.Serializer):
    code = serializers.CharField(help_text="Shown once; only its hash is kept")
    expires_at = serializers.DateTimeField()
    guardian = LinkGuardianOut()


# --- shared pieces ------------------------------------------------------------------
def _admin(request):
    require_role(request, AppSession.ADMIN)
    return request.auth.school_id


def _admin_or_staff(request, permission) -> tuple[int, set]:
    """The school, and the caller's permissions ("admin" for the school admin)."""
    if request.auth.role == AppSession.ADMIN:
        return request.auth.school_id, {"admin"}
    if request.auth.role == AppSession.STAFF:
        perms = staff_permissions(staff_of(request))
        if permission in perms:
            return request.auth.school_id, perms
    raise forbidden()


def running_students(school_id):
    return Student.objects.filter(class_info__school=school_id, is_active=True, status=STUDENT_RUNNING)


def with_dues(students):
    """Each student's dues for their own academic year, by the portal's dues
    report (OverallStudentLedgersSearchView): billed, less paid and discount."""
    same = {"student": OuterRef("pk"), "academic_year": OuterRef("academic_year"), "is_active": True}

    def total(model, field, **extra):
        return Coalesce(
            Subquery(
                model.objects.filter(**same, **extra).values("student").annotate(t=Sum(field)).values("t")[:1],
                output_field=DecimalField(max_digits=12, decimal_places=2),
            ),
            ZERO,
        )

    return students.annotate(
        billed=total(StudentLedger, "total", ledger_posting__is_active=True),
        paid=total(StudentInvoice, "total_paid", isCashReceipt=False),
        discount=total(StudentInvoice, "total_discount", isCashReceipt=False),
    )


def _due(student) -> int:
    return paisa(student.billed - student.paid - student.discount)


class _ClassNames(dict):
    def __missing__(self, class_id):
        klass = ClassInfo.objects.select_related("section", "course").filter(pk=class_id).first()
        self[class_id] = class_name(klass) if klass else ""
        return self[class_id]


def _row(request, student, names) -> dict:
    return {
        "id": student.id,
        "name": _name(student),
        "class_name": names[student.class_info_id],
        "roll_no": student.roll_no or None,
        "photo_url": _media(request, student.image),
    }


def _guardian_out(guardian) -> dict:
    return {"id": guardian.id, "name": guardian.name or "Parent", "phone": guardian.phone, "email": guardian.email}


def link_payload(request, link, names) -> dict:
    others = (
        StudentGuardian.objects.filter(guardian=link.guardian_id)
        .exclude(pk=link.pk)
        .select_related("student")
        .order_by("student__first_name")
    )
    return {
        "id": link.id,
        "relation": RELATIONS.get(link.relation, "other"),
        "state": LINK_STATES.get(link.state, "review"),
        "created_at": link.created_at,
        "guardian": _guardian_out(link.guardian),
        "student": _row(request, link.student, names),
        "shared_with": [_name(other.student) for other in others],
    }


# --- views --------------------------------------------------------------------
class AdminDashboardView(MobileAPIView):
    @extend_schema(parameters=[OpenApiParameter("date", str, description="BS YYYY-MM-DD; today when left out")],
                   responses=DashboardOut)
    def get(self, request):
        school_id = _admin(request)
        date = bs_date(request.query_params.get("date"))
        attendance = school_attendance_on(school_id, date)
        money = collected_on(school_id, date)
        month = bs_month(date[:7])
        in_month = collection_totals(Q(school=school_id, date__range=(month["start"], month["end"])), "school")
        owed = sum(max(_due(s), 0) for s in with_dues(running_students(school_id)))
        body = {
            "date": date,
            "students": attendance["students"],
            "staff": attendance["staff"],
            "classes": attendance["classes"],
            "collected": {
                "amount_paisa": paisa(money["amount"]),
                "receipts": money["receipts"],
                "by_mode": [
                    {"mode": m["mode"], "label": m["label"], "amount_paisa": paisa(m["amount"])}
                    for m in money["by_mode"]
                ],
            },
            "month_label": month["label"],
            "collected_month_paisa": paisa(sum(in_month.values())),
            "dues_paisa": owed,
            "links_to_review": StudentGuardian.objects.filter(
                guardian__school=school_id, state=StudentGuardian.NEEDS_REVIEW
            ).count(),
        }
        return Response(DashboardOut(body).data)


class AdminStudentsView(MobileAPIView):
    @extend_schema(
        parameters=[OpenApiParameter("q", str, description="Name, roll or registration number"),
                    OpenApiParameter("class", int), OpenApiParameter("cursor", str)],
        responses=StudentListOut,
    )
    def get(self, request):
        school_id, _ = _admin_or_staff(request, UPDATE_STUDENTS)
        students = running_students(school_id)
        klass = request.query_params.get("class")
        if klass:
            if not str(klass).isdigit():
                raise MobileError("invalid", "Choose a class.", fields={"class": "Not a class."})
            students = students.filter(class_info=int(klass))
        query = (request.query_params.get("q") or "").strip()[:60]
        if query:
            for word in query.split()[:4]:
                students = students.filter(
                    Q(first_name__icontains=word) | Q(middle_name__icontains=word) | Q(last_name__icontains=word)
                    | Q(roll_no__iexact=word) | Q(regd_no__iexact=word)
                )
        students = students.order_by("first_name", "last_name", "id")
        rows, cursor = page_by_offset(students, request)
        names = _ClassNames()
        return Response(StudentListOut({"items": [_row(request, s, names) for s in rows], "next_cursor": cursor}).data)


class AdminStudentView(MobileAPIView):
    @extend_schema(operation_id="admin_student", parameters=[OpenApiParameter("student_id", int, OpenApiParameter.PATH)],
                   responses=AdminStudentOut)
    def get(self, request, student_id):
        school_id, perms = _admin_or_staff(request, UPDATE_STUDENTS)
        sees_dues = "admin" in perms or TAKE_PAYMENTS in perms
        student = (
            running_students(school_id)
            .select_related("class_info__school", "class_info__section", "class_info__course", "guardian_info",
                            "academic_year")
            .filter(pk=student_id)
            .first()
        )
        if student is None:
            raise not_found("That student was not found.")
        info = student.guardian_info
        on_app = set(
            AppSession.objects.filter(role=AppSession.PARENT, school=school_id, revoked_at__isnull=True)
            .values_list("guardian_id", flat=True)
        )
        links = StudentGuardian.objects.filter(student=student).select_related("guardian").order_by("state", "id")
        month = bs_month(None)
        days = student_days(student, month["start"], month["end"])
        present = sum(1 for d in days.values() if d["status"] == "present")
        body = {
            "student": student_payload(student, request),
            "profile": {
                "gender": GENDERS.get(student.gender),
                "birth_date": student.birth_date or None,
                "contact": student.contact or None,
                "address": student.location or None,
                "father_name": info.father_name if info else None,
                "mother_name": info.mother_name if info else None,
                "guardian_name": (info.guardian_name or None) if info else None,
                "guardian_contact": info.guardian_contact if info else None,
            },
            "guardians": [
                {
                    "link_id": link.id,
                    "guardian_id": link.guardian_id,
                    "name": link.guardian.name or "Parent",
                    "phone": link.guardian.phone,
                    "email": link.guardian.email,
                    "relation": RELATIONS.get(link.relation, "other"),
                    "state": LINK_STATES.get(link.state, "review"),
                    "on_app": link.guardian_id in on_app,
                }
                for link in links
            ],
            "dues": (
                {**dues(student), "academic_year": student.academic_year.name if student.academic_year_id else ""}
                if sees_dues else None
            ),
            "attendance": {"label": month["label"], "present": present, "absent": len(days) - present,
                           "taken": len(days)},
        }
        return Response(AdminStudentOut(body).data)


class AdminDuesView(MobileAPIView):
    @extend_schema(parameters=[OpenApiParameter("class", int, description="One class's students")],
                   responses=DuesOut)
    def get(self, request):
        school_id = _admin(request)
        students = with_dues(running_students(school_id)).select_related("class_info__section", "class_info__course")
        klass = request.query_params.get("class")
        if klass:
            if not str(klass).isdigit():
                raise MobileError("invalid", "Choose a class.", fields={"class": "Not a class."})
            students = students.filter(class_info=int(klass))
        by_class, rows = {}, []
        for student in students:
            due = _due(student)
            entry = by_class.setdefault(student.class_info_id, {
                "class_id": student.class_info_id, "class_name": class_name(student.class_info),
                "students": 0, "owing": 0, "due_paisa": 0, "order": (
                    student.class_info.education_level or 0, student.class_info.grade or 0,
                    student.class_info.section_id or 0, student.class_info_id,
                ),
            })
            entry["students"] += 1
            if due > 0:
                entry["owing"] += 1
                entry["due_paisa"] += due
            if klass:
                rows.append({"id": student.id, "name": _name(student), "roll_no": student.roll_no or None,
                             "due_paisa": due})
        classes = sorted(by_class.values(), key=lambda c: c.pop("order"))
        rows.sort(key=lambda r: (-r["due_paisa"], r["name"]))
        body = {"total_paisa": sum(c["due_paisa"] for c in classes), "classes": classes, "students": rows}
        return Response(DuesOut(body).data)


class AdminCollectionsView(MobileAPIView):
    @extend_schema(
        parameters=[OpenApiParameter("from", str, description="BS date; the 1st of this month when left out"),
                    OpenApiParameter("to", str, description="BS date; today when left out")],
        responses=CollectionsOut,
    )
    def get(self, request):
        school_id = _admin(request)
        given_from = request.query_params.get("from")
        start = bs_date(given_from, "from") if given_from else bs_month(None)["start"]
        end = bs_date(request.query_params.get("to"), "to")
        if end < start:
            raise MobileError("invalid", "The end date is before the start.", fields={"to": "Before from."})
        query = Q(school=school_id, date__range=(start, end))
        by_day = collection_totals(query, "date")
        by_mode = collection_totals(query, "mode")
        body = {
            "start": start,
            "end": end,
            "total_paisa": paisa(sum(by_day.values())),
            "days": [{"date": d, "amount_paisa": paisa(a)} for d, a in sorted(by_day.items(), reverse=True)],
            "by_mode": [
                {"mode": mode, "label": PAYMENT_MODES_MAPPING.get(mode, str(mode)), "amount_paisa": paisa(amount)}
                for mode, amount in by_mode.items()
            ],
        }
        return Response(CollectionsOut(body).data)


def _staff_day(request, school_id, date, query=""):
    staff = Staff.objects.filter(school=school_id, is_active=True, status=STAFF_EMPLOYED).select_related("role")
    for word in query.split()[:4]:
        staff = staff.filter(Q(first_name__icontains=word) | Q(middle_name__icontains=word)
                             | Q(last_name__icontains=word))
    staff = list(staff.order_by("first_name", "last_name", "id"))
    rows = (
        StaffAttendance.objects.filter(school=school_id, date=date, is_active=True, staff__in=staff)
        .order_by("id")
        .values("staff", "date", "status", "checked_in_at", "checked_out_at")
    )
    marks = {}
    for row in rows:
        marks.setdefault(row["staff"], []).append(row)
    items, present = [], 0
    for member in staff:
        mark = day_marks(marks.get(member.id, [])).get(date) or {
            "status": "not_taken", "checked_in_at": None, "checked_out_at": None,
        }
        present += mark["status"] == "present"
        items.append({
            "id": member.id,
            "name": _name(member),
            "designation": member.role.role if member.role_id else "",
            "phone": member.primary_contact or None,
            "photo_url": _media(request, member.image),
            "status": mark["status"],
            "checked_in_at": mark["checked_in_at"],
            "checked_out_at": mark["checked_out_at"],
        })
    totals = {"total": len(items), "present": present, "absent": len(items) - present}
    return {"date": date, "totals": totals, "items": items}


class AdminStaffView(MobileAPIView):
    @extend_schema(parameters=[OpenApiParameter("q", str)], responses=StaffDayOut)
    def get(self, request):
        school_id = _admin(request)
        query = (request.query_params.get("q") or "").strip()[:60]
        return Response(StaffDayOut(_staff_day(request, school_id, bs_date(None), query)).data)


class AdminStaffAttendanceView(MobileAPIView):
    @extend_schema(parameters=[OpenApiParameter("date", str)], responses=StaffDayOut)
    def get(self, request):
        school_id = _admin(request)
        return Response(StaffDayOut(_staff_day(request, school_id, bs_date(request.query_params.get("date")))).data)


class GuardianLinksView(MobileAPIView):
    @extend_schema(
        parameters=[OpenApiParameter("state", int, enum=[1, 2, 3], description="2, to review, when left out"),
                    OpenApiParameter("cursor", str)],
        responses=LinkListOut,
    )
    def get(self, request):
        school_id = _admin(request)
        state = request.query_params.get("state") or str(StudentGuardian.NEEDS_REVIEW)
        if state not in ("1", "2", "3"):
            raise MobileError("invalid", "Choose a state: 1, 2 or 3.", fields={"state": "1, 2 or 3"})
        links = (
            StudentGuardian.objects.filter(guardian__school=school_id, state=int(state),
                                           student__is_active=True, student__status=STUDENT_RUNNING)
            .select_related("guardian", "student")
            .order_by("guardian__phone", "id")
        )
        rows, cursor = page_by_offset(links, request)
        names = _ClassNames()
        return Response(LinkListOut({"items": [link_payload(request, link, names) for link in rows],
                                     "next_cursor": cursor}).data)


class GuardianLinkDecideView(MobileAPIView):
    @extend_schema(parameters=[OpenApiParameter("link_id", int, OpenApiParameter.PATH)], request=DecisionIn,
                   responses=LinkOut)
    @idempotent
    def post(self, request, link_id):
        school_id = _admin(request)
        given = DecisionIn(data=request.data)
        if not given.is_valid():
            raise MobileError("invalid", "Choose confirm or reject.", fields={"decision": "confirm or reject"})
        link = (
            StudentGuardian.objects.select_related("guardian", "student")
            .filter(pk=link_id, guardian__school=school_id).first()
        )
        if link is None:
            raise not_found("That link was not found.")
        link.state = StudentGuardian.LINKED if given.validated_data["decision"] == "confirm" else StudentGuardian.REJECTED
        if link.state == StudentGuardian.REJECTED:
            link.is_primary = False
        link.decided_at = timezone.now()
        link.save(update_fields=["state", "is_primary", "decided_at"])
        return Response(LinkOut(link_payload(request, link, _ClassNames())).data)


class GuardianFamilyCodeView(MobileAPIView):
    @extend_schema(parameters=[OpenApiParameter("guardian_id", int, OpenApiParameter.PATH)], request=None,
                   responses={201: FamilyCodeOut})
    def post(self, request, guardian_id):
        """The school admin, or staff who may update student records (102)."""
        # Not replayed by its Idempotency-Key: that would keep the code itself
        # in the cache. A retry simply makes a new code, which cancels the old.
        school_id, perms = _admin_or_staff(request, UPDATE_STUDENTS)
        guardian = Guardian.objects.filter(pk=guardian_id, school=school_id, is_active=True).first()
        if guardian is None:
            raise not_found("That parent was not found.")
        if "admin" in perms:
            code = issue_family_code(guardian, admin=request.auth.account)
        else:
            code = issue_family_code(guardian, staff=request.auth.account)
        body = {
            "code": code,
            "expires_at": timezone.now() + timedelta(days=FAMILY_CODE_DAYS),
            "guardian": _guardian_out(guardian),
        }
        return Response(FamilyCodeOut(body).data, status=201)
