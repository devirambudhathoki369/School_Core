from django.test import TestCase
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken
from account.auth.context import users_context
from library.models.Book import Book, BookCopy, BookIssue
from library.models.Library import Library
from main.models.FiscalYears import AcademicYearMapping
from main.models.Ledger import StudentLedger
from main.methods.academicYear import gen_class_key
from main.models.ClassInfo import ClassInfo, CLASS_DETAILS_FIELDS
from main.test_invoice_audit import AuditSchoolWithStudent


class BookReturnWithoutAYearTests(AuditSchoolWithStudent, TestCase):
    """A book can be returned when the screen sends no academic year.

    The return screen sends the academic year it is working in, and none at all
    when it has none picked. The serializer read it with [] and the return
    failed with a 500 for as long as that was so: five tries in three minutes
    on 2083-06-26. The year is needed only to post a student's fine, and that
    fine belongs to the year the student's own class is running in.
    """

    def setUp(self):
        self.addCleanup(users_context.set, None)
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.objects.create(user=self.admin).key}"
        )
        library = Library.objects.create(school=self.school, name="Main", preferences={"fine_per_day": 5})
        book = Book.objects.create(
            school=self.school, library=library, entry_date="2083-01-01", title="Muna Madan",
            edition="1st", place_and_publisher="Kathmandu, Sajha", quantity=1, price=200,
            published_year="2070", broad_subject="Literature", keywords="poem",
            personal_author="Laxmi Prasad Devkota",
        )
        self.copy = BookCopy.objects.create(book=book)
        self.issue = BookIssue.objects.create(
            school=self.school, student=self.student, book=self.copy,
            issued_date="2083-05-01", due_date="2083-05-10",
        )
        details = ClassInfo.objects.filter(id=self.ten.id).values(*CLASS_DETAILS_FIELDS).first()
        AcademicYearMapping.objects.create(
            school=self.school, key=gen_class_key(details), academic_year=self.ay,
        )

    def give_back(self, **extra):
        return self.client.put("/library/books/issue", {
            "action": "return", "id": self.issue.id, "school": self.school.id,
            "returned_date": "2083-05-14", "is_lost": False, "is_damaged": False, **extra,
        }, format="json")

    def test_the_book_comes_back_and_the_fine_goes_to_the_class_year(self):
        done = self.give_back()
        self.assertEqual(done.status_code, 200, done.content)
        issue = BookIssue.objects.get(id=self.issue.id)
        self.assertEqual((issue.returned_date, issue.fine_amount), ("2083-05-14", 20))  # 4 days late
        fine = StudentLedger.objects.get(student=self.student)
        self.assertEqual((fine.academic_year, fine.total, fine.details["lib_fine"]), (self.ay, 20, 20))

    def test_a_year_that_is_sent_is_still_the_one_used(self):
        done = self.give_back(academic_year=self.ay.id)
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(StudentLedger.objects.get(student=self.student).academic_year, self.ay)
