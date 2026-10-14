from rest_framework.response import Response

#
from account.auth.Authentication import (
    StudentTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView
from ...models.Alerts import BusTrackOnAlertInfo
from ...serializers.alerts.BusAlertSettingsSerializer import (
    BusAlertSettingsSerializer,
    UserRoles,
)
from drf_yasg.utils import swagger_auto_schema


TAGS = ["bus-alert-settings"]


class BusAlertSettingsPostView(SecuredAPIView, UserRoles):
    authentication_classes = (StudentTokenAuthentication, StaffTokenAuthentication)
    include_docs = True

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
