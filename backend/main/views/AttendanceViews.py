from django.db.models import Q, Case, When, Count, F, Value, CharField
from django.db.models.functions import Concat
from django.db import transaction
from django.utils import timezone

#
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema

#
from collections import defaultdict

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)
from ..methods.nepaliDatetime import ndt_today

#
from ..models.Attendance import ClassAttendance, StudentAttendance
from ..models.ClassInfo import ClassInfo
from ..models.Student import Student
from .BaseViews import SecuredAPIView, caller_student_id, is_student_request
from ..serializers.AttendanceSerializer import (
    ClassAttendanceSerializer,
    AttendanceParamsSerializer,
    AttendanceUpdateBodySerializer,
)
from ..methods.genClassname import getClassDetails
from ..methods.getDateRange import getDateRange
from ..methods.push import notify_attendance_marked


class ClassAttendanceView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )
    RETURN_FIELDS = (
        "id",
        "student",
        "name",
        "status",
        "reason",
    )
    include_docs = True

    @swagger_auto_schema(
        tags=["student attendance"],
        query_serializer=AttendanceParamsSerializer,
    )
    def get(self, request):
        school_id = request.query_params.get("school")
        if school_id:
            class_info_id = request.query_params.get("class_info")
            date = request.query_params.get("date") or ndt_today()
            overall = request.query_params.get("overall")
            date_from = request.query_params.get("from")
            date_to = request.query_params.get("to")
            q = Q(school=school_id, is_active=True)
            if class_info_id and not isinstance(class_info_id, dict):
                q &= Q(class_info=class_info_id)
            if date_from and date_to:
                date_range = getDateRange(date_from, date_to)
                q &= Q(date__range=date_range)
            else:
                q &= Q(date=date)
            if class_info_id:
                summary = request.query_params.get("summary") or False
                teacher = request.query_params.get("teacher")
                if summary:
                    return self.summarizedData(school_id, class_info_id, teacher, date)
                #
                student_id = request.query_params.get("student")
                include_contact = request.query_params.get("include_contact") or False
                if is_student_request(request):
                    # a student's own mark -- leaving `student` out returned
                    # the whole class, with guardian phones on include_contact
                    student_id = caller_student_id(request)
                    include_contact = False
                if teacher:
                    q &= Q(teacher=teacher)
                #
                class_attendance = (
                    ClassAttendance.objects.filter(q).values("id", "date").first()
                )
                if class_attendance:
                    class_attendance_id = class_attendance.get("id")
                    q2 = Q(class_attendance=class_attendance_id)
                    if student_id:
                        q2 &= Q(student=student_id)
                    attendances = StudentAttendance.objects.filter(q2).annotate(
                        name=Concat(
                            "student__first_name",
                            Value(" "),
                            "student__middle_name",
                            Value(" "),
                            "student__last_name",
                            output_field=CharField(),
                        )
                    )
                    if include_contact:
                        attendances = attendances.annotate(
                            contact=F("student__guardian_info__guardian_contact")
                        )
                        self.RETURN_FIELDS += ("contact",)
                    attendances = attendances.order_by("name").values(
                        *self.RETURN_FIELDS
                    )
                    #
                    total_present, total_absent, total = 0, 0, 0
                    for e in attendances:
                        status = e.get("status")
                        if status == True:
                            total_present += 1
                        elif status == False:
                            total_absent += 1
                        total += 1
                    #
                    if attendances:
                        return Response(
                            {
                                "class_attendance": class_attendance_id,
                                "date": class_attendance.get("date"),
                                "attendances": attendances,
                                "present": total_present,
                                "absent": total_absent,
                                "total": total,
                            }
                        )
            elif overall:
                return self.overallReport(q)
        return self.RESPONSE__INVALID_REQUEST

    def summarizedData(self, school_id, class_info_id, teacher_id, date):
        q = Q(
            class_attendance__school=school_id,
            class_attendance__class_info=class_info_id,
        )
        if teacher_id:
            q &= Q(class_attendance__teacher=teacher_id)
        if date:
            q &= Q(class_attendance__date=date)
        summarized_data = (
            StudentAttendance.objects.filter(q)
            .annotate(date=F("class_attendance__date"))
            .values("date")
            .order_by("date")
            .annotate(
                total=Count("id"),
                total_present=Count(Case(When(status=True, then=1))),
                total_absent=Count(Case(When(status=False, then=1))),
            )
            .order_by("date")
        )
        return Response(summarized_data)

    def overallReport(self, q):
        attendances = (
            ClassAttendance.objects.filter(q)
            .order_by("-id")
            .annotate(
                present=Count(
                    "studentattendance__pk",
                    filter=Q(
                        studentattendance__status=True,
                        studentattendance__is_active=True,
                    ),
                ),
                absent=Count(
                    "studentattendance__pk",
                    filter=Q(
                        studentattendance__status=False,
                        studentattendance__is_active=True,
                    ),
                ),
            )
            .values("class_info", "date", "present", "absent")
        )
        #
        class_ids = {}
        non_duplicated_attendances = defaultdict(
            lambda: {"class_info": None, "present": 0, "absent": 0}
        )
        uniques = set()
        for attd in attendances:
            class_info_id = attd.get("class_info")
            attd_date = attd.pop("date")
            present = attd.get("present") or 0
            absent = attd.get("absent") or 0
            identifier = (class_info_id, attd_date)
            if identifier not in uniques:
                key = class_ids.get(class_info_id)
                if key:
                    non_duplicated_attendances[key]["present"] += present
                    non_duplicated_attendances[key]["absent"] += absent
                    uniques.add(identifier)
                else:
                    class_ids[class_info_id] = identifier
                    non_duplicated_attendances[identifier]["class_info"] = class_info_id
                    non_duplicated_attendances[identifier]["present"] = present
                    non_duplicated_attendances[identifier]["absent"] = absent
        non_duplicated_attendances = non_duplicated_attendances.values()
        class_ids = class_ids.keys()
        classes = {e.id: e for e in ClassInfo.objects.filter(id__in=class_ids)}
        attendances = [
            {
                "classname": getClassDetails(
                    None, False, True, False, classes.get(attd.pop("class_info"))
                )[0],
                **attd,
            }
            for attd in non_duplicated_attendances
        ]
        return Response(attendances)

    @swagger_auto_schema(
        tags=["student attendance"],
        request_body=ClassAttendanceSerializer,
    )
    def post(self, request):
        user_role = getattr(request, "user_role")
        s = ClassAttendanceSerializer(
            data=request.data, context={"user_role": user_role}
        )
        if s.is_valid():
            _, created = s.save()
            if created:
                # Real-time present/absent push for this manual marking event.
                # Only on first save of the day (created) so no one is re-notified
                # when the same class is re-posted; corrections go through PUT.
                self._notify_attendance(request.data)
                return Response({"message": "Attendance saved!"})
            else:
                return Response({"message": "Record already exists!"})
        return self.RESPONSE__INVALID_REQUEST

    @staticmethod
    def _notify_attendance(data):
        """Split the just-saved class roll into present/absent ids and push."""
        school_id = data.get("school")
        present_ids, absent_ids = [], []
        for attd in data.get("attendances") or []:
            student_id = attd.get("student")
            if not student_id:
                continue
            # status arrives as a bool or a truthy string from the client.
            if attd.get("status") in (True, "true", "True", 1, "1"):
                present_ids.append(student_id)
            else:
                absent_ids.append(student_id)
        notify_attendance_marked(school_id, present_ids, absent_ids)

    # The columns a correction may set. Rows used to be built with
    # `StudentAttendance(**attd)` for every key the client sent, so a payload
    # could re-point a new row at another school's roll call
    # (`class_attendance_id`) or student (`student_id`). The roll call and the
    # student are now always the server-resolved ones. An update saves exactly
    # the columns its bulk_update always saved.
    ATTENDANCE_CREATE_FIELDS = (
        "status",
        "reason",
        "checked_in_at",
        "checked_out_at",
        "is_active",
    )
    ATTENDANCE_EDITABLE_FIELDS = ("status", "reason")

    @swagger_auto_schema(
        tags=["student attendance"],
        request_body=AttendanceUpdateBodySerializer,
    )
    def put(self, request):
        class_info_id = request.data.pop("class_info", None)
        class_attendance_id = request.data.pop("class_attendance", None)
        attendances = request.data.pop("attendances", None)
        if class_info_id and class_attendance_id and isinstance(attendances, list):
            # The roll call being corrected must belong to one of the caller's
            # own schools — the id is the client's to choose, and the old
            # `ClassAttendance.objects.get(id=...)` let any school edit any
            # other school's attendance.
            class_attendance = self.scope_to_caller(
                ClassAttendance.objects.filter(id=class_attendance_id), request
            ).first()
            if not class_attendance:
                return self.RESPONSE__NOT_FOUND
            students = {
                std.id: std
                for std in Student.objects.filter(
                    class_info=class_info_id,
                    class_info__school=class_attendance.school_id,
                )
            }
            for_create, for_update, updates = [], [], {}
            for attd in attendances:
                if not isinstance(attd, dict):
                    return self.RESPONSE__INVALID_REQUEST
                student = students.get(attd.get("student"))
                if not student:
                    continue
                attd_id = attd.get("id")
                fields = (
                    self.ATTENDANCE_EDITABLE_FIELDS
                    if attd_id
                    else self.ATTENDANCE_CREATE_FIELDS
                )
                clean = {k: attd[k] for k in fields if k in attd}
                clean["student"] = student
                if not attd_id:
                    for_create.append(clean)
                else:
                    for_update.append(clean)
                    updates[attd_id] = clean
            with transaction.atomic():
                if len(for_create) > 0:
                    # creates;
                    for_create = (
                        StudentAttendance(class_attendance=class_attendance, **attd)
                        for attd in for_create
                    )
                    StudentAttendance.objects.bulk_create(for_create)
                if len(for_update) > 0:
                    # updates;
                    updated_at = timezone.now()
                    update_ids = updates.keys()
                    instances = StudentAttendance.objects.filter(
                        id__in=update_ids, class_attendance=class_attendance
                    ).select_for_update()
                    for instance in instances:
                        ins_id = instance.id
                        update = updates.get(ins_id) or {}
                        for field in self.ATTENDANCE_EDITABLE_FIELDS:
                            if field in update:
                                setattr(instance, field, update[field])
                        setattr(instance, "updated_at", updated_at)
                    StudentAttendance.objects.bulk_update(
                        instances, ("status", "reason", "updated_at")
                    )
                return Response({"message": "Attendance Updated!"})
        return self.RESPONSE__INVALID_REQUEST
