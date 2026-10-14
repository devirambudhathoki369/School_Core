from django.db.models import IntegerField, CharField, TextField, ForeignKey, CASCADE

#
from .BaseModel import BaseModel, _allow_empty
from customs.NepaliDateField import NepaliDateField

CALENDAR_EVENT_TYPES = (
    (1, "Public Holiday"),
    (2, "Exam"),
    (3, "Result"),
    (4, "Event Day"),
    (5, "Vacation"),
)
CALENDAR_EVENT_COLORS = (
    ("#008000", "Green"),
    ("#FF0000", "Red"),
    ("#0000FF", "Blue"),
    ("#FFFF00", "Yellow"),
    ("#800080", "Purple"),
)


class CalendarEvent(BaseModel):
    start_date = NepaliDateField()
    end_date = NepaliDateField()
    type = IntegerField(choices=CALENDAR_EVENT_TYPES)
    color = CharField(max_length=7, choices=CALENDAR_EVENT_COLORS)
    description = TextField(**_allow_empty)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
