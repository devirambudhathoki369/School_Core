from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from account.auth.UserRole import UserRoles

#
from ..BaseViews import SecuredAPIView
from ...models.Student import Student
from ...models.Staff import Staff
from ...serializers.notifications.SendNotificationSerializer import (
    SendNotificationSerializer,
)
from ...serializers.notifications.NotificationHistorySerializer import (
    NotificationHistorySerializer,
)
from ...models.Notification import NotificationHistory
from ...methods.push import dispatch_push


TAGS = ["notifications"]


class SendNotificationView(SecuredAPIView, UserRoles):
    """
    Send a push notification (title/body/optional data) to selected
    student or staff devices belonging to the admin's school.
    """

    # Staff whose menu shows this page may use it too; the authenticator
    # checks the `school` sent is theirs.
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    include_docs = True

    @swagger_auto_schema(
        tags=TAGS,
        request_body=SendNotificationSerializer,
        operation_description="Send a push notification to selected student/staff devices",
    )
    def post(self, request):
        school_id = request.query_params.get("school") or request.data.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST

        serializer = SendNotificationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(
                {"message": self.getSerializationError(serializer)},
                status=400,
            )

        validated = serializer.validated_data
        role = validated["recipient_role"]
        user_ids = validated["user_ids"]
        title = validated["title"]
        body = validated["body"]
        data = validated.get("data")

        # resolve active recipients' (id, device-token) pairs, scoped to the school.
        if role == self.ROLE_STUDENT:
            recipients = Student.objects.filter(
                id__in=user_ids,
                class_info__school=school_id,
                is_active=True,
                account__app_device_token__isnull=False,
            ).values_list("id", "account__app_device_token")
        else:  # ROLE_STAFF
            recipients = Staff.objects.filter(
                id__in=user_ids,
                school=school_id,
                is_active=True,
                account__app_device_token__isnull=False,
            ).values_list("id", "account__app_device_token")

        recipients = list(recipients)
        if not recipients:
            return Response(
                {"message": "No reachable devices for the selected recipients."},
                status=404,
            )

        # send + record history + clear dead tokens (shared logic).
        result = dispatch_push(school_id, role, recipients, title, body, data)
        return Response(
            {
                "message": "Notification dispatched.",
                "sent": result["sent"],
                "failed": result["failed"],
            }
        )


class NotificationHistoryView(SecuredAPIView, UserRoles):
    """
    List sent push notifications for the admin's school, newest first.
    Optional filters: recipient_role + recipient_id.
    """

    # Staff whose menu shows this page may use it too; the authenticator
    # checks the `school` sent is theirs.
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    include_docs = True
    # cap the response; history is append-only and can grow large.
    LIMIT = 200

    @swagger_auto_schema(
        tags=TAGS,
        operation_description="List sent push notifications for a school",
    )
    def get(self, request):
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST

        history = NotificationHistory.objects.filter(school=school_id)
        recipient_role = request.query_params.get("recipient_role")
        recipient_id = request.query_params.get("recipient_id")
        if recipient_role:
            history = history.filter(recipient_role=recipient_role)
        if recipient_id:
            history = history.filter(recipient_id=recipient_id)

        history = history[: self.LIMIT]
        return Response(NotificationHistorySerializer(history, many=True).data)
