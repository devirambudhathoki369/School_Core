from django.db.models import ForeignKey, JSONField, TextField, CASCADE

#
from ..BaseModel import BaseModel


class CharacterCertificate(BaseModel):
    serial_no = TextField()
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    student = ForeignKey("main.Student", on_delete=CASCADE, null=True, blank=True)
    data = JSONField(default=dict)
