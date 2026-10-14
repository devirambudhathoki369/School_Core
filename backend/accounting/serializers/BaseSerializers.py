from django.db import transaction
from django.db.models import Q, Max

#
from rest_framework import serializers
from decimal import Decimal

#
from ..models.BaseModels import BaseEntry

INCOME_ENTRY, EXPENSE_ENTRY = 1, 2


class BaseEntrySerializer(serializers.ModelSerializer):
    """
    expects ParticularModel to create Particular instances.
    """

    _voucher_id = serializers.SerializerMethodField(required=False)
    remarks = serializers.CharField(required=False)
    particulars = serializers.ListField()  # particulars[]

    def validate(self, attrs):
        """Keep every voucher inside its own open accounting fiscal year.

        The UI already makes a selected closed year read-only, but validation
        must live here too.  The voucher date is deliberately NOT range-checked
        against start_date/end_date: those are stored per school and are often
        stale or short (Ashad 31/32), which rejected valid entries.
        """
        attrs = super().validate(attrs)
        instance = getattr(self, "instance", None)
        economic_year = attrs.get("economic_year") or getattr(
            instance, "economic_year", None
        )
        school = attrs.get("school") or getattr(instance, "school", None)

        if not economic_year:
            return attrs

        if school and economic_year.school_id != school.id:
            raise serializers.ValidationError(
                {"economic_year": "The fiscal year does not belong to this school."}
            )
        if economic_year.closed:
            raise serializers.ValidationError(
                {"economic_year": "This fiscal year is closed and cannot accept vouchers."}
            )
        return attrs

    # def get_voucher_id(self, obj):
    #     return obj.voucher_id

    def create(self, validated_data):
        particulars = validated_data.pop("particulars", [])
        school = validated_data.get("school")
        economic_year = validated_data.get("economic_year")
        if len(particulars) > 0 and school and economic_year:
            ParticularModel = getattr(self.Meta, "ParticularModel", None)
            if ParticularModel:
                entry_type_id = validated_data.pop("entry_type_id", None)
                with transaction.atomic():
                    # create entry;
                    voucher_id = self.get_voucher_id(school, economic_year)
                    validated_data["voucher_id"] = voucher_id
                    entry_instance = super().create(validated_data)
                    # prepare particulars
                    if entry_type_id in [INCOME_ENTRY, EXPENSE_ENTRY]:
                        ledger_id = validated_data.get("ledger").id
                        total_amount = self.getParticularsTotal(particulars)
                        particulars = [
                            {"ledger": ledger_id, "amount": total_amount},
                            *particulars,
                        ]
                    particulars = [
                        ParticularModel(
                            entry=entry_instance,
                            ledger_id=attributes.pop("ledger"),
                            **attributes,
                        )
                        for attributes in particulars
                    ]
                    # bulk save particulars.
                    ParticularModel.objects.bulk_create(particulars)
                    return entry_instance

    def getParticularsTotal(self, particulars):
        return sum(Decimal(par.get("amount", 0)) for par in particulars)

    def get_voucher_id(self, school_id, economic_year_id):
        """
        Vouchers are numbered per school per economic year, so a freshly opened
        year always starts again at 1.

        Takes the highest number rather than the newest row: deleting the latest
        entry would otherwise hand its number back out and create a duplicate.
        """
        Model = getattr(self.Meta, "model", None)
        if Model:
            highest = Model.objects.filter(
                school=school_id, economic_year=economic_year_id
            ).aggregate(highest=Max("_voucher_id"))["highest"]
            return (highest or 0) + 1

    def update(self, instance, validated_data):
        school = validated_data.get("school")
        economic_year = validated_data.get("economic_year")
        entry_type_id = validated_data.pop("entry_type_id", None)
        updated_particulars = validated_data.pop("particulars", [])
        if len(updated_particulars) > 0 and school and economic_year:
            updated_ledger_id, exisiting_ledger_id = None, None
            if entry_type_id in [INCOME_ENTRY, EXPENSE_ENTRY]:
                updated_ledger_id = validated_data.get("ledger").id
                exisiting_ledger_id = instance.ledger.id
            to_create, to_update, update_ids = self.extractParticulars(
                updated_particulars, updated_ledger_id, exisiting_ledger_id
            )
            #
            return self.executeUpdate(
                instance,
                validated_data,
                to_create,
                to_update,
                update_ids,
            )

    particular_update_keys = ["ledger_id", "amount", "remarks"]

    def executeUpdate(self, entry, validated_data, to_create, to_update, update_ids):
        with transaction.atomic():
            ParticularModel = getattr(self.Meta, "ParticularModel", None)
            if ParticularModel:
                # UPDATE
                if len(to_update) > 0:
                    instances_to_update = []
                    saved_pars = self.getParticulars(entry, ParticularModel)
                    for e in to_update:
                        id = e.pop("id")
                        ins = saved_pars.get(id)
                        for key in self.particular_update_keys:
                            updated_val = e.get(key)
                            setattr(ins, key, updated_val)
                        instances_to_update.append(ins)
                        ParticularModel.objects.bulk_update(
                            instances_to_update, self.particular_update_keys
                        )
                    # DELETE
                    # [if has updates, then there's a chance of particulars being deleted!]
                    q = ~Q(id__in=update_ids) & Q(entry=entry.id)
                    ParticularModel.objects.filter(q).delete()
                # CREATE
                if len(to_create) > 0:
                    instances_to_create = [
                        ParticularModel(
                            entry=entry,
                            **par,
                        )
                        for par in to_create
                    ]
                    ParticularModel.objects.bulk_create(instances_to_create)
                # instance update
                for attr, value in validated_data.items():
                    setattr(entry, attr, value)
                entry.save()
                return entry

    def extractParticulars(self, updated_pars, updated_ledger_id, exisiting_ledger_id):
        """
        from updated_pars,
        if id is in saved_pars, update them
        if id is only in saved_pars, delete them
        if id doesn't exist, create them!
        """
        to_create, to_update = [], []
        update_ids = []
        # handling major ledger as particular in income and expense entries!
        particulars_total = self.getParticularsTotal(updated_pars)
        majorLedgerParticularFound = False
        #
        for e in updated_pars:
            id = e.get("id")
            ledger_id = e.pop("ledger")
            e["ledger_id"] = ledger_id  #
            """
                if major ledger is already as particulars, 
                id of particular exists then goes for update 
                with updated_ledger_id (which may be changed or unchanged)
                this particular can't be changed in web, 
                so ledger_id will be same as existing major ledger id!
                using ledger id, we'll find one and update!
                else,
                needs to be created!
            """
            if ledger_id == exisiting_ledger_id:
                # update [only works for income and expense entries]
                e["ledger_id"] = updated_ledger_id
                particulars_total -= e.get("amount") or 0
                e["amount"] = particulars_total
                # remarks will be ""
                majorLedgerParticularFound = True
            if id:
                to_update.append(e)
                update_ids.append(id)
            else:
                to_create.append(e)
        if not majorLedgerParticularFound and updated_ledger_id:
            to_create.insert(
                0,
                {
                    "ledger_id": updated_ledger_id,
                    "amount": particulars_total,
                    "remarks": "",
                },
            )
        # print(to_create, to_update)
        return to_create, to_update, update_ids

    def getParticulars(self, entry, ParticularModel):
        pars = ParticularModel.objects.filter(entry=entry.id)
        pars = {par.id: par for par in pars}
        return pars

    class Meta:
        model = BaseEntry
        fields = "__all__"
