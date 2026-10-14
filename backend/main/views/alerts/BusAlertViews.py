from rest_framework.response import Response

#
from account.auth.Authentication import (
    StudentTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView, caller_student_id
from ...models.Alerts import BusTrackOnAlertInfo
from ...models.Staff import Staff
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
