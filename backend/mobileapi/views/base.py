from django.conf import settings
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from main.models.SchoolAdmin import SchoolAdmin

from ..auth import MobileTokenAuthentication, school_takes_app
from ..errors import MobileError, mobile_exception_handler
from ..throttles import SessionThrottle


def _version(text) -> tuple:
    try:
        return tuple(int(part) for part in str(text).strip().split("."))
    except ValueError:
        return (0,)


class MobileAPIView(APIView):
    """Signed-in mobile endpoints: Bearer token, mobile error shape, version gate."""

    authentication_classes = (MobileTokenAuthentication,)
    permission_classes = (IsAuthenticated,)
    throttle_classes = (SessionThrottle,)
    swagger_schema = None  # documented by the mobile schema, not the portal's

    def get_exception_handler(self):
        return mobile_exception_handler

    def initial(self, request, *args, **kwargs):
        sent = request.headers.get("X-App-Version")
        if sent and _version(sent) < _version(getattr(settings, "MOBILE_MIN_APP_VERSION", "0.0.0")):
            raise MobileError(
                "update_required", "Please update the SchoolCore app to keep using it.",
                status.HTTP_426_UPGRADE_REQUIRED,
            )
        super().initial(request, *args, **kwargs)


class PublicMobileView(MobileAPIView):
    authentication_classes = ()
    permission_classes = (AllowAny,)
    throttle_classes = ()


def school_for_code(code: str) -> SchoolAdmin:
    school = SchoolAdmin.objects.filter(app_code=code).first() if code else None
    if school is None or not school_takes_app(school):
        raise MobileError(
            "school_not_found", "No school uses that code. Check it with your school.", status.HTTP_404_NOT_FOUND
        )
    return school
