from rest_framework.response import Response

#
from account.auth.Authentication import (
    StudentTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView, caller_student_id
from ...methods.busTracking import assignments, load_config
from ...models.Alerts import BusTrackOnAlertInfo
from ...models.Staff import Staff
from ...models.Student import Student
from ...serializers.alerts.BusAlertSettingsSerializer import (
    BusAlertSettingsSerializer,
    UserRoles,
)
from drf_yasg.utils import swagger_auto_schema


TAGS = ["bus-alert-settings"]


class BusAlertSettingsPostView(SecuredAPIView, UserRoles):
    authentication_classes = (StudentTokenAuthentication, StaffTokenAuthentication)
    include_docs = True
    # a student saves their own alert settings
    student_write_methods = ("post",)

    def is_own_record(self, request, role, user_id):
        """`user_id` is the Student/Staff row whose alert this is, and it comes
        from the body: without this any account could rewrite anyone's."""
        if role == self.ROLE_STUDENT:
            return str(user_id) == str(caller_student_id(request))
        if role == self.ROLE_STAFF:
            return Staff.objects.filter(
                id=user_id if str(user_id).isdigit() else None,
                account_id=request.user.pk,
            ).exists()
        return False

    def school_of(self, role, user_id):
        if role == self.ROLE_STUDENT:
            return Student.objects.filter(id=user_id).values_list("class_info__school_id", flat=True).first()
        if role == self.ROLE_STAFF:
            return Staff.objects.filter(id=user_id).values_list("school_id", flat=True).first()
        return None

    def is_school_bus(self, role, user_id, bus_id):
        """Is `bus_id` one of the caller's own school's buses? Following a bus
        is also how a bus the GPS provider files under no school is given to
        a school (main/methods/busTracking.py), so following another school's
        bus would show it on this school's map, or, followed from both, hide
        it from its own."""
        school = self.school_of(role, user_id)
        if not school:
            return False
        return str(bus_id) in {str(bus["id"]) for bus in assignments(load_config(), school)}

    @swagger_auto_schema(
        tags=TAGS,
        request_body=BusAlertSettingsSerializer,
        operation_description="Save student's bus alert information",
    )
    def post(self, request):
        data = request.data
        user_id = data.get("user_id")
        role = getattr(request, "user_role")
        #
        previous_ins = None
        serializer = None
        if user_id and role and not self.is_own_record(request, role, user_id):
            return Response({"message": "Not permitted."}, status=403)
        if user_id and role and data.get("bus_id") is not None:
            try:
                ours = self.is_school_bus(role, user_id, data.get("bus_id"))
            except Exception:
                return Response({"message": "Bus tracking is not available right now."}, status=503)
            if not ours:
                return Response({"message": "That bus is not one of your school's buses."}, status=400)
        if user_id and role:
            data["role"] = role
            if role == self.ROLE_STUDENT:
                previous_ins = BusTrackOnAlertInfo.objects.filter(
                    student_id=user_id
                ).first()
            elif role == self.ROLE_STAFF:
                previous_ins = BusTrackOnAlertInfo.objects.filter(
                    staff_id=user_id
                ).first()
            serializer = BusAlertSettingsSerializer(
                instance=previous_ins, data=data, partial=bool(previous_ins)
            )
            #
            if serializer.is_valid():
                serializer.save()
                return Response({"message": "Alert info saved!"})
            # else:
            #     print(serializer.errors)
        return self.RESPONSE__INVALID_REQUEST
