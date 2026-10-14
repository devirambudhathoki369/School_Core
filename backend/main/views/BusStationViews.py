from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)
from ..models.BusStation import BusStation
from ..models.Student import StudentTransportationInfo
from ..serializers.BusStationSerializer import (
    BusStationSerializer,
    BusStationParamsSerializer,
)
from .BaseViews import SecuredAPIView

#
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema

DOCS_TAGS = ["bus stations"]


class BusStationView(SecuredAPIView):
    authentication_classes = (
        StudentTokenAuthentication,
        AdminTokenAuthentication,
        StaffTokenAuthentication,
    )
    include_docs = True

    @swagger_auto_schema(tags=DOCS_TAGS, query_serializer=BusStationParamsSerializer)
    def get(self, request):
        school_id = request.query_params.get("school", None)
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        items = (
            BusStation.objects.filter(school__id=school_id, is_active=True)
            .values("id", "station", "fee", "latitude", "longitude")
            .order_by("id")
        )
        s = BusStationSerializer(items, many=True)
        return Response(s.data)

    @swagger_auto_schema(tags=DOCS_TAGS, request_body=BusStationSerializer)
    def post(self, request):
        s = BusStationSerializer(data=request.data)
        if s.is_valid():
            ins = s.save()
            return Response(
                {
                    "message": "Saved successfully!",
                    "station": {
                        "id": ins.id,
                        "station": ins.station,
                        "fee": ins.fee,
                        "latitude": ins.latitude,
                        "longitude": ins.longitude,
                    },
                }
            )
        return Response({"message": "Failed!"})

    @swagger_auto_schema(tags=DOCS_TAGS, request_body=BusStationSerializer)
    def put(self, request):
        station_id = request.data.pop("id", None)
        school_id = request.data.pop("school", None)
        if station_id and school_id:
            station = BusStation.objects.get(id=station_id, school__id=school_id)
            if station:
                s = BusStationSerializer(station, data=request.data, partial=True)
                if s.is_valid():
                    s.save()
                    return Response({"message": "Update compeleted!"})
                # else:
                #     print(s.errors)
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(tags=DOCS_TAGS)
    def delete(self, request):
        station_id = request.query_params.get("id", None)
        school_id = request.query_params.get("school", None)
        if station_id and school_id:
            station = BusStation.objects.get(id=station_id, school__id=school_id)
            if station:
                # don't delete a station that students are/were assigned to —
                # that would orphan their transportation records & fees. No
                # is_active filter: ANY assignment ever (even soft-deleted) blocks
                # the delete, matching the Subject rule.
                assigned = StudentTransportationInfo.objects.filter(
                    bus_station=station_id
                ).count()
                if assigned:
                    return Response(
                        {
                            "message": (
                                f"Cannot delete: this bus station is still "
                                f"assigned to {assigned} "
                                f"student{'' if assigned == 1 else 's'}. "
                                f"Reassign or remove them before deleting."
                            )
                        },
                        status=409,
                    )
                station.is_active = False
                station.save()
                return Response({"message": "Delete completed!"})
        return self.RESPONSE__INVALID_REQUEST
