"""Teachers' and staff screens (mobile/SPEC.md §5, phase 4).

Attendance goes through the portal's own paths: a new day is saved by the
portal's ClassAttendanceSerializer, so the absent-student SMS and the push to
parents fire exactly as they do from the web; a correction changes only the
mark and the reason, as the portal's PUT does. The permission ids are the
portal's: 1501 to take a day, 1502 to change one, 1503/1504 to look.
"""
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from account.auth.UserRole import UserRoles
from main.methods.genClassname import getClassDetails
from main.methods.nepaliDatetime import ndt_today
from main.methods.push import notify_class_students
from main.models.Attendance import ClassAttendance, StaffAttendance, StudentAttendance
from main.models.ClassInfo import ClassInfo
from main.models.ClassPeriod import ClassPeriod
from main.models.Homework import Homework, HomeworkSubmission
from main.models.Student import Student
from main.models.Subject import Subject
from main.serializers.AttendanceSerializer import ClassAttendanceSerializer
from main.serializers.HomeworkSerializer import HomeworkSerializer
from main.views.AttendanceViews import ClassAttendanceView

from ..access import (
    ANY_ATTENDANCE, CHANGE_ATTENDANCE, TAKE_ATTENDANCE, bs_date, bs_month, check_file_sizes, not_found, page_by_id,
    require_permission, staff_of, staff_permissions,
)
from ..auth import STUDENT_RUNNING
from ..errors import MobileError
from ..idempotency import idempotent
from ..profiles import _media, _name
from .base import MobileAPIView
from .students import (
    HAND_IN_STATES, AttendanceMonthOut, DayMarkOut, FileOut, _files, day_marks,
    hand_in_payload, timetable_periods,
)

REASON_MAX = 50


# --- responses ----------------------------------------------------------------
class SubjectOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class StaffClassOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    students = serializers.IntegerField()
    in_timetable = serializers.BooleanField(help_text="The staff member teaches a period of it")
    periods = serializers.ListField(child=serializers.IntegerField())
    subjects = SubjectOut(many=True)
    attendance_taken = serializers.BooleanField(help_text="Today's attendance is saved")


class StaffClassesOut(serializers.Serializer):
    items = StaffClassOut(many=True)
    can_take_attendance = serializers.BooleanField()
    can_change_attendance = serializers.BooleanField()
    can_see_attendance = serializers.BooleanField()


class TodayPeriodOut(serializers.Serializer):
    period = serializers.IntegerField()
    class_id = serializers.IntegerField()
    class_name = serializers.CharField()
    subject = serializers.CharField(allow_null=True)


class ToTakeOut(serializers.Serializer):
    class_id = serializers.IntegerField()
    class_name = serializers.CharField()
    taken = serializers.BooleanField()


class StaffTodayOut(serializers.Serializer):
    date = serializers.CharField()
    check_in = DayMarkOut()
    periods = TodayPeriodOut(many=True)
    attendance = ToTakeOut(many=True)
    hand_ins_to_check = serializers.IntegerField()


class RosterRowOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    roll_no = serializers.CharField(allow_null=True)
    photo_url = serializers.CharField(allow_null=True)
    status = serializers.ChoiceField(choices=["present", "absent"], allow_null=True)
    reason = serializers.CharField(allow_blank=True)
    checked_in_at = serializers.DateTimeField(allow_null=True)


class RosterTotalsOut(serializers.Serializer):
    present = serializers.IntegerField()
    absent = serializers.IntegerField()
    unmarked = serializers.IntegerField()


class ClassDayOut(serializers.Serializer):
    class_id = serializers.IntegerField()
    class_name = serializers.CharField()
    date = serializers.CharField()
    taken = serializers.BooleanField()
    can_save = serializers.BooleanField(help_text="This staff member may save this day now")
    students = RosterRowOut(many=True)
    totals = RosterTotalsOut()


class MarkIn(serializers.Serializer):
    student = serializers.IntegerField()
    present = serializers.BooleanField()
    reason = serializers.CharField(required=False, allow_blank=True, default="", max_length=REASON_MAX)


class ClassDayIn(serializers.Serializer):
    marks = MarkIn(many=True, allow_empty=False, max_length=500)


