from decimal import Decimal

from django.test import TestCase, override_settings

from account.models import AdminAccount
from main.models.ClassInfo import ClassInfo
from main.models.Fee import FeeTitle
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.Invoice import StudentInvoice
from main.models.Ledger import LedgerPosting, StudentLedger
from main.models.Normalized import StudentInvoiceLine, StudentLedgerLine
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student, StudentGuardianInfo
from main.services.fee_lines import json_amount, student_invoice_totals, student_ledger_totals


def plain(totals):
    return {student: dict(keys) for student, keys in totals.items()}


class FeeLinesTests(TestCase):
    """Phase 3: the line tables answer exactly what the JSON answers."""

    @classmethod
    def setUpTestData(cls):
        cls.ey = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        cls.school = SchoolAdmin.objects.create(
            name="School one", address="Test address", estd_date="2080-01-01", renew_date="2084-01-01",
            pan_no="123", email="one@example.com", account=AdminAccount.objects.create(username="admin-one"),
            economic_year=cls.ey,
        )
        cls.year = AcademicYear.objects.create(school=cls.school, name="2083", start_date="2083-01-01", end_date="2083-12-30")
        cls.cls = ClassInfo.objects.create(school=cls.school, academic_year=cls.year, education_level=2, grade=4)
        cls.monthly = FeeTitle.objects.create(school=cls.school, title="Monthly fee", months=[1])
        cls.exam = FeeTitle.objects.create(school=cls.school, title="Exam fee", months=[1])
        cls.asha = cls.student("Asha")
        cls.bir = cls.student("Bir")

    @classmethod
    def student(cls, name):
        return Student.objects.create(
            first_name=name, last_name="Pun", birth_date="2070-01-01", gender=2, location="Dang",
            class_info=cls.cls, academic_year=cls.year,
            guardian_info=StudentGuardianInfo.objects.create(father_name="F", mother_name="M", guardian_contact="9800000000"),
        )

    def ledger(self, student, details):
        # one ledger per student per posting, as the database requires
        posting = LedgerPosting.objects.create(
            academic_year=self.year, economic_year=self.ey, class_info=self.cls, months=[1], date="2083-07-01"
        )
        return StudentLedger.objects.create(
            student=student, school=self.school, academic_year=self.year, economic_year=self.ey,
            ledger_posting=posting, details=details, total=0, date="2083-07-01",
        )

    def invoice(self, student, details, number, cash=False):
        return StudentInvoice.objects.create(
            invoice_id=number, school=self.school, academic_year=self.year, economic_year=self.ey, student=student,
            class_info=self.cls, details=details, total_paid=0, payment_month=1, date="2083-07-01",
            isCashReceipt=cash,
        )

    def both(self, read, rows, keys=None):
        with override_settings(NORMALIZED_READS=False):
            from_json = plain(read(rows, keys=keys))
        with override_settings(NORMALIZED_READS=True):
            from_lines = plain(read(rows, keys=keys))
        return from_json, from_lines

    def awkward_rows(self):
        m, e = str(self.monthly.id), str(self.exam.id)
        self.ledger(self.asha, {m: 1500, e: "250.50", "tn": 300, "hs": 99.995, "__titles": {m: "Monthly fee"}})
        self.ledger(self.asha, {m: " 1500 ", "od": -200, "bad": "1,000", "flag": True, "nested": {"x": 1}})
        self.ledger(self.bir, {m: 1200, "tn": "abc", "hsa": 5000})
        self.invoice(self.asha, {m: {"amt": 1500, "due": 0, "dis": 100}, "tn": {"amt": "300", "due": 0},
                                 "__titles": {m: "Monthly fee"}}, 1)
        self.invoice(self.asha, {e: 250, "hs": {"due": 10}}, 2)
        self.invoice(self.bir, [{"PAR": "Uniform", "AMT": 900}, {"PAR": "Tie", "AMT": "150"}, {"PAR": "?", "AMT": "x"}], 3,
                     cash=True)

    def test_ledger_sums_are_the_same_from_the_json_and_from_the_lines(self):
        self.awkward_rows()
        from_json, from_lines = self.both(student_ledger_totals, StudentLedger.objects.all())
        self.assertEqual(from_json, from_lines)
        m = str(self.monthly.id)
        self.assertEqual(from_json[self.asha.id][m], Decimal("3000.00"))
        self.assertEqual(from_json[self.asha.id]["hs"], Decimal("100.00"))  # 99.995 kept to the paisa
        self.assertNotIn("bad", from_json[self.asha.id])
        self.assertNotIn("tn", from_json[self.bir.id])

    def test_receipt_sums_are_the_same_from_the_json_and_from_the_lines(self):
        self.awkward_rows()
        from_json, from_lines = self.both(student_invoice_totals, StudentInvoice.objects.all())
        self.assertEqual(from_json, from_lines)
        self.assertEqual(from_json[self.bir.id], {"cash": Decimal("1050.00")})
        self.assertNotIn("hs", from_json[self.asha.id])  # a line with no amount counts for nothing

    def test_a_filter_by_key_is_the_same_on_both_paths(self):
        self.awkward_rows()
        keys = ["hs", "hsa", "hsd", str(self.exam.id)]
        for read, rows in ((student_ledger_totals, StudentLedger.objects.all()),
                           (student_invoice_totals, StudentInvoice.objects.all())):
            from_json, from_lines = self.both(read, rows, keys)
            self.assertEqual(from_json, from_lines)
            self.assertTrue(all(set(per) <= set(keys) for per in from_json.values()))

    def test_a_deleted_fee_title_keeps_its_key_on_the_line(self):
        old = FeeTitle.objects.create(school=self.school, title="Old fee", months=[1])
        ledger = self.ledger(self.asha, {str(old.id): 50, "__titles": {str(old.id): "Old fee"}})
        receipt = self.invoice(self.asha, {str(old.id): {"amt": 50}}, 9)
        key = str(old.id)
        old.delete()
        self.assertEqual(StudentLedgerLine.objects.get(ledger=ledger).code, key)
        self.assertEqual(StudentInvoiceLine.objects.get(invoice=receipt).code, key)
        for read, rows in ((student_ledger_totals, StudentLedger.objects.all()),
                           (student_invoice_totals, StudentInvoice.objects.all())):
            from_json, from_lines = self.both(read, rows, [key])
            self.assertEqual(from_json, from_lines)
            self.assertEqual(from_lines[self.asha.id], {key: Decimal("50.00")})

    def test_the_audit_finds_a_line_filed_under_the_wrong_key(self):
        from main.management.commands.normalization_audit import audit

        self.awkward_rows()
        self.assertFalse([f for f in audit() if "for a fee title" in f])
        line = StudentLedgerLine.objects.filter(code="tn").first()
        StudentLedgerLine.objects.filter(pk=line.pk).update(code="od")
        self.assertIn("main_studentledger: 1 row(s) whose lines differ from their JSON for a fee title", audit())

    def test_an_amount_is_read_the_way_the_database_reads_it(self):
        for value, want in ((1500, "1500.00"), (" 12.5 ", "12.50"), (-3, "-3.00"), (0.125, "0.13"), (-0.125, "-0.13")):
            self.assertEqual(json_amount(value), Decimal(want), value)
        for value in (None, True, "1,000", "1e3", "abc", {"amt": 1}, [1], float("nan")):
            self.assertIsNone(json_amount(value), value)
