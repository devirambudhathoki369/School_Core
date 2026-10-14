from django.db.models import OuterRef, Subquery, Q

#
from rest_framework.response import Response
from rest_framework.pagination import CursorPagination

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView

#
from ..models.AccountingLedger import AccountingLedger, AccountingLedgerBalance
from ..serializers.AccountingLedgerSerializer import AccountingLedgerSerializer

RETURN_FIELDS = (
    "id",
    "name",
    "ledger_group",
    "address",
    "contact",
    # ledger-balance!
    "opening_balance",
    "balance_type",
)


class AccountingLedgerCursorPagination(CursorPagination):
    page_size = 10
    ordering = "-id"


class AccountingLedgerBalanceQueryMixin:
    def getOpeningBalances(
        self,
        ledgers,
        accounting_economic_year_id,
        include_economic_year_date=False,
        strict=True,
    ):
        balance_qs = AccountingLedgerBalance.objects.filter(
            ledger=OuterRef("pk"),
            economic_year=accounting_economic_year_id,
        ).order_by("-id")
        ledgers = ledgers.annotate(
            opening_balance=Subquery(balance_qs.values("opening_balance")[:1]),
            balance_type=Subquery(balance_qs.values("balance_type")[:1]),
        )
        if strict:
            xf = ~Q(opening_balance=0)
            ledgers = ledgers.filter(xf)
        if include_economic_year_date:
            ledgers = ledgers.annotate(
                economic_year_date=balance_qs.values("economic_year__start_date"),
            )
        return ledgers


class AccountingLedgerView(SecuredAPIView, AccountingLedgerBalanceQueryMixin):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def get(self, request):
        school_id = request.query_params.get("school")
        ecoy_id = request.query_params.get("economic_year")
        if school_id and ecoy_id:
            ledgers = AccountingLedger.objects.filter(is_active=True, school=school_id)
            ledgers = self.getOpeningBalances(ledgers, ecoy_id, False, False)
            ledgers = ledgers.values(*RETURN_FIELDS)
            paginator = AccountingLedgerCursorPagination()
            ledgers = paginator.paginate_queryset(ledgers, request)
            return paginator.get_paginated_response(ledgers)
        return self.RESPONSE__INVALID_REQUEST

    def post(self, request):
        s = AccountingLedgerSerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response({"message": "Accounting Ledger saved!"})
        # else:
        #     print(s.errors)
        return self.RESPONSE__INVALID_REQUEST

    def put(self, request):
        id = request.data.get("id")
        school_id = request.data.get("school")
        if id and school_id:
            item = AccountingLedger.objects.get(id=id, school=school_id)
            if item:
                s = AccountingLedgerSerializer(item, request.data, partial=True)
                if s.is_valid():
                    s.save()
                    return Response({"message": "Update completed!"})
        return self.RESPONSE__INVALID_REQUEST