class HandInCountsOut(serializers.Serializer):
    received = serializers.IntegerField()
    checked = serializers.IntegerField()


class StaffHomeworkOut(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    description = serializers.CharField()
    subject = serializers.CharField()
    class_id = serializers.IntegerField()
    class_name = serializers.CharField()
    due_date = serializers.CharField()
    open = serializers.BooleanField()
    files = FileOut(many=True)
    hand_ins = HandInCountsOut()
    students = serializers.IntegerField()


class StaffHomeworkListOut(serializers.Serializer):
    items = StaffHomeworkOut(many=True)
    next_cursor = serializers.CharField(allow_null=True)


class HomeworkIn(serializers.Serializer):
    class_id = serializers.IntegerField()
    subject_id = serializers.IntegerField()
    title = serializers.CharField(min_length=5, max_length=200)
    description = serializers.CharField(max_length=5000)
    due_date = serializers.CharField()
    files = serializers.ListField(child=serializers.FileField(), required=False, max_length=10)


class StaffHandInOut(serializers.Serializer):
    id = serializers.IntegerField()
    student_id = serializers.IntegerField()
    student_name = serializers.CharField()
    roll_no = serializers.CharField(allow_null=True)
    photo_url = serializers.CharField(allow_null=True)
    submitted_date = serializers.CharField()
    status = serializers.ChoiceField(choices=sorted(HAND_IN_STATES.values()))
    remarks = serializers.CharField(allow_null=True)
    files = FileOut(many=True)


class MissingOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    roll_no = serializers.CharField(allow_null=True)


class HandInsOut(serializers.Serializer):
    homework = StaffHomeworkOut()
    items = StaffHandInOut(many=True)
    missing = MissingOut(many=True)


class HandInPatchIn(serializers.Serializer):
    status = serializers.ChoiceField(choices=sorted(HAND_IN_STATES.values()))
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=500)


CLASS_ID = OpenApiParameter("class_id", int, OpenApiParameter.PATH)
DATE = OpenApiParameter("date", str, description="BS YYYY-MM-DD; today when left out")


# --- shared pieces ------------------------------------------------------------------
def class_name(class_info) -> str:
    try:
        return getClassDetails(None, cls=class_info)[0] or ""
    except Exception:
        return ""


def school_classes(school_id):
    """Classes with at least one enrolled student, in the portal's class order."""
    return (
        ClassInfo.objects.filter(school=school_id, is_active=True, student__is_active=True,
                                 student__status=STUDENT_RUNNING)
        .select_related("section", "course")
        .annotate(enrolled=Count("student", filter=Q(student__is_active=True, student__status=STUDENT_RUNNING)))
        .order_by("education_level", "grade", "faculty", "course", "year", "semester", "section", "id")
    )


def current_timetables(classes) -> dict:
    """{class id: its ClassPeriod}, by the rule of students.class_timetable."""
    by_id = {c.id: c for c in classes}
    found = {}
    for period in ClassPeriod.objects.filter(class_info__in=by_id, is_active=True).order_by("-id"):
        klass = by_id[period.class_info_id]
        if period.class_info_id in found:
            continue
        if period.academic_year_id in (None, klass.academic_year_id) or not klass.academic_year_id:
            found[period.class_info_id] = period
    return found


def teaching(staff, classes, timetables) -> dict:
    """{class id: [(period, subject name)]} for the periods the staff member teaches."""
    mine = {}
    for class_id, period in timetables.items():
        rows = [p for p in timetable_periods(period) if p["teacher_id"] == staff.id]
        if rows:
            mine[class_id] = [(p["period"], p["subject"]) for p in rows]
    return mine


def roster(class_info):
    students = list(
        Student.objects.filter(class_info=class_info, is_active=True, status=STUDENT_RUNNING)
        .only("id", "first_name", "middle_name", "last_name", "roll_no", "image")
    )

    def order(s):
        roll = (s.roll_no or "").strip()
        return (0, int(roll), "") if roll.isdigit() else (1, 0, _name(s).lower())

    return sorted(students, key=order)


def day_of(class_info, date):
    """The class's roll call for a day, as the portal finds it (newest first)."""
    return (
        ClassAttendance.objects.filter(school=class_info.school_id, class_info=class_info, date=date, is_active=True)
        .order_by("-id")
        .first()
    )


