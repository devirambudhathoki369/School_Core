from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView

#
from .BaseViews import BaseEntryView
from ..models.IncomeEntry import IncomeEntry
from ..models.Particulars import IncomeParticular
from ..serializers.IncomeEntrySerializer import IncomeEntrySerializer


class IncomeEntryView(SecuredAPIView, BaseEntryView):
    ID = 1
    Name = "Income entry"
    EntryModel = IncomeEntry
    ParticularModel = IncomeParticular
    EntrySerializer = IncomeEntrySerializer
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def get(self, request):
        return self.getEntries(request)

    def post(self, request):
        return self.save(request)
