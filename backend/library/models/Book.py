from django.db.models import (
    IntegerField,
    TextField,
    BooleanField,
    ForeignKey,
    CASCADE,
)

#
from main.models.BaseModel import BaseModel, CustomCharField, _allow_empty
from customs.NepaliDateField import NepaliDateField


class Book(BaseModel):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    library = ForeignKey("library.Library", on_delete=CASCADE)
    entry_date = NepaliDateField()
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE, **_allow_empty)
    #
    title = CustomCharField(min_length=1, max_length=100)
    # Real catalogues carry spelled-out editions ("Twenty Seventh") and long
    # publisher lines, so these are wider than the original 10/50.
    edition = CustomCharField(min_length=2, max_length=20)
    place_and_publisher = CustomCharField(min_length=5, max_length=100)
    isbn_no = CustomCharField(min_length=5, max_length=20, **_allow_empty)
    source = CustomCharField(min_length=5, max_length=50, **_allow_empty)
    pages = IntegerField(**_allow_empty)
    quantity = IntegerField()
    # per-book price; drives the damage/lost fine since price varies per book.
    price = IntegerField(default=0)
    published_year = CustomCharField(min_length=4, max_length=4)
    #
    broad_subject = CustomCharField(min_length=1, max_length=100)
    geographical_descriptions = TextField(**_allow_empty)
    keywords = TextField()
    note = TextField(**_allow_empty)
    #
    vendor = CustomCharField(min_length=5, max_length=50, **_allow_empty)
    vendor_contact = CustomCharField(min_length=10, max_length=10, **_allow_empty)
    call_no = CustomCharField(min_length=10, max_length=10, **_allow_empty)
    personal_author = CustomCharField(min_length=5, max_length=50)
    corporate_author = CustomCharField(min_length=5, max_length=50, **_allow_empty)

    def __str__(self):
        return f"{self.title} by {self.personal_author}"


class BookCopy(BaseModel):
    """
    Physical representation of book
    """

    # id = accession_no
    book = ForeignKey(Book, on_delete=CASCADE)
    entry_date = NepaliDateField(**_allow_empty)
    is_lost = BooleanField(default=False)
    is_damaged = BooleanField(default=False)
    remarks = TextField(**_allow_empty)

    def __str__(self):
        return f"{self.book.title} [{self.id}]"


class BookIssue(BaseModel):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    student = ForeignKey("main.Student", on_delete=CASCADE, **_allow_empty)
    staff = ForeignKey("main.Staff", on_delete=CASCADE, **_allow_empty)
    book = ForeignKey(BookCopy, on_delete=CASCADE)  # accession_no i.e. BookCopy.id
    #
    issued_date = NepaliDateField()
    due_date = NepaliDateField()
    returned_date = NepaliDateField(**_allow_empty)
    # total fine charged at return (late fine + damage/lost charge); also posted
    # to the student ledger. Stored here so Fine Report / member history stay
    # book-linked without parsing ledgers.
    fine_amount = IntegerField(default=0)
    remarks = TextField(**_allow_empty)
