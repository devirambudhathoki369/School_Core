from .BaseSerializers import BaseEntrySerializer
from ..models.JournalEntry import JournalEntry
from ..models.Particulars import JournalParticular


class JournalEntrySerializer(BaseEntrySerializer):
    class Meta:
        model = JournalEntry
        ParticularModel = JournalParticular
        fields = "__all__"
