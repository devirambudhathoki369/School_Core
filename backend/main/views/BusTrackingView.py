from rest_framework.response import Response

from account.auth.Authentication import AdminTokenAuthentication, StaffTokenAuthentication
from account.models import AdminAccount, StaffAccount
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Staff import Staff
from main.methods.busTracking import answered_at_once, load_config, school_buses, TrackingUnavailable
from main.methods.busTrackingHistory import school_history
from .BaseViews import SecuredAPIView


class BusTrackingView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    http_method_names = ["get", "head", "options"]

    def get(self, request):
        # Derive ownership from the authenticated account even when the older
        # shared school-scope enforcement is disabled. Never trust ?school=.
        school_id = None
        if isinstance(request.user, AdminAccount):
            school_id = SchoolAdmin.objects.filter(account=request.user, is_active=True).values_list("id", flat=True).first()
        elif isinstance(request.user, StaffAccount):
            staff = Staff.objects.filter(account=request.user, is_active=True, school__is_active=True).first()
            if staff and 511 in (staff.permissions or []):  # The Bus Tracking permission.
                school_id = staff.school_id
        if not school_id:
            return Response({"message": "You do not have access to bus tracking."}, status=403)
        requested = request.query_params.get("school")
        if requested is not None and str(school_id) != str(requested):
            return Response({"message": "You do not have access to this school's buses."}, status=403)
        try:
            response = Response(self.get_data(request, school_id))
        except TrackingUnavailable as exc:
            response = Response({"message": str(exc)}, status=503)
        response["Cache-Control"] = "private, no-store"
        return response

    def get_data(self, request, school_id):
        # Asked every few seconds by every open page: answered from the last
        # answer, the provider read behind it.
        return answered_at_once(f"web-bus-answer:{school_id}", lambda: school_buses(load_config(), school_id))


class BusTrackingHistoryView(BusTrackingView):
    def get_data(self, request, school_id):
        return school_history(load_config(), school_id, request.query_params.get("bus"),
                              request.query_params.get("from"), request.query_params.get("to"))
