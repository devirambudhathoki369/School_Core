"""Phase 5: the school admin's screens (mobile/SPEC.md §5, §8)."""
from decimal import Decimal

from django.test import TestCase

from main.methods.nepaliDatetime import ndt_today
from main.models.Attendance import ClassAttendance, StaffAttendance, StudentAttendance
from main.models.Fee import FeeTitle
from main.models.Guardian import Guardian, StudentGuardian
from main.models.Invoice import StudentInvoice
from main.models.Ledger import LedgerPosting, StudentLedger
from main.views.LedgerViews import LedgerView
from mobileapi.guardians import FAMILY_ALPHABET
from mobileapi.models import AppSession, FamilyCode
from mobileapi.tokens import code_hash

from .helpers import MobileFixtures, MobileTestMixin, WriteMixin, session_token

TODAY = ndt_today()


class AdminFixtures(MobileTestMixin, WriteMixin):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)
        cls.admin_token = session_token(AppSession.ADMIN, cls.admin_account, cls.school)
        cls.other_admin_token = session_token(AppSession.ADMIN, cls.other.account, cls.other)
        cls.staff_token = session_token(AppSession.STAFF, cls.staff_account, cls.school)
        cls.far = MobileFixtures.student(cls.other, "Dev", last_name="Lama", phone="9833333333")
        title = FeeTitle.objects.create(title="Tuition fee", school=cls.school)
        posting = LedgerPosting.objects.create(academic_year=cls.school.year, economic_year=cls.year,
                                               class_info=cls.school.klass, months=[7])
        for child, billed in ((cls.student, "1500"), (cls.sibling, "1000")):
            StudentLedger.objects.create(academic_year=cls.school.year, economic_year=cls.year, student=child,
                                         school=cls.school, ledger_posting=posting, total=Decimal(billed),
                                         details={str(title.id): billed}, date="2083-07-01")
        StudentInvoice.objects.create(
            invoice_id=7, date=TODAY, details={str(title.id): {"amt": "600", "dis": "100", "due": "800"}},
            total_paid=Decimal("500"), total_discount=Decimal("100"), total_due=Decimal("800"), payment_month=7,
            school=cls.school, mode=1, academic_year=cls.school.year, economic_year=cls.year, student=cls.student,
            class_info=cls.school.klass,
        )


class AdminScreenTests(AdminFixtures, TestCase):
    def test_only_the_school_admin_opens_admin_screens(self):
        for path in ("admin/dashboard", "admin/students", f"admin/students/{self.student.id}", "admin/fees/dues",
                     "admin/fees/collections", "admin/staff", "admin/staff/attendance", "admin/guardian-links"):
            self.assertEqual(self.get(path, self.staff_token).status_code, 403, path)

    def test_the_dashboard_counts_today(self):
        day = ClassAttendance.objects.create(date=TODAY, class_info=self.school.klass, school=self.school)
        StudentAttendance.objects.create(class_attendance=day, student=self.student, status=True, reason="")
        StudentAttendance.objects.create(class_attendance=day, student=self.sibling, status=False, reason="")
        StaffAttendance.objects.create(date=TODAY, staff=self.staff, status=True, school=self.school, reason="")
        body = self.get("admin/dashboard", self.admin_token).json()
        self.assertEqual(body["students"], {"total": 2, "present": 1, "absent": 1})
        self.assertEqual(body["staff"], {"total": 1, "present": 1, "absent": 0})
        self.assertEqual(body["collected"]["amount_paisa"], 50000)
        self.assertEqual(body["collected"]["receipts"], 1)
        # billed 2500, paid 500 and discounted 100
        self.assertEqual(body["dues_paisa"], 190000)

    def test_dues_by_class_agree_with_the_fees_counter(self):
        body = self.get(f"admin/fees/dues?class={self.school.klass.id}", self.admin_token).json()
        dues = {row["name"]: row["due_paisa"] for row in body["students"]}
        for child in (self.student, self.sibling):
            counter = LedgerView().mergeStudentLedgers(child.id, self.school.klass.id, self.school.id,
                                                       self.school.year.id)
            self.assertEqual(dues[f"{child.first_name} {child.last_name}"], int(counter["total"] * 100))
        self.assertEqual(body["classes"][0]["owing"], 2)

    def test_students_are_found_by_name_in_this_school_only(self):
        items = self.get("admin/students?q=asha", self.admin_token).json()["items"]
        self.assertEqual([i["id"] for i in items], [self.student.id])
        self.assertEqual(self.get("admin/students?q=dev", self.admin_token).json()["items"], [])
        self.assertEqual(self.get(f"admin/students/{self.far.id}", self.admin_token).status_code, 404)

    def test_a_student_shows_their_parents_and_dues(self):
        body = self.get(f"admin/students/{self.student.id}", self.admin_token).json()
        self.assertEqual([(g["name"], g["state"]) for g in body["guardians"]], [("Hari Pun", "linked")])
        self.assertEqual(body["dues"]["total_paisa"], 90000)

    def test_collections_for_a_range(self):
        body = self.get(f"admin/fees/collections?from={TODAY}&to={TODAY}", self.admin_token).json()
        self.assertEqual((body["total_paisa"], body["days"]), (50000, [{"date": TODAY, "amount_paisa": 50000}]))
        self.assertEqual(body["by_mode"][0]["label"], "cash")

    def test_staff_attendance_for_a_day(self):
        StaffAttendance.objects.create(date=TODAY, staff=self.staff, status=True, school=self.school, reason="")
        body = self.get("admin/staff/attendance", self.admin_token).json()
        self.assertEqual([(i["name"], i["status"]) for i in body["items"]], [("Sita Rai", "present")])


