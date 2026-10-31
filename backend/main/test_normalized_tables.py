from decimal import Decimal
from types import SimpleNamespace

from django.db import IntegrityError, connection, transaction
from django.test import TestCase

from account.models import AdminAccount
from library.models.Book import Book, BookCopy, BookIssue
from library.models.Library import Library
from main.models.ClassInfo import ClassInfo
from main.models.ClassPeriod import ClassPeriod
from main.models.Fee import FeeTitle
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.Invoice import StudentInvoice
from main.models.Ledger import LedgerPosting, StudentLedger
from main.models.Normalized import (
    ClassPeriodSlot,
    StaffPermissionGrant,
    StudentInvoiceLine,
    StudentLedgerLine,
)
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Staff import Staff, StaffRole
from main.models.Student import Student, StudentGuardianInfo
from main.models.Subject import Subject


class NormalizedTablesTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.ey = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        cls.one, cls.one_year = cls.school("one")
        cls.two, cls.two_year = cls.school("two")
        cls.one_class = ClassInfo.objects.create(school=cls.one, academic_year=cls.one_year, education_level=2, grade=4)
        cls.title = FeeTitle.objects.create(school=cls.one, title="Monthly fee", months=[1])
        cls.student = Student.objects.create(
            first_name="Asha", last_name="Pun", birth_date="2070-01-01", gender=2, location="Dang",
            class_info=cls.one_class, academic_year=cls.one_year,
            guardian_info=StudentGuardianInfo.objects.create(father_name="F", mother_name="M", guardian_contact="9800000000"),
        )
        cls.posting = LedgerPosting.objects.create(
            academic_year=cls.one_year, economic_year=cls.ey, class_info=cls.one_class, months=[1], date="2083-07-01"
        )

    @classmethod
    def school(cls, tag):
        school = SchoolAdmin.objects.create(
            name=f"School {tag}", address="Test address", estd_date="2080-01-01", renew_date="2084-01-01",
            pan_no="123", email=f"{tag}@example.com", account=AdminAccount.objects.create(username=f"admin-{tag}"),
            economic_year=cls.ey,
        )
        return school, AcademicYear.objects.create(school=school, name="2083", start_date="2083-01-01", end_date="2083-12-30")

    def ledger(self, details, total=0):
        return StudentLedger.objects.create(
            student=self.student, school=self.one, academic_year=self.one_year, economic_year=self.ey,
            ledger_posting=self.posting, details=details, total=total, date="2083-07-01",
        )

    def invoice(self, details, number=1, paid=0):
        return StudentInvoice.objects.create(
            invoice_id=number, school=self.one, academic_year=self.one_year, economic_year=self.ey, student=self.student,
            class_info=self.one_class, details=details, total_paid=paid, payment_month=1, date="2083-07-01",
        )

    def test_a_ledger_gets_its_lines_with_the_title_and_the_printed_label(self):
        ledger = self.ledger({str(self.title.id): 2500, "tn": 1000, "__titles": {str(self.title.id): "Monthly fee"}}, 3500)
        lines = {(l.title_id, l.code, l.label, l.amount) for l in StudentLedgerLine.objects.filter(ledger=ledger)}
        self.assertEqual(lines, {(self.title.id, "", "Monthly fee", 2500), (None, "tn", None, 1000)})

    def test_bulk_create_is_covered(self):
        rows = [
            StudentLedger(student=self.student, school=self.one, academic_year=self.one_year, economic_year=self.ey,
                          ledger_posting=self.posting, details={"od": 100}, total=100, date="2083-07-01")
        ]
        created = StudentLedger.objects.bulk_create(rows)
        self.assertEqual(StudentLedgerLine.objects.get(ledger=created[0]).amount, 100)

    def test_changing_the_json_rewrites_the_lines_and_update_is_covered(self):
        ledger = self.ledger({"od": 100}, 100)
        StudentLedger.objects.filter(pk=ledger.pk).update(details={"od": 150, "tn": 50})
        self.assertEqual(
            {(l.code, l.amount) for l in StudentLedgerLine.objects.filter(ledger=ledger)}, {("od", 150), ("tn", 50)}
        )

    def test_amounts_stored_as_text_are_read_as_numbers(self):
        ledger = self.ledger({"od": "1500"}, 1500)
        self.assertEqual(StudentLedgerLine.objects.get(ledger=ledger).amount, 1500)

    def test_a_title_that_no_longer_exists_keeps_its_key_and_amount(self):
        ledger = self.ledger({"999999": 75}, 75)
        line = StudentLedgerLine.objects.get(ledger=ledger)
        self.assertEqual((line.title_id, line.code, line.amount), (None, "999999", 75))

    def test_an_unreadable_value_never_stops_the_save(self):
        ledger = self.ledger({"od": "not a number"}, 0)
        self.assertEqual(StudentLedgerLine.objects.filter(ledger=ledger).count(), 0)

    def test_a_receipt_keeps_paid_due_and_discount(self):
        invoice = self.invoice({str(self.title.id): {"amt": 4210, "due": 15770, "dis": 10}, "__titles": {str(self.title.id): "Monthly fee"}})
        line = StudentInvoiceLine.objects.get(invoice=invoice)
        self.assertEqual((line.title_id, line.amount, line.due, line.discount), (self.title.id, 4210, 15770, 10))

    def test_a_cash_receipt_keeps_each_particular(self):
        invoice = self.invoice([{"AMT": 3000, "PAR": "Certificate"}, {"AMT": 350, "PAR": "Exam form"}])
        lines = StudentInvoiceLine.objects.filter(invoice=invoice).order_by("line_no")
        self.assertEqual([(l.code, l.label, l.amount) for l in lines], [("cash", "Certificate", 3000), ("cash", "Exam form", 350)])

    def test_deleting_a_ledger_takes_its_lines(self):
        ledger = self.ledger({"od": 100}, 100)
        ledger.delete()
        self.assertEqual(StudentLedgerLine.objects.count(), 0)

    def test_a_deleted_fee_title_leaves_the_line_and_its_label(self):
        title = FeeTitle.objects.create(school=self.one, title="Old fee", months=[1])
        ledger = self.ledger({str(title.id): 50, "__titles": {str(title.id): "Old fee"}}, 50)
        title.delete()
        line = StudentLedgerLine.objects.get(ledger=ledger)
        self.assertEqual((line.title_id, line.label, line.amount), (None, "Old fee", 50))

    def test_a_timetable_becomes_slots_and_a_gone_subject_leaves_the_slot_empty(self):
        subject = Subject.objects.create(school=self.one, class_info=self.one_class, subject="English", type=1, order=1, credit_hours=4)
        period = ClassPeriod.objects.create(
            class_info=self.one_class, academic_year=self.one_year, period_count=2,
            subjects={"1": subject.id, "2": 999999}, teachers={},
        )
        slots = {(s.period_no, s.subject_id) for s in ClassPeriodSlot.objects.filter(class_period=period)}
        self.assertEqual(slots, {(1, subject.id), (2, None)})

    def test_staff_permissions_become_grants_and_a_new_id_joins_the_catalog(self):
        staff = Staff.objects.create(
            role=StaffRole.objects.create(role="Teacher"), first_name="Ram", last_name="Thapa", primary_contact="9811111111",
            location="Dang", school=self.one, permissions=[1, 1, 987654],
        )
        self.assertEqual(
            set(StaffPermissionGrant.objects.filter(staff=staff).values_list("permission_id", flat=True)), {1, 987654}
        )
        staff.permissions = []
        staff.save()
        self.assertFalse(StaffPermissionGrant.objects.filter(staff=staff).exists())

    def test_a_receipt_number_cannot_be_issued_twice_even_if_voided(self):
        first = self.invoice({"od": {"amt": 1}}, number=7)
        StudentInvoice.objects.filter(pk=first.pk).update(is_active=False)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.invoice({"od": {"amt": 1}}, number=7)

    def test_a_student_is_marked_once_on_a_ledger_posting_while_active(self):
        first = self.ledger({"od": 1}, 1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.ledger({"od": 1}, 1)
        StudentLedger.objects.filter(pk=first.pk).update(is_active=False)
        self.ledger({"od": 1}, 1)

    def test_a_malformed_date_is_refused(self):
        with self.assertRaises(IntegrityError), transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(
                "UPDATE main_academicyear SET start_date = '2083/01/01' WHERE id = %s", [self.one_year.id]
            )

    def test_an_old_bad_date_keeps_its_rule_off_so_the_row_can_still_be_saved(self):
        from importlib import import_module

        from main.management.commands.normalization_audit import audit

        integrity = import_module("main.migrations.0110_integrity_keys")
        rule = integrity.date_rule_name("main_student", "birth_date")
        editor = SimpleNamespace(connection=connection)
        with connection.cursor() as cursor:
            # ALTER TABLE refuses while the deferred school keys are still waiting to fire.
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            cursor.execute(f"ALTER TABLE main_student DROP CONSTRAINT {rule}")
            cursor.execute("UPDATE main_student SET birth_date = '2073-4-31' WHERE id = %s", [self.student.id])
            integrity.add_date_rules(None, editor)
            cursor.execute("SELECT 1 FROM pg_constraint WHERE conname = %s", [rule])
            self.assertIsNone(cursor.fetchone())

            # Promotion touches the row, not the date. It must keep working.
            Student.objects.filter(pk=self.student.pk).update(class_info=self.one_class)
            self.assertIn(f"main_student.birth_date: 1 malformed date(s), so {rule} cannot be added", audit())

            cursor.execute("UPDATE main_student SET birth_date = '2073-04-31' WHERE id = %s", [self.student.id])
            integrity.add_date_rules(None, editor)
            cursor.execute("SELECT convalidated FROM pg_constraint WHERE conname = %s", [rule])
            self.assertEqual(cursor.fetchone(), (True,))

    def test_a_row_cannot_link_two_schools(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            ClassInfo.objects.create(school=self.one, academic_year=self.two_year, education_level=2, grade=5)
            connection.check_constraints()

    def test_a_library_can_still_lend_to_a_guest_schools_staff(self):
        library = Library.objects.create(school=self.one, name="Main")
        book = Book.objects.create(school=self.one, library=library, entry_date="2083-01-01", title="Muna Madan", quantity=1)
        guest = Staff.objects.create(
            school=self.two, role=StaffRole.objects.create(role="Guest teacher"), first_name="Mina", last_name="Rai",
            primary_contact="9800000002", location="Dang",
        )
        BookIssue.objects.create(
            school=self.one, staff=guest, book=BookCopy.objects.create(book=book),
            issued_date="2083-07-01", due_date="2083-07-15",
        )
        connection.check_constraints()

    def test_the_audit_reads_clean_after_a_correct_write(self):
        from main.management.commands.normalization_audit import audit

        self.ledger({"od": 100}, 100)
        self.invoice({"od": {"amt": 100}}, number=1)
        self.assertEqual(audit(), [])


class MoreNormalizedTablesTests(TestCase):
    """The same pattern on the rest of the facts held in JSON."""

    def setUp(self):
        ey = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        self.ey = ey
        self.school = SchoolAdmin.objects.create(
            name="School", address="Test address", estd_date="2080-01-01", renew_date="2084-01-01", pan_no="123",
            email="one@example.com", account=AdminAccount.objects.create(username="admin-one"), economic_year=ey,
        )

    def test_a_party_bill_and_receipt_get_lines(self):
        from extra_billing.models import BillingParty, BillingTitle, ExtraInvoice, ExtraLedger, ExtraLedgerPosting

        title = BillingTitle.objects.create(school=self.school, title="Rent")
        party = BillingParty.objects.create(school=self.school, name="Tenant")
        posting = ExtraLedgerPosting.objects.create(school=self.school, economic_year=self.ey, date="2083-07-01", months=[1])
        ledger = ExtraLedger.objects.create(
            posting=posting, party=party, school=self.school, economic_year=self.ey, date="2083-07-01", months=[1],
            details={str(title.id): "15000.00", "__titles": {str(title.id): "Rent"}}, total=15000,
        )
        line = ledger.lines.get()
        self.assertEqual((line.title_id, line.label, line.amount), (title.id, "Rent", Decimal("15000.00")))
        receipt = ExtraInvoice.objects.create(
            school=self.school, economic_year=self.ey, party=party, invoice_id=1, date="2083-07-01",
            details={str(title.id): "10000.00", "od": "500.00"}, total_paid=10500,
        )
        self.assertEqual(sorted(l.amount for l in receipt.lines.all()), [Decimal("500.00"), Decimal("10000.00")])
        self.assertEqual(receipt.lines.get(code="od").title_id, None)

    def test_canteen_transaction_user_and_posting_rows(self):
        from canteen.models import CanteenAccount, CanteenItem, CanteenPlan, CanteenPosting, CanteenTransaction, CanteenUser

        item = CanteenItem.objects.create(school=self.school, name="Samosa", price=20)
        klass_year = AcademicYear.objects.create(school=self.school, name="2083", start_date="2083-01-01", end_date="2083-12-30")
        klass = ClassInfo.objects.create(school=self.school, academic_year=klass_year, education_level=2, grade=4)
        student = Student.objects.create(
            first_name="Asha", last_name="Pun", birth_date="2070-01-01", gender=2, location="Dang",
            class_info=klass, academic_year=klass_year,
            guardian_info=StudentGuardianInfo.objects.create(father_name="F", mother_name="M", guardian_contact="9800000000"),
        )
        account = CanteenAccount.objects.create(school=self.school, student=student)
        txn = CanteenTransaction.objects.create(
            school=self.school, economic_year=self.ey, account=account, kind=1, amount=-20, date="2083-07-01",
            details={str(item.id): "-20.00", "__titles": {str(item.id): "Samosa"}},
        )
        self.assertEqual(txn.lines.get().item_id, item.id)
        user = CanteenUser.objects.create(username="counter01", school=self.school, full_name="Sita", permissions=[2701, 2702, 2701])
        self.assertEqual(sorted(user.pages.values_list("page", flat=True)), [2701, 2702])
        plan = CanteenPlan.objects.create(school=self.school, name="Tiffin", kind=1)
        posting = CanteenPosting.objects.create(
            school=self.school, economic_year=self.ey, bs_year=2083, months=[1], plans=[plan.id, 999999], date="2083-07-01",
        )
        self.assertEqual(list(posting.plan_links.values_list("plan_id", flat=True)), [plan.id])

    def test_activity_grades_and_marks_criteria(self):
        from main.models.Normalized import ClassResultCriteria, ExtraActivityGrade
        from main.models.exams.Exam import Exam
        from main.models.exams.ExtraActivity import ExtraActivity, ExtraActivityEntry
        from main.models.exams.Result import ClassResult

        year = AcademicYear.objects.create(school=self.school, name="2083", start_date="2083-01-01", end_date="2083-12-30")
        klass = ClassInfo.objects.create(school=self.school, academic_year=year, education_level=2, grade=4)
        student = Student.objects.create(
            first_name="Asha", last_name="Pun", birth_date="2070-01-01", gender=2, location="Dang",
            class_info=klass, academic_year=year,
            guardian_info=StudentGuardianInfo.objects.create(father_name="F", mother_name="M", guardian_contact="9800000000"),
        )
        exam = Exam.objects.create(school=self.school, academic_year=year, name="First term")
        activity = ExtraActivity.objects.create(school=self.school, name="Discipline")
        entry = ExtraActivityEntry.objects.create(
            school=self.school, class_info=klass, exam=exam, student=student,
            extra_activities={str(activity.id): "Excellent", "999999": "gone"},
        )
        self.assertEqual(list(ExtraActivityGrade.objects.filter(entry=entry).values_list("activity_id", "grade")), [(activity.id, "Excellent")])
        subject = Subject.objects.create(school=self.school, class_info=klass, subject="Maths", type=1, order=1, code="M1", credit_hours=4)
        result = ClassResult.objects.create(exam=exam, class_info=klass, subject=subject, criteria={"fm": "100", "pm": 35, "fm_th": "not a number"})
        criteria = ClassResultCriteria.objects.get(class_result=result)
        self.assertEqual((criteria.full_marks, criteria.pass_marks, criteria.full_marks_theory), (Decimal("100"), Decimal("35"), None))
