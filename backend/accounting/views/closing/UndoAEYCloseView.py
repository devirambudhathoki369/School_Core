from django.utils import timezone
from django.db import transaction

#
from rest_framework.response import Response

#
from account.auth.Authentication import SuperAdminTokenAuthentication
from main.views.BaseViews import SecuredAPIView
from main.models.PayrollClose import StaffPayrollClose
from main.methods.payrollClose import PayrollCloseError, reopenPayrollYear
from ...models.AccountingEconomicYear import AccountingEconomicYear
from ...models.AccountingLedger import AccountingLedgerBalance


class UndoAEYCloseView(SecuredAPIView):
    authentication_classes = (SuperAdminTokenAuthentication,)

    def get(self, request):
        school_id = request.query_params.get("school")
        if school_id:
            years = AccountingEconomicYear.objects.filter(
                school=school_id, closed=True
            ).values("id", "name", "start_date", "end_date")
            return Response(years)
        return self.RESPONSE__INVALID_REQUEST

    def post(self, request):
        school_id = request.data.pop("school")
        closed_economic_year_id = request.data.pop("closed_economic_year")
        if school_id and closed_economic_year_id:
            closed_ey = AccountingEconomicYear.objects.filter(
                id=closed_economic_year_id, closed=True
            ).first()
            next_ey = AccountingEconomicYear.objects.filter(
                previous_ey=closed_economic_year_id
            ).first()
            if closed_ey and next_ey:
                updated_at = timezone.now()
                # The payroll that closed with this year reopens with it,
                # newest first so each one's carry is undone before the year
                # it was carried from. One that cannot be (the payroll year
                # after it has itself been closed since) stops the undo:
                # reopening the books but not the payroll would leave the two
                # telling different stories.
                payroll_closes = list(
                    StaffPayrollClose.objects.filter(
                        accounting_economic_year=closed_ey.id, is_active=True
                    )
                    .select_related("economic_year", "next_economic_year")
                    .order_by("-economic_year__start_date", "-id")
                )
                try:
                    with transaction.atomic():
                        for payroll_close in payroll_closes:
                            reopenPayrollYear(payroll_close)
                        self.undoClose(closed_ey, next_ey, updated_at)
                except PayrollCloseError as reason:
                    return Response({"message": str(reason)}, status=400)
                message = "Undo accounting economic year close done!"
                for payroll_close in payroll_closes:
                    message += f" Payroll {payroll_close.economic_year.name} reopened."
                return Response({"message": message})
        return self.RESPONSE__INVALID_REQUEST

    def undoClose(self, closed_ey, next_ey, updated_at):
        """remove all ledger balances"""
        AccountingLedgerBalance.objects.filter(economic_year=next_ey.id).delete()
        """unclose closed ey"""
        closed_ey.closed = False
        closed_ey.updated_at = updated_at
        closed_ey.save(update_fields=["closed", "updated_at"])
        """delete new/next ey"""
        next_ey.delete()
