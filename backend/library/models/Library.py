from django.db.models import JSONField, TextField, ForeignKey, CASCADE

#
from main.models.BaseModel import BaseModel, CustomCharField, _allow_empty


class Library(BaseModel):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    name = CustomCharField(min_length=2, max_length=25)
    address = CustomCharField(min_length=2, max_length=50, **_allow_empty)
    contacts = TextField(**_allow_empty)
    preferences = JSONField(default=dict)

    def __str__(self):
        return f"{self.school.name} > {self.name}"


class LibraryGuestSchool(BaseModel):
    """
    Schools whose students/staff this school's library is allowed to serve.

    A school may lend its books to another school's students (e.g. schools of
    the same foundation sharing one physical library). The host school adds the
    guest schools here (Library > Book Issue/Return > Guest schools) and their
    students then show up in the library's borrower search.
    """

    school = ForeignKey(
        "main.SchoolAdmin", on_delete=CASCADE, related_name="library_guest_schools"
    )
    guest_school = ForeignKey(
        "main.SchoolAdmin", on_delete=CASCADE, related_name="library_host_schools"
    )

    class Meta:
        unique_together = ("school", "guest_school")

    def __str__(self):
        return f"{self.school_id} serves {self.guest_school_id}"
