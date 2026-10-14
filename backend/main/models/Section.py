from django.db.models import CASCADE, ForeignKey

#
from .BaseModel import BaseModel, CustomCharField


class Section(BaseModel):
    section = CustomCharField(min_length=1, max_length=25)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)

    def __str__(self) -> str:
        return f"{self.school.name} > Section : {self.section}"
