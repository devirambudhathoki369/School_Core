from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView

#
from .BaseViews import BaseEntryView
from ..models.JournalEntry import JournalEntry
from ..models.Particulars import JournalParticular
from ..serializers.JournalEntrySerializer import JournalEntrySerializer


class JournalEntryView(SecuredAPIView, BaseEntryView):
    ID = 3
    Name = "Journal entry"
    EntryModel = JournalEntry
    ParticularModel = JournalParticular
    EntrySerializer = JournalEntrySerializer
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def get(self, request):
        return self.getEntries(request)

    def post(self, request):
        return self.save(request)
