from django.db.models import JSONField, ForeignKey, CASCADE

#
from ..BaseModel import BaseModel, CustomCharField


class ExtraActivity(BaseModel):
    name = CustomCharField(min_length=2, max_length=100)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)


class ExtraActivityEntry(BaseModel):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)
    exam = ForeignKey("main.Exam", on_delete=CASCADE)
    student = ForeignKey("main.Student", on_delete=CASCADE)
    extra_activities = JSONField(
        default=list
    )  # JSONField {extra_activity_id: remarks/result}
