from django.db.models import Q

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.methods.getDateRange import getDateRange
from main.views.BaseViews import BaseSearchView
from ...models.IncomeEntry import IncomeEntry
from ...models.ExpenseEntry import ExpenseEntry
from ...models.JournalEntry import JournalEntry
from ..reports.Entries import ENTRIES


class EntriesSearchView(BaseSearchView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def post(self, request):
        school_id = request.data.get("school")
        ecoy_id = request.data.pop("economic_year")
        voucher_type = request.data.pop("voucher_type")
        voucher_id = request.data.pop("voucher_id", None)
        from_date = request.data.pop("from_date", None)
        to_date = request.data.pop("to_date", None)
        # no explicit status filter -> search across active AND deleted
        # vouchers (deleted ones are listed with an is_active flag so the
        # client can badge them)
        is_active = request.data.pop("status", None)

        if school_id and ecoy_id:
            query = Q(
                school=school_id,
                economic_year=ecoy_id,
            )
            if is_active is not None:
                query &= Q(is_active=is_active)
            if from_date and to_date:
                date_range = getDateRange(from_date, to_date)
                query &= Q(date__range=date_range)
            if voucher_id:
                query &= Q(voucher_id=voucher_id)
            Model = self.getModel(voucher_type)
            if Model:
                qs = (
                    Model.objects.filter(query)
                    .values("id", "date", "is_active")
                    .with_voucher_number()
                )
                return Response(qs)
        return self.RESPONSE__INVALID_REQUEST

    def getModel(self, voucher_type):
        if voucher_type == ENTRIES.INCOME_ENTRY:
            return IncomeEntry
        elif voucher_type == ENTRIES.EXPENSE_ENTRY:
            return ExpenseEntry
        elif voucher_type == ENTRIES.JOURNAL_ENTRY:
            return JournalEntry
        return None
