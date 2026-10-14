from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

from main.models.Fee import feeq
from main.serializers.FeeSerializer import FeeSerializer
from main.views.BaseViews import BaseSearchView

#
from rest_framework import status
from rest_framework.response import Response


class FeeSearchView(BaseSearchView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    """
    POST: api/search/fees from ledger_posting.jsx
    allowed search fields:
        - education_level, grade, faculty, [grade=11/12], section[all-grade], course, year, semester
    """
    # search fields
    RETURN_FIELDS = ("id", "title__id", "title__title", "title__months", "fee")

    #
    def post(self, request):
        school_id = request.data.get("school")
        # print(request.data)
        if school_id:
            sec = request.data.pop("section", None)
            items = feeq(request.data, sec, self.RETURN_FIELDS)
            # print(items.query)
            s = FeeSerializer(items, many=True)
            return Response(s.data, status=status.HTTP_200_OK)
        return self.RESPONSE__INVALID_REQUEST
