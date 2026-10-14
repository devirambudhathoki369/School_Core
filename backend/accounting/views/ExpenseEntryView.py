from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView

#
from .BaseViews import BaseEntryView
from ..models.ExpenseEntry import ExpenseEntry
from ..models.Particulars import ExpenseParticular
from ..serializers.ExpenseEntrySerializer import ExpenseEntrySerializer


class ExpenseEntryView(SecuredAPIView, BaseEntryView):
    ID = 2
    Name = "Expense entry"
    EntryModel = ExpenseEntry
    ParticularModel = ExpenseParticular
    EntrySerializer = ExpenseEntrySerializer
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def get(self, request):
        return self.getEntries(request)

    def post(self, request):
        return self.save(request)
