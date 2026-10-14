from django.db.models import Q

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import BaseSearchView
from ...models.AccountingLedger import AccountingLedger
from ..AccountingLedgerView import AccountingLedgerBalanceQueryMixin


class LedgersSearchView(BaseSearchView, AccountingLedgerBalanceQueryMixin):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    RETURN_FIELDS = (
        "id",
        "name",
        "ledger_group",
    )

    # TODO: search by date or voucher-no or active-status!
    def post(self, request):
        school_id = request.data.get("school")
        ecoy_id = request.data.pop("economic_year")
        as_options = request.data.pop("as_options", False)
        is_active = request.data.pop("status", True)
        include_balance = request.data.pop("include_balance", False)
        detailed = request.data.pop("detailed", False)

        if school_id:
            RETURN_FIELDS = self.RETURN_FIELDS
            if detailed:
                include_balance = True
                RETURN_FIELDS += ("address", "contact")
            q = Q(school=school_id, is_active=is_active)
            ledger_groups = request.data.get("ledger_groups")
            if ledger_groups:
                q &= Q(ledger_group__in=ledger_groups)
            name = request.data.pop("name", None)
            if name:
                q &= Q(name__icontains=name)
            ledgers = AccountingLedger.objects.filter(q)
            if include_balance and ecoy_id:
                ledgers = self.getOpeningBalances(ledgers, ecoy_id, False, False)
                RETURN_FIELDS += ("opening_balance", "balance_type")
            #
            ledgers = ledgers.values(*RETURN_FIELDS)
            if len(ledgers) > 0:
                if ledger_groups:
                    grouped_ledgers = {lg: [] for lg in ledger_groups}
                    for ledger in ledgers:
                        ledger_group = ledger.get("ledger_group")
                        if as_options:
                            ledger["value"] = ledger.pop("id")
                        grouped_ledgers[ledger_group].append(ledger)
                    return Response(grouped_ledgers)
                else:
                    if as_options:
                        for ledger in ledgers:
                            ledger["value"] = ledger.pop("id")
                    return Response(ledgers)
            else:
                return self.RESPONSE__NOT_FOUND
        return self.RESPONSE__INVALID_REQUEST
