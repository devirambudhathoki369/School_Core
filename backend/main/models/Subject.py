"""
Subject is either partitioned as th and pr or just normal.
Normal subject : English
Paritioned subject : English (Theory) and English (Practical)
Partitioned subjects:
    ... Mostly seen in 9, 10, 11, 12, and further classess,
    They have different subject-name, subject-code and credit-hours for th and pr.
How i've modified subject?
At first, they were just normal subject,
So, I added code_pr, subject_pr, credit_hours_pr for practical, theory will be stored as normal value.
THIS will work for normal and partitioned subject.
"""

from .BaseModel import BaseModel, CustomCharField

#
from django.db.models import (
    IntegerField,
    DecimalField,
    ForeignKey,
    BooleanField,
    CASCADE,
)


SUBJECT_TYPES = [(1, "compulsory"), (2, "optional")]
CREDIT_HOURS_CONFIGS = {"max_digits": 4, "decimal_places": 2}


class Subject(BaseModel):
    type = IntegerField(choices=SUBJECT_TYPES, default=1)
    order = IntegerField(default=0)
    # theoretical or common;
    code = CustomCharField(min_length=2, max_length=10, null=True, blank=True)
    subject = CustomCharField(min_length=2, max_length=50)
    credit_hours = DecimalField(**CREDIT_HOURS_CONFIGS)
    # practical;
    code_pr = CustomCharField(min_length=2, max_length=10, null=True, blank=True)
    subject_pr = CustomCharField(min_length=2, max_length=50, null=True, blank=True)
    credit_hours_pr = DecimalField(**CREDIT_HOURS_CONFIGS, null=True, blank=True)
    # When True this subject can NEVER be (soft-)deleted, regardless of whether
    # it is referenced elsewhere. Used to lock curriculum subjects (e.g. GK) that
    # admins keep accidentally removing even before any results/homework exist.
    is_protected = BooleanField(default=False)
    #
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)

    def __str__(self) -> str:
        return f"{self.school.name} > Subject : {self.subject}"
