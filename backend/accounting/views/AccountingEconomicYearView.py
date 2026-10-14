from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView
from main.views.FiscalYearViews import FiscalYearView
from ..models.AccountingEconomicYear import AccountingEconomicYear
from ..serializers.AccountingEconomicYearSerializer import (
    AccountingEconomicYearSerializer,
)


class AccountingEconomicYearView(SecuredAPIView, FiscalYearView):
    # Superadmin/superuser are authenticated here so the central year setup
    # screen can read and create a school's accounting years; the school's own
    # admin/staff keep read access exactly as before.
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )
    YearModel = AccountingEconomicYear
    YearSerializer = AccountingEconomicYearSerializer

    def get(self, request):
        return self.getYearsBySchoolId(request)

    def post(self, request):
        # Superadmin only — see FiscalYearView.CREATOR_ROLES. Closing is
        # unaffected: AEYCloseView creates the next year itself, in the same
        # transaction that carries the opening balances forward.
        if not self.canCreateYear(request):
            return self.RESPONSE__CREATE_NOT_ALLOWED
        return self.saveYear(request)
