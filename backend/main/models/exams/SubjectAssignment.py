from django.db.models import JSONField, ForeignKey, CASCADE

#
from ..BaseModel import BaseModel


class SubjectAssignment(BaseModel):
    academic_year = ForeignKey("main.AcademicYear", on_delete=CASCADE)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)
    subject = ForeignKey("main.Subject", on_delete=CASCADE)
    students = JSONField(default=list)
