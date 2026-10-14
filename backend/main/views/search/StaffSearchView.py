from django.db.models import (
    Value,
    F,
    Q,
    OuterRef,
    Sum,
    DecimalField,
    Case,
    When,
    CharField,
)
from django.db.models.functions import Collate, Coalesce

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
    SuperAdminTokenAuthentication,
)
from drf_yasg.utils import swagger_auto_schema

from main.methods.bloodgroupQuery import bloodgroupQuery

#
from ..BaseViews import BaseSearchView
from ...models.Staff import Staff
from ...models.ClassPeriod import ClassPeriod
from ...models.Ledger import StaffLedger
from ...models.Invoice import StaffInvoice
from ...serializers.StaffSerializer import StaffSearchPayloadSerializer
from ...methods.nameConcat import nameConcat
from ...choices.BloodGroup import BLOOD_GROUP_CHOICES_DICT


class StaffSearchView(BaseSearchView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
        SuperAdminTokenAuthentication,
    )
    include_docs = True

    STRING_FIELDS = ("first_name", "middle_name", "last_name")
    # `role` only narrows the search when the caller sends it — `query()` skips
    # any field absent from the payload — so every existing caller is unchanged.
    FOREIGN_FIELDS = ("school", "role")
    RETURN_FIELDS = ("id", "name")

    @swagger_auto_schema(
        tags=["staffs"],
        operation_summary="advanced staff search",
        request_body=StaffSearchPayloadSerializer,
    )
    def post(self, request):
        school_id = request.data.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST

        EMPLOYEED = 1
        staff_status = request.data.get("status") or EMPLOYEED
        class_info_id = request.data.get("class_info")
        include_images = request.data.pop("include_images", False)
        include_rfid_card = request.data.pop("include_rfid_card", False)
        detailed = request.data.pop("detailed", False)
        contact = request.data.pop("contact", False)
        address = request.data.pop("address", False)
        finance = request.data.pop("finance", False)
        designation = request.data.pop("designation", False)
        include_balance = request.data.pop("include_balance", False)
        id_cards = request.data.pop("id_cards", False)
        ecoy = request.data.pop("economic_year", None)
        RETURN_FIELDS = tuple()

        q = self.query(
            fields=self.STRING_FIELDS, data=request.data, fieldType="string"
        ) & self.query(
            fields=self.FOREIGN_FIELDS, data=request.data, fieldType="foreign"
        )
        if class_info_id:
            class_period = (
                ClassPeriod.objects.filter(class_info=class_info_id, is_active=True)
                .values("teachers")
                .order_by("-id")
                .first()
            )
            if class_period:
                teacher_ids = class_period.get("teachers") or {}
                teacher_ids = list(teacher_ids.values())
                if len(teacher_ids) > 0:
                    q &= Q(id__in=teacher_ids)
        # The payroll pickers (the callers that ask for balances) also list
        # anyone who is NOT working here now but still holds a balance: a
        # teacher who left with two months unpaid is owed them all the same,
        # and a list of working staff alone left that money with no way to be
        # paid. Decided once the balance is known, below.
        owed_too = bool(include_balance) and not request.data.get("status")
        staffs = (
            Staff.objects.filter(q)
            .annotate(name=nameConcat())
            .order_by(Collate("name", "und-x-icu"))
        )
        if not owed_too:
            staffs = staffs.filter(status=staff_status)
        if finance:
            staffs = staffs.annotate(
                salary=F("other_info__basic_salary"),
                funds=F("other_info__funds"),
                grade=F("other_info__grade"),
                allowance=F("other_info__allowance"),
                extra=F("other_info__extra"),
                insurance=F("other_info__insurance"),
                pf_contrib=F("other_info__pf_contrib"),
                joined_date=F("other_info__joined_date"),
            )
            RETURN_FIELDS += (
                "salary",
                "funds",
                "grade",
                "allowance",
                "extra",
                "insurance",
                "pf_contrib",
                "joined_date",
            )
        if id_cards:
            contact = True
            address = True
            designation = True
            include_images = True
        if contact:
            RETURN_FIELDS += ("primary_contact", "secondary_contact")
        if address:
            staffs = staffs.annotate(address=F("location"))
            RETURN_FIELDS += ("address",)
        if designation:
            staffs = staffs.annotate(designation=F("role__role"))
            RETURN_FIELDS += ("designation",)
        if id_cards:
            staffs = staffs.annotate(
                birth_date=F("other_info__birth_date"),
                blood_group=bloodgroupQuery(),
                citizenship_no=F("other_info__citizenship_no"),
            )
            RETURN_FIELDS += ("birth_date", "blood_group", "citizenship_no")
        if include_balance:
            staffs = self._includeBalance(school_id, staffs, ecoy)
            if owed_too:
                staffs = staffs.filter(
                    Q(status=staff_status) | (Q(is_active=True) & ~Q(balance=0))
                )
            # `status` so the page can say who on the list has left
            RETURN_FIELDS += ("balance", "status")
        #
        if include_images:
            RETURN_FIELDS += ("image",)
        if include_rfid_card:
            RETURN_FIELDS += ("rfid_card",)
        if detailed:
            pass
        else:
            RETURN_FIELDS += self.RETURN_FIELDS
            staffs = staffs.values(*RETURN_FIELDS)
        return Response(staffs)

    def _includeBalance(self, school_id, staffs, economic_year):
        q = Q(
            school=school_id,
            staff=OuterRef("pk"),
            is_active=True,
            economic_year=economic_year,
        )
        ledger_total_sq = (
            StaffLedger.objects.filter(q)
            .values("staff_id")
            .annotate(total=Sum("total"))
            .values("total")[:1]
        )
        invoice_total_sq = (
            StaffInvoice.objects.filter(q)
            .values("staff_id")
            .annotate(total=Sum("total_paid"))
            .values("total")[:1]
        )
        # Everything withheld from a payment settles the salary exactly as
        # the cash does: TDS, and PF and insurance with it. This used to take
        # off the TDS alone, so a member of staff with PF withheld showed a
        # balance here that their own ledger, opened below, did not.
        deduction_total_sq = (
            StaffInvoice.objects.filter(q)
            .values("staff_id")
            .annotate(
                total=Sum(
                    Coalesce(F("total_deduction"), Value(0, output_field=DecimalField()))
                    + Coalesce(F("pf_deduction"), Value(0, output_field=DecimalField()))
                    + Coalesce(F("insurance_deduction"), Value(0, output_field=DecimalField()))
                )
            )
            .values("total")[:1]
        )
        return staffs.annotate(
            total_credit=Coalesce(ledger_total_sq, Value(0)),
            total_debit=Coalesce(invoice_total_sq, Value(0)),
            total_deductions=Coalesce(deduction_total_sq, Value(0)),
            balance=Coalesce(
                (F("total_credit") - F("total_debit") - F("total_deductions")),
                Value(0),
                output_field=DecimalField(),
            ),
        )
