"""A child's screens for parents and students (mobile/SPEC.md §5, phase 3).

Every path opens the student through `student_for`, so a parent reaches only
their linked children and a student only themself. The numbers come from the
portal's own calculations (dues, payment history, receipts, results), so the
app always shows what the school office sees.
"""
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from main.methods.genInvoiceData import generateInvoiceDataById
from main.methods.getFeeDetails import getFeeTitlesFromTitleIds
from main.methods.nepaliDatetime import ndt_today
from main.models.Attendance import StudentAttendance
from main.models.CalendarEvent import CalendarEvent
from main.models.ClassPeriod import ClassPeriod
from main.models.exams.Exam import Exam
from main.models.exams.Result import ClassResult
from main.models.Homework import Homework, HomeworkSubmission
from main.models.Invoice import PAYMENT_MODES_MAPPING, StudentInvoice
from main.models.Notice import Notice
from main.models.Staff import Staff
from main.models.Subject import Subject
from main.serializers.HomeworkSerializer import HomeworkSubmissionSerializer
from main.views.exams.ResultViews import ResultView
from main.views.InvoiceViews import InvoiceViews
from main.views.LedgerViews import LedgerView

from ..access import bs_month, month_names, not_found, page_by_id, paisa, student_for
from ..auth import STUDENT_RUNNING
from ..errors import MobileError
from ..idempotency import idempotent
from ..profiles import _class_name, _media, _name, student_payload
from .base import MobileAPIView
from .school import EVENT_TYPES, NoticeOut, event_payload, notice_payload

HAND_IN_STATES = {1: "received", 2: "checked"}


# --- responses ----------------------------------------------------------------
class ChildOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    class_name = serializers.CharField()
    roll_no = serializers.CharField(allow_null=True)
    photo_url = serializers.CharField(allow_null=True)


class FileOut(serializers.Serializer):
    name = serializers.CharField()
    url = serializers.CharField()


class DayMarkOut(serializers.Serializer):
    date = serializers.CharField()
    status = serializers.ChoiceField(choices=["present", "absent", "not_taken"])
    checked_in_at = serializers.DateTimeField(allow_null=True)
    checked_out_at = serializers.DateTimeField(allow_null=True)


