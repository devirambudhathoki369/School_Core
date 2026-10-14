from django.db.models import Q, F

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView
from ...models.Ledger import StudentLedger
from ...models.Fee import FeeTitle
from ...methods.getDateRange import getDateRange
from ...methods.nameConcat import nameConcat
from ..fields import FOREIGN_CLASS_DETAILS_FIELDS, CHOICES_CLASS_DETAILS_FIELDS
from ...constants.payment import EXCEPTION_TITLES_ALTERNATIVES


class LedgerPostingHistoryView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def post(self, request):
        school_id = request.data.get("school")
        start_date = request.data.get("start_date")
        end_date = request.data.get("end_date")
        student_status = request.data.get("student_status")
        status = request.data.get("status") or True
        status = self.getBooleanValue(status)
        includes_education_level = "education_level" in request.data
        # View postings by the fee MONTHS they cover, not just created date.
        # `months` = list of month numbers (match any).
        months = request.data.get("months") or request.data.getlist("months[]")
        if isinstance(months, (int, str)):
            months = [months]

        if school_id:
            q = Q(school=school_id, is_active=status)

            if start_date and end_date:
                date_range = getDateRange(start_date, end_date)
                q &= Q(date__range=date_range)
            if student_status:
                q &= Q(student__status=student_status)
            if months:
                month_q = Q()
                for m in months:
                    try:
                        month_q |= Q(ledger_posting__months__contains=[int(m)])
                    except (TypeError, ValueError):
                        continue
                if month_q:
                    q &= month_q

            if includes_education_level:
                class_query = self.byClassInfoQuery(
                    school_id,
                    request.data,
                    False,
                    "ledger_posting__class_info",
                )
                q &= class_query

            items = (
                StudentLedger.objects.filter(q)
                .annotate(
                    student_name=nameConcat("student"),
                    student_class=F("student__class_info"),
                    months=F("ledger_posting__months"),
                )
                .values(
                    "id",
                    "student_name",
                    "student_class",
                    "details",
                    "total",
                    "date",
                    "months",
                )
                .order_by("id")
            )

            fee_titles = []
            if items:
                fee_titles = FeeTitle.objects.filter(
                    school=school_id,
                    is_active=True,
                    isCashReceipt=False,
                ).values("id", "title")
                fee_titles = list(fee_titles)
                fee_titles.extend(
                    [
                        {"id": id, "title": title}
                        for id, title in EXCEPTION_TITLES_ALTERNATIVES.items()
                    ]
                )

            return Response(
                {
                    "data": items,
                    "fee_titles": fee_titles,
                }
            )

        return self.RESPONSE__INVALID_REQUEST

    def byClassInfoQuery(self, school_id, data, useNull=True, parent="class_info"):
        return (
            self.query(
                fields=FOREIGN_CLASS_DETAILS_FIELDS,
                data=data,
                fieldType="foreign",
                parent=parent,
                useNull=useNull,
            )
            & self.query(
                fields=CHOICES_CLASS_DETAILS_FIELDS,
                data=data,
                fieldType="choices",
                parent=parent,
                useNull=useNull,
            )
            & Q(**{self.key("foreign", "school", parent): school_id})
        )
