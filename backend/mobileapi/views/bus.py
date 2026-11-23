"""The school bus of a student, for the student and their parents
(mobile/SPEC.md §5, "Bus"; the logic is in mobileapi/buses.py)."""
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response

from ..access import student_for
from ..buses import is_school_bus, ride, student_bus
from ..errors import MobileError
from ..idempotency import idempotent
from .base import MobileAPIView

STUDENT_ID = OpenApiParameter("student_id", int, OpenApiParameter.PATH)


class BusOut(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    status = serializers.CharField(help_text="Moving, Idling, Stopped, No signal, Offline or Tracking unavailable")
    latitude = serializers.FloatField(allow_null=True)
    longitude = serializers.FloatField(allow_null=True)
    updated_at = serializers.CharField(allow_null=True, help_text="When the position was taken, ISO 8601")
    stale = serializers.BooleanField(help_text="The position is older than two minutes")
    speed_kmh = serializers.FloatField(allow_null=True)
    address = serializers.CharField(allow_blank=True)


class StudentBusOut(serializers.Serializer):
    following = serializers.IntegerField(allow_null=True, help_text="The bus the student rides, when chosen")
    buses = BusOut(many=True, help_text="The school's buses, the student's own first")
    message = serializers.CharField(allow_null=True, help_text="Why no bus or no position can be shown")
    refresh_seconds = serializers.IntegerField(help_text="Ask again after this long while the screen is open")


class RideIn(serializers.Serializer):
    bus_id = serializers.IntegerField(allow_null=True, min_value=1, help_text="null: no school bus")


class StudentBusView(MobileAPIView):
    @extend_schema(parameters=[STUDENT_ID], responses=StudentBusOut)
    def get(self, request, student_id):
        student = student_for(request, student_id)
        return Response(StudentBusOut(student_bus(student)).data)

    @extend_schema(parameters=[STUDENT_ID], request=RideIn, responses=StudentBusOut)
    @idempotent
    def put(self, request, student_id):
        """Choose the bus the student rides: the student, or their parent."""
        student = student_for(request, student_id)
        given = RideIn(data=request.data)
        if not given.is_valid():
            raise MobileError("invalid", "Choose a bus.", fields={"bus_id": "Not a bus."})
        bus_id = given.validated_data["bus_id"]
        if bus_id is not None and not is_school_bus(student.class_info.school_id, bus_id):
            raise MobileError("invalid", "That bus is not one of your school's.",
                              fields={"bus_id": "Not this school's bus."})
        ride(student, bus_id)
        return Response(StudentBusOut(student_bus(student)).data)
