from .BaseSerializers import BaseEntrySerializer
from ..models.ExpenseEntry import ExpenseEntry
from ..models.Particulars import ExpenseParticular


class ExpenseEntrySerializer(BaseEntrySerializer):
    class Meta:
        model = ExpenseEntry
        ParticularModel = ExpenseParticular
        fields = "__all__"
