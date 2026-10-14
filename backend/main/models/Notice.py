from django.db.models import TextField, ImageField, ForeignKey, CASCADE


#
from .BaseModel import BaseModel, CustomCharField
from customs.NepaliDateField import NepaliDateField
from ..methods.nepaliDatetime import ndt_today


class Notice(BaseModel):
    title = CustomCharField(min_length=2, max_length=50)
    description = TextField()
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    date = NepaliDateField(default=ndt_today)
    image = ImageField(upload_to="notices", null=True, blank=True)