class ParentLinkTests(AdminFixtures, TestCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.shared = Guardian.objects.create(school=cls.school, phone="9844444444", name="Shared number")
        cls.review = StudentGuardian.objects.create(student=cls.sibling, guardian=cls.shared,
                                                    relation=StudentGuardian.GUARDIAN,
                                                    state=StudentGuardian.NEEDS_REVIEW,
                                                    source=StudentGuardian.FROM_RECORD)

    def decide(self, decision, token=None, link=None):
        return self.write("post", f"admin/guardian-links/{(link or self.review).id}/decide", {"decision": decision},
                          token or self.admin_token)

    def test_links_to_review_are_listed_and_confirmed(self):
        items = self.get("admin/guardian-links", self.admin_token).json()["items"]
        self.assertEqual([(i["guardian"]["phone"], i["student"]["id"]) for i in items],
                         [("9844444444", self.sibling.id)])
        answer = self.decide("confirm")
        self.assertEqual(answer.status_code, 200, answer.content)
        self.review.refresh_from_db()
        self.assertEqual(self.review.state, StudentGuardian.LINKED)
        self.assertIsNotNone(self.review.decided_at)

    def test_a_link_can_be_rejected(self):
        self.decide("reject")
        self.review.refresh_from_db()
        self.assertEqual(self.review.state, StudentGuardian.REJECTED)

    def test_a_whole_number_is_decided_at_once(self):
        office = Guardian.objects.create(school=self.school, phone="9866666666", name="Hostel office")
        links = [
            StudentGuardian.objects.create(student=child, guardian=office, relation=StudentGuardian.GUARDIAN,
                                           state=StudentGuardian.NEEDS_REVIEW, source=StudentGuardian.FROM_RECORD)
            for child in (self.student, self.sibling)
        ]
        answer = self.write("post", f"admin/guardians/{office.id}/decide", {"decision": "reject"}, self.admin_token)
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual((answer.json()["decided"], answer.json()["state"]), (2, "rejected"))
        self.assertTrue(all(
            StudentGuardian.objects.get(pk=l.pk).state == StudentGuardian.REJECTED for l in links
        ))
        # the shared number's other review is untouched, and so are decided links
        self.review.refresh_from_db()
        self.assertEqual(self.review.state, StudentGuardian.NEEDS_REVIEW)
        self.assertEqual(self.write("post", f"admin/guardians/{office.id}/decide", {"decision": "confirm"},
                                    self.other_admin_token).status_code, 404)
        self.assertEqual(self.write("post", f"admin/guardians/{office.id}/decide", {"decision": "confirm"},
                                    self.staff_token).status_code, 403)

    def test_another_schools_admin_cannot_decide(self):
        self.assertEqual(self.decide("confirm", token=self.other_admin_token).status_code, 404)
        self.assertEqual(self.decide("maybe").status_code, 400)

    def test_a_family_code_is_shown_once_and_kept_as_a_hash(self):
        answer = self.write("post", f"admin/guardians/{self.shared.id}/family-code", {}, self.admin_token)
        self.assertEqual(answer.status_code, 201, answer.content)
        code = answer.json()["code"]
        self.assertRegex(code, rf"^[{FAMILY_ALPHABET}]{{4}}-[{FAMILY_ALPHABET}]{{4}}$")
        entry = FamilyCode.objects.get(guardian=self.shared, revoked_at__isnull=True)
        self.assertEqual(entry.code_hash, code_hash(code.replace("-", "")))
        self.assertEqual(entry.issued_by_admin_id, self.admin_account.id)
        # a second code cancels the first
        self.write("post", f"admin/guardians/{self.shared.id}/family-code", {}, self.admin_token)
        self.assertEqual(FamilyCode.objects.filter(guardian=self.shared, revoked_at__isnull=True).count(), 1)
        far_guardian = Guardian.objects.create(school=self.other, phone="9855555555")
        self.assertEqual(self.write("post", f"admin/guardians/{far_guardian.id}/family-code", {},
                                    self.admin_token).status_code, 404)


class StaffFamilyCodeTests(AdminFixtures, TestCase):
    """Staff who may update student records (102) vouch for parents too."""

    def allow(self, *perms):
        self.staff.permissions = list(perms)
        self.staff.save(update_fields=["permissions"])

    def test_staff_without_102_cannot(self):
        self.assertEqual(self.get("admin/students?q=asha", self.staff_token).status_code, 403)
        self.assertEqual(self.write("post", f"admin/guardians/{self.guardian.id}/family-code", {},
                                    self.staff_token).status_code, 403)

    def test_staff_with_102_find_the_student_and_make_a_code(self):
        self.allow(102)
        items = self.get("admin/students?q=asha", self.staff_token).json()["items"]
        self.assertEqual([i["id"] for i in items], [self.student.id])
        detail = self.get(f"admin/students/{self.student.id}", self.staff_token).json()
        self.assertIsNone(detail["dues"])  # dues stay with the payments permission
        self.assertEqual([g["guardian_id"] for g in detail["guardians"]], [self.guardian.id])
        answer = self.write("post", f"admin/guardians/{self.guardian.id}/family-code", {}, self.staff_token)
        self.assertEqual(answer.status_code, 201, answer.content)
        entry = FamilyCode.objects.get(guardian=self.guardian, revoked_at__isnull=True)
        self.assertEqual((entry.issued_by_staff_id, entry.issued_by_admin_id), (self.staff_account.id, None))
        # the rest of the admin's screens stay the admin's
        self.assertEqual(self.get("admin/dashboard", self.staff_token).status_code, 403)

    def test_staff_with_103_as_well_see_the_dues(self):
        self.allow(102, 103)
        detail = self.get(f"admin/students/{self.student.id}", self.staff_token).json()
        self.assertEqual(detail["dues"]["total_paisa"], 90000)
