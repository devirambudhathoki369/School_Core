from django.db import transaction

#
from rest_framework import serializers

#
from ..models.AccountingEconomicYear import AccountingEconomicYear
from ..models.AccountingLedger import AccountingLedger, AccountingLedgerBalance
from ..models import BALANCE_TYPE_CHOICES, BALANCE_CONFIG


class AccountingLedgerSerializer(serializers.ModelSerializer):
    address = serializers.CharField(required=False)
    contact = serializers.CharField(required=False)
    # These are not part of AccountingLedger but will be passed in the request.
    # Fields for accounting-ledger-opening-balance.
    balance_type = serializers.ChoiceField(choices=BALANCE_TYPE_CHOICES)
    opening_balance = serializers.DecimalField(
        **BALANCE_CONFIG, required=False, allow_null=True
    )
    economic_year = serializers.IntegerField(write_only=True)

    class Meta:
        model = AccountingLedger
        fields = "__all__"

    # Allow unsigned opening-balance only!
    def validate_opening_balance(self, value):
        if value < 0:
            raise serializers.ValidationError("Opening balance must be non-negative.")
        return value

    def validate_economic_year(self, value):
        try:
            return AccountingEconomicYear.objects.get(pk=value)
        except AccountingEconomicYear.DoesNotExist:
            raise serializers.ValidationError("Invalid economic year ID")

    def create(self, validated_data):
        opening_balance = validated_data.pop("opening_balance")
        balance_type = validated_data.pop("balance_type")
        economic_year = validated_data.pop("economic_year")
        #
        with transaction.atomic():
            ledger = super().create(validated_data)

            AccountingLedgerBalance.objects.create(
                ledger=ledger,
                economic_year=economic_year,
                opening_balance=opening_balance,
                balance_type=balance_type,
            )

        return ledger

    def update(self, instance, validated_data):
        opening_balance = validated_data.pop("opening_balance")
        balance_type = validated_data.pop("balance_type")
        economic_year = validated_data.pop("economic_year", None)
        #
        with transaction.atomic():
            ledger = super().update(instance, validated_data)

            if opening_balance is not None and balance_type is not None:
                AccountingLedgerBalance.objects.update_or_create(
                    ledger=ledger,
                    economic_year=economic_year,
                    defaults={
                        "opening_balance": opening_balance,
                        "balance_type": balance_type,
                    },
                )

        return ledger


"""
still has some issues and unnecessary things in update! in create, 
and why not update or create in update? (atomicity tries update/create/fail automatically), 
and will integer value be allowed in accountingledgerbalance.create??
"""
