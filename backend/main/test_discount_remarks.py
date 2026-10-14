from django.test import TestCase
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken
from account.auth.context import users_context
from main.models.Student import StudentDiscountInfo
from main.test_invoice_audit import AuditSchoolWithStudent


class DiscountRemarksTests(AuditSchoolWithStudent, TestCase):
    """A discount note longer than its column is refused in words.

    The note is a varchar(50) and the serializer set no limit: a longer one
    passed validation, the save failed, and the school got a 500. One person
    tried the same save seven times in three minutes on 2083-06-26.
    """

    def setUp(self):
        self.addCleanup(users_context.set, None)
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.objects.create(user=self.admin).key}"
        )
        self.discount = StudentDiscountInfo.objects.create(
            student=self.student, school=self.school, discount=100, percentage=0,
            academic_year=self.ay,
        )

    def save(self, remarks):
        return self.client.put("/api/students/discounts", {
            "id": self.discount.id, "student": self.student.id, "school": self.school.id,
            "discount": "100", "percentage": "0", "remarks": remarks,
        }, format="json")

    def test_a_long_note_is_refused_with_the_reason(self):
        refused = self.save("x" * 51)
        self.assertEqual(refused.status_code, 400)
        self.assertIn("at most 50 characters", refused.json()["message"])
        self.assertIsNone(StudentDiscountInfo.objects.get(id=self.discount.id).remarks)

    def test_a_note_that_fits_is_saved(self):
        self.assertEqual(self.save("x" * 50).status_code, 200)
        self.assertEqual(StudentDiscountInfo.objects.get(id=self.discount.id).remarks, "x" * 50)

    def test_a_long_note_on_a_new_discount_is_refused_too(self):
        StudentDiscountInfo.objects.all().delete()
        refused = self.client.post("/api/students/discounts", {
            "student": self.student.id, "school": self.school.id, "title": "tn",
            "discount": "100", "percentage": "0", "remarks": "y" * 80,
        }, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("at most 50 characters", refused.json()["message"])
        self.assertEqual(StudentDiscountInfo.objects.count(), 0)
