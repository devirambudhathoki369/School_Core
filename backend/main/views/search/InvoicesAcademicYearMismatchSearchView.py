from django.db.models import F

#
from rest_framework.response import Response

#
from account.auth.Authentication import AdminTokenAuthentication
from ...models.FiscalYears import AcademicYearMapping
from ..InvoiceViews import STUDENT_INVOICE_RETURN_FIELDS
from ..BaseViews import SecuredAPIView
from ..closing.AcademicYearCloseView import (
    AcademicYearClassSearchMixin,
    AcademicYearMismatchInvoicesQueryMixin,
)
from ...methods.genClassname import getClassDetails


class InvoicesAcademicYearMismatchView(
    SecuredAPIView,
    AcademicYearClassSearchMixin,
    AcademicYearMismatchInvoicesQueryMixin,
):
    authentication_classes = (AdminTokenAuthentication,)

    def post(self, request):
        school_id = request.data.get("school")
        if school_id:
            academic_year_mapping_id = request.data.get("id")
            classes_key_details = request.data.get("classes")
            academic_year = request.data.get("academic_year")
            search = request.data.get("search")
            search = True if search is None else search
            class_info_keys, classes_query = self.handleKeyDetails(classes_key_details)
            query = AcademicYearMapping.objects.filter(
                id=academic_year_mapping_id,
                academic_year=academic_year,
                key__in=class_info_keys,
            )
            if query.exists():
                classes = self.getClasses(school_id, classes_query)
                invoices = self.getInvoices(school_id, classes, academic_year)
                return Response(invoices)
        return self.RESPONSE__INVALID_REQUEST

    def getInvoices(self, school_id, class_ids, academic_year):
        invoices = self.getInvoicesQuery(school_id, class_ids, academic_year)
        invoices = invoices.annotate(
            academic_year_name=F("academic_year__name"),
        ).values(*STUDENT_INVOICE_RETURN_FIELDS, "invoice_id", "academic_year_name")
        invoices = self.formatTransactions(invoices)
        return invoices

    def formatTransactions(self, transactions):
        data = []
        for e in transactions.iterator():
            class_info_id = e.get("student__class_info__id")
            data.append(
                {
                    "id": e.get("id"),
                    "invoice_id": e.get("invoice_id"),
                    "academic_year_name": e.get("academic_year_name"),
                    "date": e.get("date"),
                    "student_id": e.get("student__id") or "",
                    "student_name": (
                        e.get("extra_info__name") or ""
                        if e.get("isCashReceipt")
                        else " ".join(
                            [
                                e.get(f"student__{field}_name") or ""
                                for field in ["first", "middle", "last"]
                            ]
                        )
                    ),
                    "class_name": self.cacheClassname(class_info_id),
                    "amount": e.get("total_paid") or 0,
                    "month": e.get("payment_month") or "",
                    "type": e.get("isCashReceipt"),
                }
            )
        return data

    classnames = {}

    def cacheClassname(self, class_info_id: int) -> str:
        if not class_info_id:
            return ""
        classname = self.classnames.get(class_info_id)
        if not classname:
            # print('generating class name!')
            [classname, _] = getClassDetails(class_info_id, False)
            self.classnames[class_info_id] = classname
        return classname
