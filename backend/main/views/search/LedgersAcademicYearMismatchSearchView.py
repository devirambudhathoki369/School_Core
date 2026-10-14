from django.db.models import F

#
from rest_framework.response import Response

#
from account.auth.Authentication import AdminTokenAuthentication
from ...models.FiscalYears import AcademicYearMapping
from ..BaseViews import SecuredAPIView
from ..closing.AcademicYearCloseView import (
    AcademicYearClassSearchMixin,
    AcademicYearMismatchLedgersQueryMixin,
)
from ...methods.genClassname import getClassDetails
from ...methods.nameConcat import nameConcat


class LedgersAcademicYearMismatchView(
    SecuredAPIView,
    AcademicYearClassSearchMixin,
    AcademicYearMismatchLedgersQueryMixin,
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
                invoices = self.getLedgers(school_id, classes, academic_year)
                return Response(invoices)
        return self.RESPONSE__INVALID_REQUEST

    def getLedgers(self, school_id, class_ids, academic_year):
        ledgers = self.getLedgersQuery(school_id, class_ids, academic_year)
        ledgers = ledgers.annotate(
            posting_no=F("ledger_posting"),
            academic_year_name=F("academic_year__name"),
            student_name=nameConcat("student"),
        ).values(
            "posting_no",
            "date",
            "academic_year_name",
            "student_name",
            "student__class_info",
        )
        ledgers = self.formatLedgers(ledgers)
        return ledgers

    def formatLedgers(self, ledgers):
        return [
            {
                "class_name": self.cacheClassname(e.pop("student__class_info")),
                **e,
            }
            for e in ledgers
        ]

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
