from django.db.models import Q
from django.db import transaction, IntegrityError
from django.utils import timezone

#
from rest_framework import serializers

#
from main.models.SchoolAdmin import SchoolAdmin
from main.models.FiscalYears import AcademicYear
from main.models.ClassInfo import ClassInfo, CLASS_DETAILS_FIELDS
from main.methods.academicYear import get_class_academic_year_id
from main.models.Student import Student
from main.models.Staff import Staff
from main.methods.nepaliDatetime import find_due_days, ndt_today
from main.serializers.LedgerSerializer import LedgerPostingSerializer
from main.constants.payment import LIBRARY_FINE

#
from ..models.Book import Book, BookCopy, BookIssue
from ..methods.guestSchools import borrower_school_ids


class BookEntrySerializer(serializers.ModelSerializer):
    class_info = serializers.IntegerField(required=False)
    #
    isbn_no = serializers.CharField(required=False)
    source = serializers.CharField(required=False)
    pages = serializers.IntegerField(required=False)
    #
    vendor = serializers.CharField(required=False)
    vendor_contact = serializers.CharField(required=False)
    call_no = serializers.CharField(required=False)
    corporate_author = serializers.CharField(required=False)
    #
    keywords = serializers.CharField(required=False)

    class Meta:
        model = Book
        fields = "__all__"

    def create(self, validated_data):
        with transaction.atomic():
            book = super().create(validated_data)
            quantity = book.quantity
            if book.quantity > 0:
                book_copies = [BookCopy(book=book) for _ in range(quantity)]
                BookCopy.objects.bulk_create(book_copies)
            return book

    # handle update manually to handle bookcopy instances!!!


class BookIssueSerializer(serializers.ModelSerializer):
    school = serializers.PrimaryKeyRelatedField(queryset=SchoolAdmin.objects.all())
    # student=serializers.PrimaryKeyRelatedField(queryset=...)
    # staff=serializers.PrimaryKeyRelatedField(queryset=...)
    returned_date = serializers.CharField(required=False, allow_null=True)

    class Meta:
        model = BookIssue
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        #
        data = kwargs.get("data", {})
        school_id = data.get("school")

        # students of the school itself + of every registered guest school.
        student_q = Q(class_info__school__in=borrower_school_ids(school_id))
        staff_q = Q(school=school_id)
        for field, model, query in [
            ("student", Student, student_q),
            ("staff", Staff, staff_q),
        ]:
            value = data.get(field)
            if value:
                self.fields[field] = serializers.PrimaryKeyRelatedField(
                    queryset=model.objects.filter(query), required=True
                )
            else:
                self.fields[field] = serializers.IntegerField(
                    required=False, allow_null=True
                )

    def validate(self, attrs):
        student = attrs.get("student")
        staff = attrs.get("staff")
        book_copy = attrs.get("book")

        if self.instance:
            return attrs
        # Custom validate for create only!
        if bool(student) == bool(staff):
            raise serializers.ValidationError(
                {"non_field_errors": ["Provide exactly one of: student or staff."]}
            )
        #
        if not (
            book_copy.is_active and not book_copy.is_lost and not book_copy.is_damaged
        ):
            raise serializers.ValidationError(
                f"The book with accession no. {book_copy.id} is unusable."
            )

        return attrs

    def create(self, validated_data):
        book_copy = validated_data["book"]

        try:
            with transaction.atomic():
                BookCopy.objects.select_for_update().get(id=book_copy.id)

                if BookIssue.objects.filter(
                    book=book_copy,
                    returned_date__isnull=True,
                    is_active=True,
                ).exists():
                    raise serializers.ValidationError(
                        f"The book with accession no. {book_copy.id} is already issued."
                    )

                issue = BookIssue.objects.create(**validated_data)
                return issue

        except IntegrityError:
            raise serializers.ValidationError(
                f"The book with accession no. {book_copy.id} is already issued."
            )