def class_for(staff, class_id) -> ClassInfo:
    klass = school_classes(staff.school_id).filter(pk=class_id).first()
    if klass is None:
        raise not_found("That class was not found.")
    return klass


def class_day_payload(request, staff, klass, date) -> dict:
    perms = staff_permissions(staff)
    day = day_of(klass, date)
    rows = {}
    if day is not None:
        for row in StudentAttendance.objects.filter(class_attendance=day, is_active=True).order_by("id"):
            rows[row.student_id] = row  # the newest row per student wins
    students, present, absent = [], 0, 0
    for student in roster(klass):
        row = rows.get(student.id)
        mark = None if row is None else ("present" if row.status else "absent")
        present += mark == "present"
        absent += mark == "absent"
        students.append({
            "id": student.id,
            "name": _name(student),
            "roll_no": student.roll_no or None,
            "photo_url": _media(request, student.image),
            "status": mark,
            "reason": (row.reason or "") if row else "",
            "checked_in_at": row.checked_in_at if row else None,
        })
    return {
        "class_id": klass.id,
        "class_name": class_name(klass),
        "date": date,
        "taken": day is not None,
        "can_save": (CHANGE_ATTENDANCE in perms) if day is not None else (TAKE_ATTENDANCE in perms),
        "students": students,
        "totals": {"present": present, "absent": absent, "unmarked": len(students) - present - absent},
    }


def staff_homework_payload(request, homework, counts, enrolled, today) -> dict:
    return {
        "id": homework.id,
        "title": homework.title,
        "description": homework.description or "",
        "subject": homework.subject.subject if homework.subject_id else "",
        "class_id": homework.class_info_id,
        "class_name": class_name(homework.class_info),
        "due_date": homework.due_date,
        "open": str(homework.due_date) >= today,
        "files": _files(request, homework.homeworkfile_set.all()),
        "hand_ins": {"received": counts.get(1, 0), "checked": counts.get(2, 0)},
        "students": enrolled,
    }


def _hand_in_counts(homework_ids) -> dict:
    counts = {}
    for row in (
        HomeworkSubmission.objects.filter(homework_id__in=homework_ids, is_active=True)
        .values("homework_id", "status")
        .annotate(n=Count("student", distinct=True))
    ):
        counts.setdefault(row["homework_id"], {})[row["status"]] = row["n"]
    return counts


def _enrolled(class_ids) -> dict:
    return dict(
        Student.objects.filter(class_info__in=class_ids, is_active=True, status=STUDENT_RUNNING)
        .values("class_info")
        .annotate(n=Count("id"))
        .values_list("class_info", "n")
    )


def _own_homework(staff):
    return (
        Homework.objects.filter(staff=staff, school=staff.school_id, is_active=True)
        .select_related("subject", "class_info__section", "class_info__course")
        .prefetch_related("homeworkfile_set")
    )


def _fields_error(errors) -> dict:
    out = {}
    for key, value in errors.items():
        out[key] = str(value[0] if isinstance(value, list) and value else value)
    return out


# --- views --------------------------------------------------------------------
class StaffTodayView(MobileAPIView):
    @extend_schema(responses=StaffTodayOut)
    def get(self, request):
        staff = staff_of(request)
        today = ndt_today()
        classes = list(school_classes(staff.school_id))
        by_id = {c.id: c for c in classes}
        mine = teaching(staff, classes, current_timetables(classes))
        own = (
            StaffAttendance.objects.filter(staff=staff, date=today, is_active=True)
            .order_by("id")
            .values("date", "status", "checked_in_at", "checked_out_at")
        )
        check_in = day_marks(own).get(today) or {
            "date": today, "status": "not_taken", "checked_in_at": None, "checked_out_at": None,
        }
        periods = sorted(
            (
                {"period": n, "class_id": cid, "class_name": class_name(by_id[cid]), "subject": subject}
                for cid, rows in mine.items()
                for n, subject in rows
            ),
            key=lambda p: (p["period"], p["class_name"]),
        )
        taken = set(
            ClassAttendance.objects.filter(school=staff.school_id, date=today, is_active=True,
                                           class_info__in=list(mine)).values_list("class_info", flat=True)
        )
        to_take = [
            {"class_id": cid, "class_name": class_name(by_id[cid]), "taken": cid in taken}
            for cid in mine
        ] if staff_permissions(staff) & set(ANY_ATTENDANCE) else []
        waiting = HomeworkSubmission.objects.filter(
            homework__staff=staff, homework__is_active=True, is_active=True, status=1
        ).count()
        body = {"date": today, "check_in": check_in, "periods": periods, "attendance": to_take,
                "hand_ins_to_check": waiting}
        return Response(StaffTodayOut(body).data)


