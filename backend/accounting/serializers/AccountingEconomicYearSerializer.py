from rest_framework import serializers

#
from main.serializers.FiscalYearSerializers import DuplicateYearNameMixin
from ..models.AccountingEconomicYear import AccountingEconomicYear


class AccountingEconomicYearSerializer(
    DuplicateYearNameMixin, serializers.ModelSerializer
):
    YearModel = AccountingEconomicYear

    class Meta:
        model = AccountingEconomicYear
        fields = "__all__"
