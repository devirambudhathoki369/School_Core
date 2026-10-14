from django.db.models import ForeignKey, IntegerField, JSONField, CASCADE

#
from ..BaseModel import BaseModel

#
RULES_TYPES = [(1, "Number System"), (2, "Grading System"), (4, "Division")]


class GradingRules(BaseModel):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    type = IntegerField(choices=RULES_TYPES)
    rules = JSONField(default=list)
