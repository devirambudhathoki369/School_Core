from django.db.models import JSONField
from .BaseModel import BaseModel, CustomCharField
from ..constants.name_sizes import FULL_NAME_CONFIG
from customs.NepaliDateField import NepaliDateField


class SchoolFoundation(BaseModel):
    name = CustomCharField(min_length=5, max_length=100)
    contact = CustomCharField(min_length=10, max_length=10)
    address = CustomCharField(min_length=2, max_length=50)
    ceo = CustomCharField(**FULL_NAME_CONFIG)
    estd_date = NepaliDateField()
    shareholders = JSONField(default=list)  # [{name, contact}]
