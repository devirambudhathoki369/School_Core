from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from ..BaseViews import SecuredAPIView
from ...models.PayrollClose import StaffPayrollClose
from ...methods.payrollClose import payrollYearsToClose, previewPayrollClose


class PayrollYearCloseView(SecuredAPIView):
    """What has been closed in a school's payroll, and what a close would carry.

    Read-only. Payroll has no close button of its own: a payroll year closes
    with the school's accounting year (accounting AEYCloseView), and this is
    what the closing screen shows the school before it confirms.
    """

    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def get(self, request):
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        closed = [
            {
                "economic_year": close.economic_year.name,
                "next_economic_year": close.next_economic_year.name,
                "staff_count": close.staff_count,
                "total_carried": close.total_carried,
                "closed_on": close.created_at,
            }
            for close in StaffPayrollClose.objects.filter(school=school_id, is_active=True)
            .select_related("economic_year", "next_economic_year")
            .order_by("economic_year__start_date", "id")
        ]
        pending = []
        accounting_year_id = request.query_params.get("accounting_economic_year")
        if accounting_year_id:
            from accounting.models.AccountingEconomicYear import AccountingEconomicYear

            accounting_year = AccountingEconomicYear.objects.filter(
                id=accounting_year_id, school=school_id
            ).first()
            if accounting_year:
                pending = [
                    previewPayrollClose(school_id, year)
                    for year in payrollYearsToClose(school_id, accounting_year)
                ]
        return Response({"closed": closed, "pending": pending})