class StaffClassesView(MobileAPIView):
    @extend_schema(responses=StaffClassesOut)
    def get(self, request):
        staff = staff_of(request)
        perms = staff_permissions(staff)
        classes = list(school_classes(staff.school_id))
        mine = teaching(staff, classes, current_timetables(classes))
        # Staff who may take or see attendance can open any class, as in the
        # portal; everyone else sees the classes they teach.
        if not perms & set(ANY_ATTENDANCE):
            classes = [c for c in classes if c.id in mine]
        subjects = {}
        for subject in Subject.objects.filter(class_info__in=classes, is_active=True).order_by("order", "id"):
            subjects.setdefault(subject.class_info_id, []).append({"id": subject.id, "name": subject.subject})
        taken = set(
            ClassAttendance.objects.filter(school=staff.school_id, date=ndt_today(), is_active=True)
            .values_list("class_info", flat=True)
        )
        items = [
            {
                "id": c.id,
                "name": class_name(c),
                "students": c.enrolled,
                "in_timetable": c.id in mine,
                "periods": sorted(n for n, _ in mine.get(c.id, [])),
                "subjects": subjects.get(c.id, []),
                "attendance_taken": c.id in taken,
            }
            for c in classes
        ]
        items.sort(key=lambda item: not item["in_timetable"])  # their own classes first
        body = {
            "items": items,
            "can_take_attendance": TAKE_ATTENDANCE in perms,
            "can_change_attendance": CHANGE_ATTENDANCE in perms,
            "can_see_attendance": bool(perms & set(ANY_ATTENDANCE)),
        }
        return Response(StaffClassesOut(body).data)


