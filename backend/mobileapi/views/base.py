from django.conf import settings
from django.utils.cache import add_never_cache_headers
from rest_framework import status
from rest_framework.permissions import SAFE_METHODS, AllowAny, IsAuthenticated
from rest_framework.views import APIView

from main.models.SchoolAdmin import SchoolAdmin

from ..auth import MobileTokenAuthentication, school_takes_app
from ..errors import MobileError, mobile_exception_handler
from ..throttles import SessionThrottle, SessionWriteThrottle


def _version(text) -> tuple:
    try:
        return tuple(int(part) for part in str(text).strip().split("."))
    except ValueError:
        return (0,)


class MobileAPIView(APIView):
    """Signed-in mobile endpoints: Bearer token, mobile error shape, version gate."""

    authentication_classes = (MobileTokenAuthentication,)
    permission_classes = (IsAuthenticated,)
    throttle_classes = (SessionThrottle, SessionWriteThrottle)
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
        # Every write here takes one object (JSON, or a form with files): a
        # list, a string or a number is refused before any view reads it.
        if request.method not in SAFE_METHODS and not isinstance(request.data, dict):
            raise MobileError("invalid", "Send the request as one JSON object.")

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        # Every answer here is one person's records (marks, fees, attendance)
        # or their tokens, errors included: no proxy, CDN or HTTP cache on
        # the phone may keep a copy.
        add_never_cache_headers(response)
        return response


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
