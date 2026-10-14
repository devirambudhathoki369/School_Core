from django.db.models.aggregates import Sum
from django.db.models.functions import Cast
from django.db.models import FloatField, F

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    SuperAdminTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView
from ...models.Ledger import StudentLedger


class ClasswiseOldDuesView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, SuperAdminTokenAuthentication)

    def getClasswiseOldDues(self, school_id):
        ledgers = (
            StudentLedger.objects.filter(
                school=school_id,
                is_active=True,
                details__has_key="od",
                ledger_posting__is_active=True,
            )
            .annotate(
                class_info=F("student__class_info"),
                total_dues=Sum(
                    Cast(
                        F("details__od"),
                        output_field=FloatField(),
                    )
                ),
            )
            .order_by("class_info")
            .values("class_info", "total_dues")
        )
        # print(ledgers)
        total = sum([e.get("total_dues") for e in ledgers])
        return {"data": ledgers, "total": total}

    def get(self, request):
        school_id = request.query_params.get("school")
        if school_id:
            data = self.getClasswiseOldDues(school_id)
            return Response(data)
        return Response({"message": "Invalid request"})