class ClassAttendanceDayView(MobileAPIView):
    @extend_schema(parameters=[CLASS_ID, DATE], responses=ClassDayOut)
    def get(self, request, class_id):
        staff = staff_of(request)
        require_permission(staff, *ANY_ATTENDANCE)
        klass = class_for(staff, class_id)
        date = bs_date(request.query_params.get("date"))
        return Response(ClassDayOut(class_day_payload(request, staff, klass, date)).data)

    @extend_schema(parameters=[CLASS_ID, DATE], request=ClassDayIn, responses=ClassDayOut)
    @idempotent
    def put(self, request, class_id):
        staff = staff_of(request)
        require_permission(staff, TAKE_ATTENDANCE, CHANGE_ATTENDANCE)
        klass = class_for(staff, class_id)
        date = bs_date(request.query_params.get("date"))
        if date > ndt_today():
            raise MobileError("future_date", "Attendance can't be saved for a day that hasn't come yet.",
                              status.HTTP_422_UNPROCESSABLE_ENTITY)
        given = ClassDayIn(data=request.data)
        if not given.is_valid():
            raise MobileError("invalid", "Check the marks.", fields=_fields_error(given.errors))
        enrolled = {s.id for s in roster(klass)}
        marks = {}
        for mark in given.validated_data["marks"]:
            if mark["student"] not in enrolled:
                raise MobileError("invalid", "A student in the list is not in this class.",
                                  fields={"marks": f"Student {mark['student']} is not in this class."})
            marks[mark["student"]] = mark  # the last mark for a student counts
        perms = staff_permissions(staff)
        if day_of(klass, date) is None:
            if TAKE_ATTENDANCE not in perms:
                raise MobileError("forbidden", "You can change attendance, but not take a new day.",
                                  status.HTTP_403_FORBIDDEN)
            data = {
                "school": klass.school_id,
                "class_info": klass.id,
                "teacher": staff.id,
                "date": date,
                "attendances": [
                    {"student": sid, "status": m["present"], "reason": m["reason"][:REASON_MAX]}
                    for sid, m in marks.items()
                ],
            }
            saved = ClassAttendanceSerializer(data=data, context={"user_role": UserRoles.ROLE_STAFF})
            if not saved.is_valid():
                raise MobileError("invalid", "The attendance could not be saved.", fields=_fields_error(saved.errors))
            _, created = saved.save()
            if created:
                # The portal's push for a freshly taken day (ClassAttendanceView.post).
                ClassAttendanceView._notify_attendance(data)
                return Response(ClassDayOut(class_day_payload(request, staff, klass, date)).data)
            # Someone else saved this day a moment ago: carry on as a change.
        if CHANGE_ATTENDANCE not in perms:
            raise MobileError("already_taken", "This day's attendance was already saved.", status.HTTP_409_CONFLICT)
        day = day_of(klass, date)
        with transaction.atomic():
            rows = {}
            for row in StudentAttendance.objects.filter(class_attendance=day, is_active=True).select_for_update().order_by("id"):
                rows[row.student_id] = row
            now = timezone.now()
            changed, added = [], []
            for sid, mark in marks.items():
                row = rows.get(sid)
                if row is None:
                    added.append(StudentAttendance(class_attendance=day, student_id=sid, status=mark["present"],
                                                   reason=mark["reason"][:REASON_MAX]))
                elif row.status != mark["present"] or (row.reason or "") != mark["reason"]:
                    row.status, row.reason, row.updated_at = mark["present"], mark["reason"][:REASON_MAX], now
                    changed.append(row)
            if added:
                StudentAttendance.objects.bulk_create(added)
            if changed:
                StudentAttendance.objects.bulk_update(changed, ("status", "reason", "updated_at"))
        return Response(ClassDayOut(class_day_payload(request, staff, klass, date)).data)


class StaffHomeworkView(MobileAPIView):
    parser_classes = (MultiPartParser, FormParser, JSONParser)

    @extend_schema(parameters=[OpenApiParameter("cursor", str)], responses=StaffHomeworkListOut)
    def get(self, request):
        staff = staff_of(request)
        today = ndt_today()
        rows, cursor = page_by_id(_own_homework(staff), request)
        counts = _hand_in_counts([hw.id for hw in rows])
        enrolled = _enrolled({hw.class_info_id for hw in rows})
        items = [
            staff_homework_payload(request, hw, counts.get(hw.id, {}), enrolled.get(hw.class_info_id, 0), today)
            for hw in rows
        ]
        return Response(StaffHomeworkListOut({"items": items, "next_cursor": cursor}).data)

    @extend_schema(request={"multipart/form-data": HomeworkIn}, responses={201: StaffHomeworkOut})
    @idempotent
    def post(self, request):
        staff = staff_of(request)
        today = ndt_today()
        data = {key: request.data.get(key) for key in ("class_id", "subject_id", "title", "description", "due_date")}
        data["files"] = request.FILES.getlist("files")
        check_file_sizes(data["files"])
        given = HomeworkIn(data=data)
        if not given.is_valid():
            raise MobileError("invalid", "Check the highlighted fields.", fields=_fields_error(given.errors))
        values = given.validated_data
        klass = class_for(staff, values["class_id"])
        subject = Subject.objects.filter(pk=values["subject_id"], class_info=klass, is_active=True).first()
        if subject is None:
            raise MobileError("invalid", "Choose a subject of this class.", fields={"subject_id": "Not this class's."})
        due = bs_date(values["due_date"], "due_date", default_today=False)
        if due < today:
            raise MobileError("invalid", "The due date has already passed.", fields={"due_date": "In the past."})
        saved = HomeworkSerializer(data={
            "title": values["title"], "description": values["description"], "due_date": due,
            "class_info": klass.id, "subject": subject.id, "staff": staff.id, "school": staff.school_id,
            "files": values.get("files") or [],
        })
        if not saved.is_valid():
            raise MobileError("invalid", "The homework could not be saved.", fields=_fields_error(saved.errors))
        homework = saved.save()
        # The portal's push to the class (HomeworkView.post).
        notify_class_students(homework.school_id, homework.class_info_id, homework.title, homework.description)
        homework = _own_homework(staff).get(pk=homework.pk)
        body = staff_homework_payload(request, homework, {}, _enrolled([klass.id]).get(klass.id, 0), today)
        return Response(StaffHomeworkOut(body).data, status=status.HTTP_201_CREATED)


