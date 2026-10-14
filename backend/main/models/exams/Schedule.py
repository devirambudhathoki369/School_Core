from django.db.models import ForeignKey, JSONField, CASCADE

#
from ..BaseModel import BaseModel, CustomCharField


class ExamSchedule(BaseModel):
    exam = ForeignKey("main.Exam", on_delete=CASCADE)
    start_time = CustomCharField(min_length=3, max_length=10)
    end_time = CustomCharField(min_length=3, max_length=10)
    schedule = JSONField(default=dict)  # {subject: date, ...}
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)
