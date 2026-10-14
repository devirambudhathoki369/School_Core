from account.auth.Authentication import AdminTokenAuthentication
from main.views.BaseViews import SecuredAPIView

#
from .BaseViews import BaseEntryView
from ..models.ContraEntry import ContraEntry
from ..models.Particulars import ContraParticular
from ..serializers.ContraEntrySerializer import ContraEntrySerializer


class ContraEntryView(SecuredAPIView, BaseEntryView):
    ID = 4
    Name = "Contra entry"
    EntryModel = ContraEntry
    ParticularModel = ContraParticular
    EntrySerializer = ContraEntrySerializer
    authentication_classes = (AdminTokenAuthentication,)

    def get(self, request):
        return self.getEntries(request)

    def post(self, request):
        return self.save(request)
