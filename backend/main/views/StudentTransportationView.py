from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)
from ..models.Student import Student, StudentTransportationInfo
from ..models.BusStation import BusStation
from ..serializers.StudentSerializer import StudentTransportationInfoSerializer
from .BaseViews import SecuredAPIView


from django.db.models import Q
from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

"""
-/api/students/transportations
"""


class StudentTransportationView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )

    def get(self, request):
        student_id = request.query_params.get("student")
        school_id = request.query_params.get("school")
        as_title = request.query_params.get("as_title")
        if student_id and school_id:
            query = Q(student__id=student_id, school__id=school_id)
            is_active = True if request.query_params.get("active") else False
            if is_active:
                query &= Q(is_active=is_active)
            #
            RETURN_VALUES = ("id",)
            if as_title:
                RETURN_VALUES += ("bus_station__fee",)
            else:
                RETURN_VALUES += ("bus_station", "start_date", "is_active")
            data = (
                StudentTransportationInfo.objects.filter(query)
                .values(*RETURN_VALUES)
                .order_by("-id")
            )
            return Response(data)
        return self.RESPONSE__INVALID_REQUEST

    def post(self, request):
        strict = request.data.pop("strict", False)
        student_id = request.data.get("student")
        school_id = request.data.get("school")
        if not student_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        # A service is a place on a route. Enrolling with the station left empty
        # used to pass validation (the column is nullable), stop the student's
        # running service, save a service to nowhere and only then fail with a
        # 500 on the missing station: the student was left with no billable
        # transport and the screen with an error. Refused before anything moves.
        if not request.data.get("bus_station"):
            return Response(
                {"message": "Choose a bus station first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        s = StudentTransportationInfoSerializer(data=request.data)
        if s.is_valid() and self.deleteActive(strict, student_id, school_id):
            ins = s.save()
            return Response(
                {
                    "message": "Transportation service started!",
                    "service": {
                        "id": ins.id,
                        "bus_station": ins.bus_station_id,
                        "station": ins.bus_station.station,
                        "start_date": ins.start_date,
                        "is_active": "yes" if ins.is_active else "no",
                    },
                }
            )
        return self.RESPONSE__INVALID_REQUEST

    def put(self, request):
        if "data" in request.data:
            school_id = request.data.pop("school", None)
            data = request.data.pop("data", None)
            updates = request.data.pop("updates", None)
            if school_id and data:
                res = self.handleBulkUpdate(school_id, data, updates)
                if res:
                    return Response({"message": "Students updated!"})
        # ----
        id = request.data.pop("id", None)
        student_id = request.data.pop("student", None)
        school_id = request.data.pop("school", None)
        if id and student_id and school_id:
            stdTspService = StudentTransportationInfo.objects.get(
                id=id, student=student_id, school=school_id
            )
            if stdTspService:
                s = StudentTransportationInfoSerializer(
                    stdTspService, data=request.data, partial=True
                )
                if s.is_valid():
                    s.save()
                    return Response({"message": "Student transportation updated!"})
        return self.RESPONSE__INVALID_REQUEST

    def validTransportationData(self, school_id, data, updates):
        creating = []
        updating = []
        for student_id, info in data.items():
            student_id = int(student_id)
            studentTransportationData = {"student": student_id, "school": school_id}
            if student_id in updates:
                updating.append({**studentTransportationData, "is_active": False})
            creating.append(
                {
                    **studentTransportationData,
                    **(info.get("transportation_info") or {}),
                }
            )
        return [creating, updating]

    @staticmethod
    def namesOnlyOwnRecords(school_id, data, updates):
        """
        Every student (and bus station) a bulk update names is this school's.

        The students arrive as the KEYS of `data` and in `updates`, where the
        school-scope check never looks, and the stop-service update matched on
        `student__in` alone -- so one school could switch off another school's
        bus services, which bills them, or add services for its students.
        """
        try:
            student_ids = {int(sid) for sid in data} | {int(sid) for sid in updates or []}
        except (TypeError, ValueError):
            return False
        station_ids = {
            (info.get("transportation_info") or {}).get("bus_station")
            for info in data.values()
            if isinstance(info, dict)
        } - {None, ""}
        own_students = Student.objects.filter(
            id__in=student_ids, class_info__school=school_id
        ).count()
        own_stations = BusStation.objects.filter(
            id__in=station_ids, school=school_id
        ).count()
        return own_students == len(student_ids) and own_stations == len(station_ids)

    def handleBulkUpdate(self, school_id, data, updates):
        if not isinstance(data, dict) or not self.namesOnlyOwnRecords(
            school_id, data, updates
        ):
            return False
        try:
            [creatingData, updatingData] = self.validTransportationData(
                school_id, data, updates
            )
            # print(creatingData, "\n", updatingData)
            with transaction.atomic():
                if len(updatingData) > 0:
                    us = StudentTransportationInfoSerializer(
                        data=updatingData, many=True
                    )
                    if us.is_valid():
                        # print("uts is valid!")
                        us.bulk_update(updates)
                    else:
                        # print(us.errors)
                        return False
                if len(creatingData) > 0:
                    cs = StudentTransportationInfoSerializer(
                        data=creatingData, many=True
                    )
                    if cs.is_valid():
                        # print("cts is valid!")
                        cs.bulk_create()
                    else:
                        # print(cs.errors)
                        return False
                return True
        except Exception as e:
            # print(e)
            return False

    def delete(self, request):
        student_id = request.query_params.get("student")
        school_id = request.query_params.get("school")
        id = request.query_params.get("id")
        res = self.deleteService(id, student_id, school_id)
        if res:
            return Response({"message": "Student transportation removed!"})
        return self.RESPONSE__INVALID_REQUEST

    def deleteService(self, id, student_id, school_id):
        if id and student_id and school_id:
            item = StudentTransportationInfo.objects.get(
                id=id, student=student_id, school=school_id
            )
            item.is_active = False
            item.save()
            return True
        return False

    def deleteActive(self, strict, student_id, school_id):
        if not strict:
            return True
        try:
            active = StudentTransportationInfo.objects.filter(
                student=student_id, school=school_id, is_active=True
            ).first()
            if active:
                active.is_active = False
                active.save()
        except:
            return False
        return True
