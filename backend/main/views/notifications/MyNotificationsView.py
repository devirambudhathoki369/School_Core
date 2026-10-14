from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema

#
from account.auth.Authentication import (
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)
from account.auth.UserRole import UserRoles

#
from ..BaseViews import SecuredAPIView
from ...models.Notification import (
    NotificationHistory,
    RECIPIENT_ROLE_STUDENT,
    RECIPIENT_ROLE_STAFF,
)
from ...serializers.notifications.NotificationHistorySerializer import (
    NotificationHistorySerializer,
)


TAGS = ["notifications"]

# map the authenticated user's role to the recipient_role stored on history rows.
_ROLE_TO_RECIPIENT = {
    UserRoles.ROLE_STUDENT: RECIPIENT_ROLE_STUDENT,
    UserRoles.ROLE_STAFF: RECIPIENT_ROLE_STAFF,
}


class MyNotificationsView(SecuredAPIView):
    """
    Notifications inbox for the *currently logged-in* user — the in-app list of
    push notifications sent to this student/staff member, newest first. Works for
    both student and staff tokens through a single route.

    Unlike /notifications/history (admin-only, whole-school), this returns ONLY
    the caller's own notifications, so the mobile app can show each user their
    own inbox. Rows are recorded by dispatch_push regardless of push delivery
    status, so a notification appears here even if the OS banner never displayed.
    """

    authentication_classes = (StudentTokenAuthentication, StaffTokenAuthentication)
    include_docs = True
    # inbox is append-only and can grow; cap the response.
    LIMIT = 200

    @swagger_auto_schema(
        tags=TAGS,
        operation_description="List the logged-in user's own notifications, newest first",
    )
    def get(self, request):
        role = getattr(request, "user_role", None)
        account = request.user

        recipient_role = _ROLE_TO_RECIPIENT.get(role)
        if not recipient_role:
            return self.RESPONSE__INVALID_REQUEST

        if role == UserRoles.ROLE_STUDENT:
            owner = getattr(account, "student", None)
        else:
            owner = getattr(account, "staff", None)
        if not owner:
            return self.RESPONSE__NOT_FOUND

        history = NotificationHistory.objects.filter(
            recipient_role=recipient_role,
            recipient_id=owner.id,
        )[: self.LIMIT]
        return Response(NotificationHistorySerializer(history, many=True).data)
