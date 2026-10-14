from datetime import timedelta

from django.utils import timezone
from django.db.models import Case, When, Value, BooleanField, Count

from rest_framework.response import Response
from account.auth.Authentication import (
    SuperAdminTokenAuthentication,
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView
from ..models.Device import Device
from ..serializers.DeviceSerializer import DeviceSerializer

# For admin panel;

# A push device polls every few seconds; if we haven't heard from it within
# this window it's effectively offline (the stored `state` is sticky and can't
# be trusted on its own).
ONLINE_WINDOW_SECONDS = 180


class DeviceView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
    )

    def get(self, request):
        school_id = request.query_params.get("school")
        as_options = request.query_params.get("as_options")
        as_options = self.getBooleanValue(as_options)
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        if as_options:
            devices = (
                Device.objects.filter(school_id=school_id)
                .order_by("-last_seen")
                .values("id", "alias", "serial_number")
            )
            return Response(devices)
        # online = heard from within the recent window
        cutoff = timezone.now() - timedelta(seconds=ONLINE_WINDOW_SECONDS)
        devices = (
            Device.objects.filter(school_id=school_id)
            .annotate(
                online=Case(
                    When(last_seen__gte=cutoff, then=Value(True)),
                    default=Value(False),
                    output_field=BooleanField(),
                ),
                # How many people WE have enrolled here. `user_count` next to it
                # is whatever the device last said about itself, and the two are
                # not interchangeable: attendance terminals report a real figure
                # in their INFO= poll, but access-control panels never send INFO
                # at all, so their user_count sits at 0 forever no matter how
                # many users are on them. Showing only that number told an admin
                # who had just enrolled six people that the panel held none.
                # Where both numbers exist, a gap between them is the useful
                # signal — it means a sync didn't fully land.
                registered_users=Count("users", distinct=True),
            )
            .order_by("-last_seen")
            .values()
        )
        return Response(devices)

    def post(self, request):
        s = DeviceSerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response(
                {
                    "message": "Device registered!",
                    "device": s.data,
                }
            )
        return self.RESPONSE__INVALID_REQUEST

    # Admin-editable identity fields only. Device-reported state (last_seen,
    # counters, stamps, school) is left untouched so an edit can't make a live
    # device look offline or move it between schools.
    EDITABLE_FIELDS = ("serial_number", "alias", "ip_address", "firmware")

    def put(self, request):
        device_id = request.data.get("id")
        if not device_id:
            return self.RESPONSE__INVALID_REQUEST
        # by id alone, any school could rename or re-serial another school's
        # terminal — and a stolen serial routes that gate's punches here
        device = self.scope_to_caller(
            Device.objects.filter(id=device_id), request
        ).first()
        if not device:
            return self.RESPONSE__INVALID_REQUEST
        payload = {
            k: request.data[k] for k in self.EDITABLE_FIELDS if k in request.data
        }
        s = DeviceSerializer(device, data=payload, partial=True)
        if s.is_valid():
            s.save()
            return Response(
                {
                    "message": "Device updated!",
                    "device": s.data,
                }
            )
        return self.RESPONSE__INVALID_REQUEST
