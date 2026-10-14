from django.db.models import IntegerField, TextField, ForeignKey, CASCADE

#
from .BaseModel import BaseModel

SMS_TEMPLATE_TYPES = [
    (1, "DUES"),
    (2, "Payment"),
    (3, "Result"),
    (4, "Attendance"),
    (5, "Birthday"),
    # 6 is reserved: the frontend uses it for the "letter to students" place
    # values, which are composed per letter and never stored as a template.
    (7, "Staff Birthday"),
]

# Named so the senders never repeat the raw integers.
TEMPLATE_TYPE_DUES = 1
TEMPLATE_TYPE_PAYMENT = 2
TEMPLATE_TYPE_RESULT = 3
TEMPLATE_TYPE_ATTENDANCE = 4
TEMPLATE_TYPE_BIRTHDAY = 5
TEMPLATE_TYPE_STAFF_BIRTHDAY = 7


class SMSTemplate(BaseModel):
    type = IntegerField(choices=SMS_TEMPLATE_TYPES)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    template = TextField()
