from django.db.models import Q, JSONField
from django.db.models.expressions import RawSQL

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView
from ...models.Invoice import StudentInvoice, cashier_sq
from ..utils.StaffMap import StaffMap
from ...methods.getDateRange import getDateRange
from ...methods.nameConcat import nameConcat
from ...methods.getFeeDetails import getFeeTitlesOfSchool
from ...methods.genClassname import getClassDetails

discount_details_sql = """
  COALESCE(
    (
      SELECT jsonb_object_agg(e.key, (e.value->>'dis')::int)
      FROM jsonb_each(details) AS e(key, value)
      WHERE e.value ? 'dis' AND (e.value->>'dis') ~ '^-?\\d+$'
    ),
    '{}'::jsonb
  )
"""


class PaymentDiscountReportView(SecuredAPIView, StaffMap):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def post(self, request):
        school_id = request.data.get("school")
        acay_id = request.data.get("academic_year")
        from_date = request.data.get("from_date")
        to_date = request.data.get("to_date")

        if school_id and acay_id:
            query = Q(
                school=school_id,
                academic_year=acay_id,
                is_active=True,
                isCashReceipt=False,
                total_discount__gt=0,
            )
            if from_date and to_date:
                date_range = getDateRange(from_date, to_date)
                query &= Q(date__range=date_range)

            qs = (
                StudentInvoice.objects.filter(query)
                .annotate(
                    name=nameConcat("student"),
                    discount_details=RawSQL(
                        discount_details_sql, [], output_field=JSONField()
                    ),
                    cashier=cashier_sq(),
                )
                .order_by("date")
                .values(
                    "id",
                    "invoice_id",
                    "date",
                    "name",
                    "student__class_info",
                    "total_discount",
                    "discount_details",
                    "cashier",
                )
            )

            staffs = self.getSchoolStaffsMapped(school_id)
            titles = getFeeTitlesOfSchool(school_id)

            for e in qs:
                [_classname, _] = getClassDetails(e.pop("student__class_info"))
                e["classname"] = _classname
                #
                e["cashier"] = staffs.get(e.pop("cashier"))

            return Response(
                {
                    "data": qs,
                    "titles": titles,
                }
            )
        return self.RESPONSE__INVALID_REQUEST