class BookIssueReturnSerializer(serializers.ModelSerializer):
    """
    This accepts instance so it'll trigger update by default.
    """

    id = serializers.IntegerField()
    school = serializers.PrimaryKeyRelatedField(
        queryset=SchoolAdmin.objects.only("id", "economic_year").all()
    )
    academic_year = serializers.IntegerField()
    due_date = serializers.CharField()
    is_damaged = serializers.BooleanField(default=False)
    is_lost = serializers.BooleanField(default=False)
    # editable damage/lost charge typed by the accountant at return time.
    damage_fine = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = BookIssue
        fields = "__all__"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        data = kwargs.get("data", {})
        school_id = data.get("school")

        self.fields["academic_year"] = serializers.PrimaryKeyRelatedField(
            queryset=AcademicYear.objects.only("id").filter(school=school_id)
        )

    def update(self, instance, validated_data):
        school = validated_data["school"]
        now = timezone.now()
        date = ndt_today()
        month = date[5:7]
        # The screen sends the academic year it is working in, and sends none
        # at all when it has none picked. That used to be a KeyError here: the
        # book could not be returned, by anyone, until somebody thought to pick
        # a year. A return needs the year only to post a student's fine, and
        # that fine belongs to the year the student's own class is running in.
        academic_year = validated_data.get("academic_year")
        academic_year_id = None
        student_id = None
        class_info_id = None
        economic_year = None
        try:
            month = int(month)
            student_id = instance.student
            class_info_id = instance.student.class_info_id
            academic_year_id = (
                academic_year.id if academic_year else self.classAcademicYearId(instance)
            )
            economic_year = school.economic_year_id
            # A guest school's student has no ledger here — the fine is
            # collected at the desk, never posted to this school's ledger.
            if instance.student.class_info.school_id != school.id:
                class_info_id = None
        except:
            pass

        # total fine = late fine + price-based (editable) damage/lost charge.
        total_fine_amount = self.calculate_fine_amount(instance, validated_data)
        # record the fine on the issue itself (students and staff alike).
        validated_data["fine_amount"] = total_fine_amount

        with transaction.atomic():
            if total_fine_amount > 0 and class_info_id and economic_year:
                """
                fine-amount ledger entry (students only)
                FROM: LedgerView.handleStudentLedgerPosting
                """
                """--- Posting ---"""
                ledger_posting_data = {
                    "months": [month],
                    "class_info": class_info_id,
                    "date": date,
                    "academic_year": academic_year_id,
                    "economic_year": economic_year,
                }
                studentLedgers = {
                    "student": student_id,
                    "details": {LIBRARY_FINE: total_fine_amount},
                    "total": total_fine_amount,
                }
                s = LedgerPostingSerializer(data=ledger_posting_data)
                if s.is_valid():
                    s.save(studentLedgers=studentLedgers)
            """ update book-copy if lost/damage """
            book_copy = instance.book
            book_copy.is_lost = validated_data["is_lost"]
            book_copy.is_damaged = validated_data["is_damaged"]
            book_copy.updated_at = now
            book_copy.save(update_fields=["is_lost", "is_damaged", "updated_at"])
            """ update book-issue """
            instance = super().update(instance, validated_data)
            # transaction.set_rollback(True)
            return instance

    def classAcademicYearId(self, instance):
        """The academic year the borrower's class is running in, by the mapping."""
        class_info = (
            ClassInfo.objects.filter(id=instance.student.class_info_id)
            .values(*CLASS_DETAILS_FIELDS, "school", "batch")
            .first()
        )
        if not class_info:
            return None
        return get_class_academic_year_id(class_info["school"], class_info)

    def get_library_preferences(self, instance):
        lib_prefs = (
            instance.book.book.library.preferences or {}
        )  # bookissue->bookcopy->book->library
        return (
            lib_prefs.get("fine_per_day", 0),
            lib_prefs.get("fine_on_damage", 0),
        )

    def calculate_fine_amount(self, instance, validated_data):
        is_lost = validated_data.get("is_lost")
        is_damaged = validated_data.get("is_damaged")
        returned_date = validated_data.get("returned_date")
        damage_fine = validated_data.get("damage_fine")
        due_date = instance.due_date

        total_fine = 0
        fine_per_day, _ = self.get_library_preferences(instance)

        # late fine — only charge for days past the due date.
        if fine_per_day and returned_date:
            due_days = find_due_days(due_date, returned_date)
            if due_days > 0:
                total_fine += fine_per_day * due_days

        # damage / lost charge — price-based; the accountant may override the
        # prefilled amount (lost = full price, damaged = half price).
        if is_lost or is_damaged:
            if damage_fine is not None:
                total_fine += max(0, int(damage_fine))
            else:
                price = getattr(instance.book.book, "price", 0) or 0
                total_fine += price if is_lost else price // 2

        return total_fine
