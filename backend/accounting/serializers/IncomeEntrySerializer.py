from .BaseSerializers import BaseEntrySerializer
from ..models.IncomeEntry import IncomeEntry
from ..models.Particulars import IncomeParticular


class IncomeEntrySerializer(BaseEntrySerializer):
    class Meta:
        model = IncomeEntry
        ParticularModel = IncomeParticular
        fields = "__all__"