def _own_homework_or_404(staff, homework_id):
    homework = _own_homework(staff).filter(pk=homework_id).first()
    if homework is None:
        raise not_found("That homework was not found.")
    return homework


def staff_hand_in_payload(request, submission) -> dict:
    student = submission.student
    return {
        **hand_in_payload(request, submission),
        "student_id": student.id,
        "student_name": _name(student),
        "roll_no": student.roll_no or None,
        "photo_url": _media(request, student.image),
    }


class HandInsView(MobileAPIView):
    @extend_schema(parameters=[OpenApiParameter("homework_id", int, OpenApiParameter.PATH)], responses=HandInsOut)
    def get(self, request, homework_id):
        staff = staff_of(request)
        homework = _own_homework_or_404(staff, homework_id)
        latest = {}
        for sub in (
            HomeworkSubmission.objects.filter(homework=homework, is_active=True)
            .select_related("student").prefetch_related("homeworksubmissionfile_set").order_by("id")
        ):
            latest[sub.student_id] = sub
        enrolled = roster(homework.class_info)
        items = sorted(
            (staff_hand_in_payload(request, sub) for sub in latest.values()),
            key=lambda item: (item["status"] != "received", item["submitted_date"], item["student_name"]),
        )
        missing = [
            {"id": s.id, "name": _name(s), "roll_no": s.roll_no or None} for s in enrolled if s.id not in latest
        ]
        counts = _hand_in_counts([homework.id]).get(homework.id, {})
        body = {
            "homework": staff_homework_payload(request, homework, counts, len(enrolled), ndt_today()),
            "items": items,
            "missing": missing,
        }
        return Response(HandInsOut(body).data)


class HandInDetailView(MobileAPIView):
    @extend_schema(
        parameters=[OpenApiParameter("homework_id", int, OpenApiParameter.PATH),
                    OpenApiParameter("hand_in_id", int, OpenApiParameter.PATH)],
        request=HandInPatchIn, responses=StaffHandInOut,
    )
    @idempotent
    def patch(self, request, homework_id, hand_in_id):
        staff = staff_of(request)
        homework = _own_homework_or_404(staff, homework_id)
        given = HandInPatchIn(data=request.data)
        if not given.is_valid():
            raise MobileError("invalid", "Check the highlighted fields.", fields=_fields_error(given.errors))
        state = {name: code for code, name in HAND_IN_STATES.items()}[given.validated_data["status"]]
        update = {"status": state}
        if "remarks" in given.validated_data:
            update["remarks"] = given.validated_data["remarks"] or None
        if not HomeworkSubmission.objects.filter(pk=hand_in_id, homework=homework, is_active=True).update(**update):
            raise not_found("That hand-in was not found.")
        submission = (
            HomeworkSubmission.objects.select_related("student").prefetch_related("homeworksubmissionfile_set")
            .get(pk=hand_in_id)
        )
        return Response(StaffHandInOut(staff_hand_in_payload(request, submission)).data)


class StaffOwnAttendanceView(MobileAPIView):
    @extend_schema(parameters=[OpenApiParameter("month", str, description="BS YYYY-MM")],
                   responses=AttendanceMonthOut)
    def get(self, request):
        staff = staff_of(request)
        month = bs_month(request.query_params.get("month"))
        rows = (
            StaffAttendance.objects.filter(staff=staff, is_active=True, date__range=(month["start"], month["end"]))
            .order_by("date", "id")
            .values("date", "status", "checked_in_at", "checked_out_at")
        )
        days = day_marks(rows)
        present = sum(1 for d in days.values() if d["status"] == "present")
        body = {
            "month": month,
            "days": sorted(days.values(), key=lambda d: d["date"]),
            "totals": {"present": present, "absent": len(days) - present, "taken": len(days)},
        }
        return Response(AttendanceMonthOut(body).data)
