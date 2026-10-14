from .BaseSerializers import BaseEntrySerializer
from ..models.ContraEntry import ContraEntry
from ..models.Particulars import ContraParticular


class ContraEntrySerializer(BaseEntrySerializer):
    class Meta:
        model = ContraEntry
        ParticularModel = ContraParticular
        fields = "__all__"