class EventOut(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    type = serializers.ChoiceField(choices=sorted(EVENT_TYPES.values()))
    start_date = serializers.CharField()
    end_date = serializers.CharField()


class HomeworkBriefOut(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    subject = serializers.CharField()
    due_date = serializers.CharField()


class StudentHomeOut(serializers.Serializer):
    student = ChildOut()
    today = DayMarkOut()
    fees_due_paisa = serializers.IntegerField()
    homework_open = serializers.IntegerField()
    homework = HomeworkBriefOut(many=True)
    events = EventOut(many=True)
    notice = NoticeOut(allow_null=True)


class MonthOut(serializers.Serializer):
    month = serializers.CharField()
    label = serializers.CharField()
    start = serializers.CharField()
    end = serializers.CharField()
    days = serializers.IntegerField()
    starts_on = serializers.IntegerField(help_text="Weekday of the 1st, 0 = Sunday")
    previous = serializers.CharField()
    next = serializers.CharField()


class AttendanceTotalsOut(serializers.Serializer):
    present = serializers.IntegerField()
    absent = serializers.IntegerField()
    taken = serializers.IntegerField()


class AttendanceMonthOut(serializers.Serializer):
    month = MonthOut()
    days = DayMarkOut(many=True)
    totals = AttendanceTotalsOut()


class FeeLineOut(serializers.Serializer):
    title = serializers.CharField()
    amount_paisa = serializers.IntegerField()


class FeesDueOut(serializers.Serializer):
    total_paisa = serializers.IntegerField(help_text="Owed now; below zero is money paid ahead")
    items = FeeLineOut(many=True)
    academic_year = serializers.CharField()


class FeeEntryOut(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["bill", "payment"])
    id = serializers.IntegerField()
    date = serializers.CharField()
    amount_paisa = serializers.IntegerField()
    months = serializers.ListField(child=serializers.CharField())
    mode = serializers.CharField(allow_null=True)
    receipt_id = serializers.IntegerField(allow_null=True, help_text="Open it at receipts/{receipt_id}")
    lines = FeeLineOut(many=True)


class FeeHistoryOut(serializers.Serializer):
    items = FeeEntryOut(many=True)
    next_cursor = serializers.CharField(allow_null=True)


class ReceiptLineOut(serializers.Serializer):
    title = serializers.CharField()
    rate_paisa = serializers.IntegerField()
    paid_paisa = serializers.IntegerField()
    due_paisa = serializers.IntegerField()
    discount_paisa = serializers.IntegerField()


class ReceiptOut(serializers.Serializer):
    id = serializers.IntegerField()
    receipt_no = serializers.IntegerField()
    date = serializers.CharField()
    student_name = serializers.CharField()
    class_name = serializers.CharField()
    mode = serializers.CharField()
    months = serializers.ListField(child=serializers.CharField())
    lines = ReceiptLineOut(many=True)
    total_paid_paisa = serializers.IntegerField()
    total_due_paisa = serializers.IntegerField()
    total_discount_paisa = serializers.IntegerField()
    cashier = serializers.CharField(allow_null=True)
    remarks = serializers.CharField(allow_null=True)


class HandInOut(serializers.Serializer):
    id = serializers.IntegerField()
    submitted_date = serializers.CharField()
    status = serializers.ChoiceField(choices=sorted(HAND_IN_STATES.values()))
    remarks = serializers.CharField(allow_null=True)
    files = FileOut(many=True)


class HomeworkOut(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    description = serializers.CharField()
    subject = serializers.CharField()
    teacher = serializers.CharField()
    due_date = serializers.CharField()
    open = serializers.BooleanField(help_text="Hand-ins are taken until the end of the due date")
    files = FileOut(many=True)
    hand_in = HandInOut(allow_null=True)


class HomeworkListOut(serializers.Serializer):
    items = HomeworkOut(many=True)
    next_cursor = serializers.CharField(allow_null=True)


class HandInIn(serializers.Serializer):
    files = serializers.ListField(child=serializers.FileField(), min_length=1, max_length=10)


class ExamOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    published_date = serializers.CharField()


class ExamListOut(serializers.Serializer):
    items = ExamOut(many=True)


class SubjectMarkOut(serializers.Serializer):
    subject = serializers.CharField()
    full_marks = serializers.CharField()
    pass_marks = serializers.CharField()
    theory = serializers.CharField(allow_null=True)
    practical = serializers.CharField(allow_null=True)
    total = serializers.CharField(allow_null=True)
    grade = serializers.CharField(allow_null=True)
    grade_point = serializers.CharField(allow_null=True)
    absent = serializers.BooleanField()
    passed = serializers.BooleanField()


class ExamResultOut(serializers.Serializer):
    exam = ExamOut()
    class_name = serializers.CharField()
    subjects = SubjectMarkOut(many=True)
    total = serializers.CharField()
    full_marks = serializers.CharField()
    percentage = serializers.CharField(allow_null=True)
    gpa = serializers.CharField(allow_null=True)
    passed = serializers.BooleanField()
    attendance = serializers.IntegerField(allow_null=True)
    attendance_total = serializers.IntegerField(allow_null=True)


class PeriodOut(serializers.Serializer):
    period = serializers.IntegerField()
    subject = serializers.CharField(allow_null=True)
    teacher = serializers.CharField(allow_null=True)


class TimetableOut(serializers.Serializer):
    class_name = serializers.CharField()
    periods = PeriodOut(many=True)


STUDENT_ID = OpenApiParameter("student_id", int, OpenApiParameter.PATH)


# --- shared pieces ------------------------------------------------------------------
def day_marks(rows) -> dict:
    """{date: mark} from attendance rows; a present row wins over an absent one
    (a card punch over a paper roll), and the earliest check-in is kept."""
    days = {}
    for row in rows:
        date = row["date"]
        mark = days.get(date)
        present = bool(row["status"])
        if mark is None:
            days[date] = {
                "date": date,
                "status": "present" if present else "absent",
                "checked_in_at": row.get("checked_in_at") if present else None,
                "checked_out_at": row.get("checked_out_at") if present else None,
            }
        elif present:
            mark["status"] = "present"
            times = [t for t in (mark["checked_in_at"], row.get("checked_in_at")) if t]
            mark["checked_in_at"] = min(times) if times else None
            outs = [t for t in (mark["checked_out_at"], row.get("checked_out_at")) if t]
            mark["checked_out_at"] = max(outs) if outs else None
    return days


def student_days(student, start: str, end: str) -> dict:
    rows = (
        StudentAttendance.objects.filter(
            student=student, is_active=True, class_attendance__is_active=True,
            class_attendance__date__range=(start, end),
        )
        .order_by("class_attendance__date", "id")
        .values("class_attendance__date", "status", "checked_in_at", "checked_out_at")
    )
    return day_marks({**row, "date": row["class_attendance__date"]} for row in rows)


def title_names(titles) -> dict:
    """The portal keys fee titles by number in one map and by text in another."""
    return {str(key): str(name).strip().capitalize() for key, name in (titles or {}).items() if name}


def dues(student) -> dict:
    """The portal's dues for the student's current year, as the fees counter
    shows them (LedgerView.mergeStudentLedgers)."""
    school_id = student.class_info.school_id
    merged = LedgerView().mergeStudentLedgers(student.id, student.class_info_id, school_id, student.academic_year_id)
    titles = title_names(merged.get("titles"))
    unnamed = [int(k) for k in (merged.get("bill_amount") or {}) if str(k).isdigit() and str(k) not in titles]
    if unnamed:  # a title billed earlier whose fee row is gone from the class
        titles.update(title_names(getFeeTitlesFromTitleIds(unnamed)))
    items = [
        {"title": titles.get(str(key)) or str(key), "amount_paisa": paisa(amount)}
        for key, amount in (merged.get("bill_amount") or {}).items()
    ]
    items = sorted((item for item in items if item["amount_paisa"]), key=lambda item: -item["amount_paisa"])
    return {"total_paisa": paisa(merged.get("total")), "items": items}


def class_timetable(class_info):
    """The class's routine as the portal's timetable answers it: this year's,
    or one that predates years (ClassPeriodView.get)."""
    query = Q(class_info=class_info.id, is_active=True)
    if class_info.academic_year_id:
        query &= Q(academic_year=class_info.academic_year_id) | Q(academic_year__isnull=True)
    return ClassPeriod.objects.filter(query).order_by("-id").first()


def _int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def timetable_periods(period) -> list[dict]:
    if period is None:
        return []
    subjects = {str(k): _int(v) for k, v in (period.subjects or {}).items()}
    teachers = {str(k): _int(v) for k, v in (period.teachers or {}).items()}
    subject_names = dict(
        Subject.objects.filter(id__in=[v for v in subjects.values() if v]).values_list("id", "subject")
    )
    staff_names = {
        s.id: _name(s) for s in Staff.objects.filter(id__in=[v for v in teachers.values() if v])
    }
    count = max([period.period_count or 0, *(_int(k) or 0 for k in subjects), *(_int(k) or 0 for k in teachers)])
    return [
        {
            "period": n,
            "subject": subject_names.get(subjects.get(str(n))),
            "teacher": staff_names.get(teachers.get(str(n))),
            "subject_id": subjects.get(str(n)),
            "teacher_id": teachers.get(str(n)),
        }
        for n in range(1, count + 1)
    ]


def _files(request, rows) -> list[dict]:
    out = []
    for row in rows:
        url = _media(request, row.file)
        if url:
            out.append({"name": row.file.name.rsplit("/", 1)[-1], "url": url})
    return out


def hand_in_payload(request, submission) -> dict:
    return {
        "id": submission.id,
        "submitted_date": submission.submitted_date,
        "status": HAND_IN_STATES.get(submission.status, "received"),
        "remarks": submission.remarks or None,
        "files": _files(request, submission.homeworksubmissionfile_set.all()),
    }


def homework_payload(request, homework, submission, today: str) -> dict:
    return {
        "id": homework.id,
        "title": homework.title,
        "description": homework.description or "",
        "subject": homework.subject.subject if homework.subject_id else "",
        "teacher": _name(homework.staff) if homework.staff_id else "",
        "due_date": homework.due_date,
        "open": str(homework.due_date) >= today,
        "files": _files(request, homework.homeworkfile_set.all()),
        "hand_in": hand_in_payload(request, submission) if submission else None,
    }


def _homework_for(student):
    return Homework.objects.filter(
        class_info=student.class_info_id, school=student.class_info.school_id, is_active=True
    ).select_related("subject", "staff").prefetch_related("homeworkfile_set")


def _latest_hand_ins(student, homework_ids) -> dict:
    hand_ins = {}
    for sub in (
        HomeworkSubmission.objects.filter(student=student, homework_id__in=homework_ids, is_active=True)
        .prefetch_related("homeworksubmissionfile_set")
        .order_by("id")
    ):
        hand_ins[sub.homework_id] = sub
    return hand_ins


# --- views --------------------------------------------------------------------
class StudentHomeView(MobileAPIView):
    @extend_schema(parameters=[STUDENT_ID], responses=StudentHomeOut)
    def get(self, request, student_id):
        student = student_for(request, student_id)
        today = ndt_today()
        school_id = student.class_info.school_id
        mark = student_days(student, today, today).get(today) or {
            "date": today, "status": "not_taken", "checked_in_at": None, "checked_out_at": None,
        }
        open_homework = _homework_for(student).filter(due_date__gte=today)
        handed_in = set(
            HomeworkSubmission.objects.filter(student=student, homework__in=open_homework, is_active=True)
            .values_list("homework_id", flat=True)
        )
        waiting = [hw for hw in open_homework.order_by("due_date", "id") if hw.id not in handed_in]
        events = CalendarEvent.objects.filter(school=school_id, is_active=True, end_date__gte=today).order_by(
            "start_date", "id"
        )[:3]
        notice = Notice.objects.filter(school=school_id, is_active=True).order_by("-id").first()
        body = {
            "student": student_payload(student, request),
            "today": mark,
            "fees_due_paisa": dues(student)["total_paisa"],
            "homework_open": len(waiting),
            "homework": [
                {"id": hw.id, "title": hw.title, "subject": hw.subject.subject if hw.subject_id else "",
                 "due_date": hw.due_date}
                for hw in waiting[:3]
            ],
            "events": [event_payload(e) for e in events],
            "notice": notice_payload(request, notice) if notice else None,
        }
        return Response(StudentHomeOut(body).data)


class StudentAttendanceView(MobileAPIView):
    @extend_schema(
        parameters=[STUDENT_ID, OpenApiParameter("month", str, description="BS YYYY-MM; this month when left out")],
        responses=AttendanceMonthOut,
    )
    def get(self, request, student_id):
        student = student_for(request, student_id)
        month = bs_month(request.query_params.get("month"))
        days = student_days(student, month["start"], month["end"])
        present = sum(1 for d in days.values() if d["status"] == "present")
        body = {
            "month": month,
            "days": sorted(days.values(), key=lambda d: d["date"]),
            "totals": {"present": present, "absent": len(days) - present, "taken": len(days)},
        }
        return Response(AttendanceMonthOut(body).data)


class StudentFeesView(MobileAPIView):
    @extend_schema(parameters=[STUDENT_ID], responses=FeesDueOut)
    def get(self, request, student_id):
        student = student_for(request, student_id)
        body = {**dues(student), "academic_year": student.academic_year.name if student.academic_year_id else ""}
        return Response(FeesDueOut(body).data)


class StudentFeeHistoryView(MobileAPIView):
    @extend_schema(parameters=[STUDENT_ID], responses=FeeHistoryOut)
    def get(self, request, student_id):
        student = student_for(request, student_id)
        history = InvoiceViews().getTrialBalance(student.id, student.class_info.school_id, student.academic_year_id)
        titles = title_names(history.get("titles"))
        items = []
        for row in history.get("data") or []:
            is_bill = "debit_amount" in row
            lines = [
                {"title": titles.get(str(title)) or str(title), "amount_paisa": paisa(amount)}
                for title, amount in (row.get("particulars") or [])
            ]
            items.append({
                "kind": "bill" if is_bill else "payment",
                "id": row["id"],
                "date": row.get("date") or "",
                "amount_paisa": paisa(row.get("debit_amount") if is_bill else row.get("credit_amount")),
                "months": month_names(row.get("months")),
                "mode": None if is_bill else PAYMENT_MODES_MAPPING.get(row.get("mode")),
                "receipt_id": None if is_bill else row["id"],
                "lines": [line for line in lines if line["amount_paisa"]],
            })
        items.sort(key=lambda item: (item["date"], item["kind"] == "payment", item["id"]), reverse=True)
        return Response(FeeHistoryOut({"items": items, "next_cursor": None}).data)


class StudentReceiptView(MobileAPIView):
    @extend_schema(parameters=[STUDENT_ID, OpenApiParameter("receipt_id", int, OpenApiParameter.PATH)],
                   responses=ReceiptOut)
    def get(self, request, student_id, receipt_id):
        student = student_for(request, student_id)
        school_id = student.class_info.school_id
        if not StudentInvoice.objects.filter(
            id=receipt_id, school=school_id, student=student, isCashReceipt=False, is_active=True
        ).exists():
            raise not_found("That receipt was not found.")
        invoice = generateInvoiceDataById(receipt_id, student.id, school_id)
        lines = []
        for particular in invoice.get("particulars") or []:
            title, rate, paid, due, discount = (list(particular) + [0, 0, 0, 0, 0])[:5]
            lines.append({
                "title": str(title), "rate_paisa": paisa(rate), "paid_paisa": paisa(paid),
                "due_paisa": paisa(due), "discount_paisa": paisa(discount),
            })
        body = {
            "id": int(receipt_id),
            "receipt_no": invoice.get("invoice_id") or 0,
            "date": invoice.get("date") or "",
            "student_name": " ".join(str(invoice.get("student_name") or _name(student)).split()),
            "class_name": invoice.get("class") or _class_name(student),
            "mode": invoice.get("payment_mode") or "",
            "months": month_names(invoice.get("payment_month")),
            "lines": lines,
            "total_paid_paisa": paisa(invoice.get("total_paid")),
            "total_due_paisa": paisa(invoice.get("total_due")),
            "total_discount_paisa": paisa(invoice.get("total_discount")),
            "cashier": invoice.get("cashier") or None,
            "remarks": invoice.get("remarks") or None,
        }
        return Response(ReceiptOut(body).data)


class StudentHomeworkView(MobileAPIView):
    @extend_schema(
        parameters=[STUDENT_ID, OpenApiParameter("state", str, enum=["open", "past"]),
                    OpenApiParameter("cursor", str)],
        responses=HomeworkListOut,
    )
    def get(self, request, student_id):
        student = student_for(request, student_id)
        today = ndt_today()
        state = request.query_params.get("state") or "open"
        if state not in ("open", "past"):
            raise MobileError("invalid", "Choose open or past homework.", fields={"state": "open or past"})
        homework = _homework_for(student)
        if state == "open":
            rows, cursor = list(homework.filter(due_date__gte=today).order_by("due_date", "id")), None
        else:
            rows, cursor = page_by_id(homework.filter(due_date__lt=today), request)
        hand_ins = _latest_hand_ins(student, [hw.id for hw in rows])
        items = [homework_payload(request, hw, hand_ins.get(hw.id), today) for hw in rows]
        return Response(HomeworkListOut({"items": items, "next_cursor": cursor}).data)


class StudentHandInView(MobileAPIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @extend_schema(
        parameters=[STUDENT_ID, OpenApiParameter("homework_id", int, OpenApiParameter.PATH)],
        request={"multipart/form-data": HandInIn},
        responses={201: HomeworkOut},
    )
    @idempotent
    def post(self, request, student_id, homework_id):
        student = student_for(request, student_id)
        today = ndt_today()
        homework = _homework_for(student).filter(pk=homework_id).first()
        if homework is None:
            raise not_found("That homework was not found.")
        if str(homework.due_date) < today:
            raise MobileError(
                "too_late", "The due date has passed, so this homework can no longer be handed in.",
                status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        if HomeworkSubmission.objects.filter(homework=homework, student=student, is_active=True).exists():
            raise MobileError("already_handed_in", "This homework has already been handed in.", status.HTTP_409_CONFLICT)
        files = request.FILES.getlist("files")
        # The portal's own rules: allowed file types, at most ten files, and
        # not after the due date.
        submission = HomeworkSubmissionSerializer(data={"homework": homework.id, "student": student.id, "files": files})
        if not submission.is_valid():
            errors = submission.errors
            message = errors.get("files") or errors.get("non_field_errors") or ["The files could not be handed in."]
            raise MobileError("invalid", str(message[0]), fields={"files": str(message[0])})
        with transaction.atomic():
            saved = submission.save()
        saved = HomeworkSubmission.objects.prefetch_related("homeworksubmissionfile_set").get(pk=saved.pk)
        body = homework_payload(request, homework, saved, today)
        return Response(HomeworkOut(body).data, status=status.HTTP_201_CREATED)


def published_exams(student):
    """Exams of the student's class with published marks for this student."""
    return (
        Exam.objects.filter(
            school=student.class_info.school_id, is_active=True,
            classresult__class_info=student.class_info_id, classresult__is_active=True,
            classresult__published_date__isnull=False,
            classresult__studentresult__student=student, classresult__studentresult__is_active=True,
        )
        .distinct()
        .order_by("-id")
    )


def _exam_out(exam, student) -> dict:
    published = (
        ClassResult.objects.filter(exam=exam, class_info=student.class_info_id, is_active=True,
                                   published_date__isnull=False)
        .order_by("-published_date")
        .values_list("published_date", flat=True)
        .first()
    )
    return {"id": exam.id, "name": exam.name, "published_date": published or ""}


class StudentResultsView(MobileAPIView):
    @extend_schema(parameters=[STUDENT_ID], responses=ExamListOut)
    def get(self, request, student_id):
        student = student_for(request, student_id)
        items = [_exam_out(exam, student) for exam in published_exams(student)]
        return Response(ExamListOut({"items": items}).data)


def _text(value):
    if value is None or value == "":
        return None
    return str(value)


def _number(value: Decimal) -> str:
    """105, 52.5 or 200: no trailing zeros and no exponent."""
    text = format(value.normalize(), "f")
    return text if "." not in text else text.rstrip("0").rstrip(".")


class StudentExamResultView(MobileAPIView):
    @extend_schema(operation_id="students_exam_result",
                   parameters=[STUDENT_ID, OpenApiParameter("exam_id", int, OpenApiParameter.PATH)],
                   responses=ExamResultOut)
    def get(self, request, student_id, exam_id):
        student = student_for(request, student_id)
        exam = published_exams(student).filter(pk=exam_id).first()
        if exam is None:
            raise not_found("Results for this exam are not published yet.")
        school_id = student.class_info.school_id

        def sheet(result_type, v2):
            view = ResultView()
            view.v2 = v2
            view.school_id = school_id
            return view.getStudentResult(
                result_type, student.class_info_id, student.academic_year_id, exam.id, student.id,
                True, False, False, STUDENT_RUNNING,
            )

        marks = sheet("number", False)
        result = (marks or {}).get("result") or {}
        if not result:
            raise not_found("Results for this exam are not published yet.")
        try:
            letters = sheet("letter", True) or {}
        except Exception:  # a class without grading rules still has its marks
            letters = {}
        graded = {
            str(row.get("subject")): row
            for row in ((letters.get("result") or {}).get("marksObtained") or [])
        }
        subjects_data = marks.get("subjects_data") or {}
        subjects, total, full = [], Decimal(0), Decimal(0)
        passed_all = True
        for subject_id in marks.get("subjects") or []:
            mark = result.get(subject_id) or result.get(str(subject_id))
            info = subjects_data.get(subject_id) or subjects_data.get(str(subject_id)) or {}
            if not mark:
                continue
            criteria = info.get("criteria") or {}
            grade = graded.get(str(subject_id)) or {}
            passed = bool(mark.get("result")) and not mark.get("absent")
            passed_all = passed_all and passed
            try:
                total += Decimal(str(mark.get("total") or 0))
                full += Decimal(str(criteria.get("fm") or 0))
            except InvalidOperation:
                pass
            subjects.append({
                "subject": info.get("subject") or "",
                "full_marks": str(criteria.get("fm") or ""),
                "pass_marks": str(criteria.get("pm") or ""),
                "theory": _text(mark.get("theory")),
                "practical": _text(mark.get("practical")) if info.get("subject_pr") or criteria.get("fm_pr") else None,
                "total": _text(mark.get("total")),
                "grade": _text(grade.get("final_grade")),
                "grade_point": _text(round(Decimal(str(grade["gp"])), 2)) if grade.get("gp") not in (None, "") else None,
                "absent": bool(mark.get("absent")),
                "passed": passed,
            })
        summary = letters.get("result") or {}
        gpa = summary.get("gpa") or summary.get("GPA")
        body = {
            "exam": _exam_out(exam, student),
            "class_name": marks.get("classname") or _class_name(student),
            "subjects": subjects,
            "total": _number(total),
            "full_marks": _number(full),
            "percentage": str(round(total * 100 / full, 2)) if full else None,
            "gpa": _text(round(Decimal(str(gpa)), 2)) if gpa not in (None, "") else None,
            "passed": passed_all,
            "attendance": _int(marks.get("attendance")),
            "attendance_total": _int(marks.get("attendance_total")),
        }
        return Response(ExamResultOut(body).data)


class StudentTimetableView(MobileAPIView):
    @extend_schema(parameters=[STUDENT_ID], responses=TimetableOut)
    def get(self, request, student_id):
        student = student_for(request, student_id)
        periods = timetable_periods(class_timetable(student.class_info))
        return Response(TimetableOut({"class_name": _class_name(student), "periods": periods}).data)
