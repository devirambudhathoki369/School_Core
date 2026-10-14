from rest_framework.response import Response
from django.db.models import Q, Sum, ExpressionWrapper, F, DecimalField

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from ..BaseViews import SecuredAPIView
from ...models.Invoice import StudentInvoice
from ...models.Ledger import StudentLedger
from ...models.ClassInfo import ClassInfo
from ...methods.genClassname import getClassDetails
from ...methods.getDateRange import getDateRange

STATUS_RUNNING = 1


class RemainingDuesView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    swagger_schema = None
    SCI = "student__class_info"

    def getOverallRemainingDues(self, school_id: int, q):
        """
        - get english date range using nepali current year
            - (2080) -> [1st of baisakh 2080, last of chaitra 2080] (both converted to english date)
        - get all students->id of the school
        - use student ids to get ledgers and invoices
            - ledger -> total, student__class_info
            - invoice -> total__paid, student__class_info
        """
        #
        q &= Q(school=school_id)
        ledgers = (
            StudentLedger.objects.filter(q, ledger_posting__is_active=True)
            .values(self.SCI)
            .annotate(debit_amount=Sum("total"))
            .order_by(self.SCI)
        )
        invoices = (
            StudentInvoice.objects.filter(q, isCashReceipt=False)
            .values(self.SCI)
            .annotate(
                net_paid=ExpressionWrapper(
                    F("total_paid") + F("total_discount"), output_field=DecimalField()
                ),
                credit_amount=Sum("net_paid"),
            )
            .order_by(self.SCI)
        )
        #
        self.data = {}
        self.class_ids = set()
        self.addClassAmount(ledgers, "debit_amount")
        self.addClassAmount(invoices, "credit_amount")
        self.addClassnames(school_id)
        return self.data

    def addClassAmount(self, qdata: list, amountkey: str) -> dict:
        for each in qdata:
            class_id = each.get(self.SCI)
            amount = each.get(amountkey) or 0
            if class_id in self.data:
                if amountkey in self.data[class_id]:
                    self.data[class_id][amountkey] += amount
                else:
                    self.data[class_id][amountkey] = amount
            else:
                self.data[class_id] = {amountkey: amount}
                self.class_ids.add(class_id)
        return self.data

    def addClassnames(self, school_id):
        """Attach each class's name to its own row (WITHOUT re-keying the data).

        The report used to be labelled entirely from the client's class list, so
        a class that list did not contain — one that has since been deactivated,
        or simply a list that had not finished loading — was dropped from the
        table AND from the Total, quietly under-reporting the school's dues
        against Overall Student Ledgers, which counts those same students. The
        name travels with the row so every class the aggregation found can be
        shown. Deactivated class rows are named too: their dues are real.
        """
        classes = ClassInfo.objects.filter(
            id__in=self.class_ids, school=school_id
        ).select_related("section", "course")
        for cls in classes:
            row = self.data.get(cls.id)
            if row is not None:
                [class_name, _] = getClassDetails(cls.id, False, True, False, cls)
                row["classname"] = class_name

    def setClassnamesToData(self, school_id):
        """
        - Fetches class information for all class IDs present in `self.class_ids`.
        - Maps class IDs to their respective class details (e.g., class name).
        - Updates `self.data` to use class names as keys instead of class IDs.
        """
        classes = {
            e.id: e
            for e in ClassInfo.objects.filter(
                id__in=self.class_ids, school=school_id
            ).select_related(
                "section",
                "course",
            )
        }

        named_data = {}
        for class_id, value in list(self.data.items()):
            class_info_instance = classes.get(class_id)
            if class_info_instance:
                [class_name, _] = getClassDetails(
                    None, False, True, False, class_info_instance
                )
                named_data[class_name] = value
        self.data = named_data

    def post(self, request):
        school_id = request.data.pop("school", None)
        academic_year = request.data.pop("academic_year", None)
        if school_id and academic_year:
            start_date = request.data.pop("from", None)
            end_date = request.data.pop("to", None)
            status = request.data.get("status") or STATUS_RUNNING

            # Overall Student Ledgers counts only students that still exist
            # (`is_active=True`); a soft-deleted student's dues showing up here
            # and nowhere else is exactly the kind of drift that makes the two
            # reports disagree. Same scope, same answer.
            q = Q(is_active=True, student__status=status, student__is_active=True)
            q &= Q(academic_year=academic_year)
            if start_date and end_date:
                date_range = getDateRange(start_date, end_date)
                q &= Q(date__range=date_range)

            dues = self.getOverallRemainingDues(school_id, q)
            if dues:
                return Response(dues)
            return self.RESPONSE__NOT_FOUND
        return self.RESPONSE__INVALID_REQUEST
