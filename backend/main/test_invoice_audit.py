from contextlib import contextmanager
from datetime import datetime, timezone as dt_timezone
from types import SimpleNamespace

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken, StaffAuthToken
from account.auth.context import users_context
from account.models import AdminAccount, StaffAccount
from extra_billing.models.Billing import ExtraInvoice
from extra_billing.models.Party import BillingParty
from main.methods.genInvoiceData import (
    generateCashReceiptData, generateInvoiceDataById, generateStaffInvoiceDataById,
)
from main.methods.invoiceAudit import invoiceAudit
from main.models.BusStation import BusStation
from main.models.ClassInfo import ClassInfo
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.Invoice import StaffInvoice, StudentInvoice
from main.models.Ledger import LedgerPosting, StaffLedger, StudentLedger
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Staff import Staff, StaffRole
from main.models.Student import Student, StudentGuardianInfo, StudentTransportationInfo
from main.views.InvoiceViewsStaff import StaffInvoiceView
from main.models.history_log.HistoryLog import HistoryLog
from main.serializers.InvoiceSerializer import StudentInvoiceSerializer
from main.views.InvoiceViews import InvoiceViews
from main.views.search.TransactionsSearchView import TransactionsSearchView

JUNE = ["2083-06-01", "2083-06-30"]


class AuditSchool:
    """One school with its own login and two members of staff."""

    @classmethod
    def setUpTestData(cls):
        cls.fy = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")
        cls.admin = AdminAccount.objects.create(username="audit-admin")
        cls.school = SchoolAdmin.objects.create(
            name="Audit school", address="Test address", estd_date="2080-01-01",
            renew_date="2084-01-01", pan_no="123", email="audit@example.com",
            account=cls.admin, economic_year=cls.fy,
        )
        cls.ay = AcademicYear.objects.create(school=cls.school, name="2083", start_date="2083-01-01", end_date="2083-12-30")
        cls.role = StaffRole.objects.create(role="accountant")
        cls.sankalpa = cls.make_staff("sankalpa", "Sankalpa", "Kumar", "KC")
        cls.prabeena = cls.make_staff("prabeena", "Prabeena", None, "Chaudhary")

    @classmethod
    def make_staff(cls, username, first, middle, last):
        account = StaffAccount.objects.create(username=username)
        Staff.objects.create(
            role=cls.role, first_name=first, middle_name=middle, last_name=last,
            primary_contact="9800000000", location="Ghorahi", school=cls.school, account=account,
        )
        return account


class InvoiceAuditTests(AuditSchool, TestCase):
    """A receipt names the account that entered the bill and the moment it was
    entered, whoever reads it afterwards; a deleted bill names who deleted it."""

    @contextmanager
    def signed_in(self, account):
        """What token authentication leaves behind for the history log."""
        users_context.set({
            "user_id": account.id, "user_type": ContentType.objects.get_for_model(type(account)),
            "ip_address": None, "school_id": self.school.id,
        } if account else None)
        try:
            yield
        finally:
            users_context.set(None)

    def bill(self, by, **fields):
        with self.signed_in(by):
            return StudentInvoiceSerializer().create({**dict(
                school=self.school, economic_year=self.fy, academic_year=self.ay,
                isCashReceipt=True, payment_month=6, date="2083-06-21", total_paid="1100",
                details=[{"AMT": 1100, "PAR": "Transportation"}], extra_info={"name": "Aayushma"},
            ), **fields})

    def receipt(self, invoice, reader=None):
        with self.signed_in(reader):
            return generateInvoiceDataById(invoice.id, None, self.school.id)

    def delete(self, invoice, by, reason="wrong student"):
        with self.signed_in(by):
            return InvoiceViews()._delete(SimpleNamespace(
                data={"id": invoice.id, "school": self.school.id, "remarks": reason},
            ))

    def entered_at(self, invoice, instant):
        HistoryLog.objects.filter(
            object_type=ContentType.objects.get_for_model(StudentInvoice), object_id=invoice.id, action=1,
        ).update(timestamp=instant)

    def test_the_name_is_who_entered_it_not_who_reads_it(self):
        by_staff, by_admin = self.bill(self.sankalpa), self.bill(self.admin)
        for reader in (self.admin, self.sankalpa, self.prabeena):
            with self.subTest(reader=reader.username):
                self.assertEqual(self.receipt(by_staff, reader)["cashier"], "Sankalpa Kumar KC")
                self.assertEqual(self.receipt(by_admin, reader)["cashier"], "admin")

    def test_the_name_is_as_entered_with_no_gap_for_a_missing_middle_name(self):
        self.assertEqual(self.receipt(self.bill(self.prabeena))["cashier"], "Prabeena Chaudhary")

    def test_first_print_and_reprint_agree(self):
        invoice = self.bill(self.sankalpa)
        first = generateCashReceiptData(invoice.invoice_id, invoice.date, {"id": invoice.id})
        again = self.receipt(invoice, self.admin)
        for key in ("cashier", "entered_on", "entered_time", "deleted"):
            self.assertEqual(first[key], again[key])
        self.assertEqual(first["cashier"], "Sankalpa Kumar KC")

    def test_the_time_is_by_nepals_clock(self):
        invoice = self.bill(self.sankalpa)
        self.entered_at(invoice, datetime(2026, 10, 7, 5, 18, 37, tzinfo=dt_timezone.utc))
        receipt = self.receipt(invoice)
        self.assertEqual((receipt["entered_on"], receipt["entered_time"]), ("2083-06-21", "11:03:37 AM"))
        # 00:45 in Nepal is still the day before on a UTC server
        self.entered_at(invoice, datetime(2026, 10, 7, 19, 0, 0, tzinfo=dt_timezone.utc))
        receipt = self.receipt(invoice)
        self.assertEqual((receipt["entered_on"], receipt["entered_time"]), ("2083-06-22", "12:45:00 AM"))

    def test_a_bill_the_log_never_saw_claims_nobody(self):
        receipt = self.receipt(self.bill(None), self.sankalpa)
        self.assertEqual(
            {key: receipt[key] for key in ("cashier", "entered_on", "entered_time", "deleted")},
            {"cashier": None, "entered_on": None, "entered_time": None, "deleted": None},
        )

    def test_a_deleted_bill_names_who_deleted_it(self):
        invoice = self.bill(self.sankalpa)
        self.assertIsNone(self.receipt(invoice)["deleted"])
        self.delete(invoice, self.prabeena)
        receipt = self.receipt(invoice, self.admin)
        self.assertEqual(receipt["cashier"], "Sankalpa Kumar KC")
        self.assertEqual(receipt["deleted"]["by"], "Prabeena Chaudhary")
        self.assertRegex(receipt["deleted"]["on"], r"^\d{4}-\d{2}-\d{2}$")
        self.assertRegex(receipt["deleted"]["time"], r"^\d{2}:\d{2}:\d{2} [AP]M$")
        self.assertEqual(receipt["remarks"], "wrong student")

    def test_deleted_restored_and_deleted_again_names_the_last_one(self):
        invoice = self.bill(self.admin)
        self.delete(invoice, self.sankalpa)
        with self.signed_in(self.admin):
            invoice.refresh_from_db()
            invoice.is_active = True
            invoice.save()
        self.assertIsNone(self.receipt(invoice)["deleted"])
        self.delete(invoice, self.admin)
        self.assertEqual(self.receipt(invoice)["deleted"]["by"], "admin")

    def test_a_bill_deleted_outside_the_portal_is_deleted_by_nobody_known(self):
        invoice = self.bill(self.sankalpa)
        StudentInvoice.objects.filter(pk=invoice.pk).update(is_active=False)
        self.assertEqual(self.receipt(invoice)["deleted"], {"by": None, "on": None, "time": None})

    def test_the_deleted_list_says_who_deleted_each_bill(self):
        kept = self.bill(self.sankalpa)
        gone = self.bill(self.sankalpa)
        unknown = self.bill(self.admin)
        self.delete(gone, self.admin)
        StudentInvoice.objects.filter(pk=unknown.pk).update(is_active=False)
        view = TransactionsSearchView()

        def rows(is_active):
            request = SimpleNamespace(data={"school": self.school.id, "is_active": is_active, "date_range": JUNE})
            return {row["id"]: row for row in view.post(request).data["data"]}

        deleted = rows(False)
        self.assertEqual(set(deleted), {gone.id, unknown.id})
        self.assertEqual(deleted[gone.id]["deleted_by"], "admin")
        self.assertRegex(deleted[gone.id]["deleted_on"], r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [AP]M$")
        self.assertEqual(deleted[gone.id]["cashier"], "Sankalpa Kumar KC")
        self.assertEqual((deleted[unknown.id]["deleted_by"], deleted[unknown.id]["deleted_on"]), ("", ""))
        standing = rows(True)
        self.assertEqual(set(standing), {kept.id})
        self.assertNotIn("deleted_by", standing[kept.id])

    def test_a_voided_extra_billing_receipt_says_who_voided_it(self):
        party = BillingParty.objects.create(school=self.school, name="Shop tenant")
        with self.signed_in(self.admin):
            receipt = ExtraInvoice.objects.create(
                school=self.school, economic_year=self.fy, party=party, invoice_id=7,
                total_paid="125.50", date="2083-06-05", details={"1": "125.50", "__titles": {"1": "Rent"}},
            )
        with self.signed_in(self.sankalpa):
            receipt.is_active = False
            receipt.save(update_fields=["is_active", "updated_at"])
        rows, _ = TransactionsSearchView().getExtraInvoices(
            self.school.id, {"is_active": False, "date_range": JUNE}, deleted=True,
        )
        self.assertEqual([row["deleted_by"] for row in rows], ["Sankalpa Kumar KC"])
        self.assertEqual(invoiceAudit(ExtraInvoice, [receipt.id])[receipt.id]["cashier"], "admin")


class AuditSchoolWithStudent(AuditSchool):
    """...and a class with one student in it."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.ten = ClassInfo.objects.create(school=cls.school, academic_year=cls.ay, education_level=2, grade=10)
        cls.student = Student.objects.create(
            first_name="Aayushma", last_name="Chaudhary", birth_date="2070-01-01", gender=2,
            location="Ghorahi", class_info=cls.ten, academic_year=cls.ay,
            guardian_info=StudentGuardianInfo.objects.create(
                father_name="Umesh Rana", mother_name="Mother Name", guardian_contact="9800000000",
            ),
        )
        cls.teacher = Staff.objects.get(account=cls.prabeena)


class StatementTimeTests(AuditSchoolWithStudent, TestCase):
    """The trial balances say when each line was entered, and a pay slip names
    whoever paid it."""

    signed_in = InvoiceAuditTests.signed_in

    def log_time(self, record, instant):
        HistoryLog.objects.filter(
            object_type=ContentType.objects.get_for_model(type(record)), object_id=record.id, action=1,
        ).update(timestamp=instant)

    def test_student_trial_balance_times(self):
        year = dict(academic_year=self.ay, economic_year=self.fy)
        with self.signed_in(self.sankalpa):
            posting = LedgerPosting.objects.create(class_info=self.ten, date="2083-06-01", months=[6], **year)
        # a class posting bulk-creates its students' rows: no log row of their own
        charge, = StudentLedger.objects.bulk_create([StudentLedger(
            student=self.student, school=self.school, ledger_posting=posting, date="2083-06-01",
            details={"tn": 395}, total=395, **year,
        )])
        with self.signed_in(self.admin):
            own_posting = LedgerPosting.objects.create(
                class_info=self.ten, date="2083-06-02", months=[], single_student=True, **year,
            )
            own = StudentLedger.objects.create(
                student=self.student, school=self.school, ledger_posting=own_posting, date="2083-06-02",
                details={"tn": 100}, total=100, **year,
            )
            payment = StudentInvoice.objects.create(
                student=self.student, school=self.school, invoice_id=20, date="2083-06-21", payment_month=6,
                total_paid=295, total_discount=100, details={"tn": {"amt": 395, "dis": 100}}, **year,
            )
        self.log_time(posting, datetime(2026, 9, 17, 4, 0, 0, tzinfo=dt_timezone.utc))
        self.log_time(own, datetime(2026, 9, 18, 5, 30, 15, tzinfo=dt_timezone.utc))
        self.log_time(payment, datetime(2026, 10, 7, 5, 18, 37, tzinfo=dt_timezone.utc))
        rows = InvoiceViews().getTrialBalance(self.student.id, self.school.id, self.ay.id)["data"]
        when = {
            (row["id"], next(k for k in ("debit_amount", "credit_amount", "discount_amount") if k in row)):
                (row["entered_on"], row["entered_time"])
            for row in rows
        }
        self.assertEqual(when, {
            (charge.id, "debit_amount"): ("2083-06-01", "09:45:00 AM"),      # its posting's moment
            (own.id, "debit_amount"): ("2083-06-02", "11:15:15 AM"),         # its own
            (payment.id, "credit_amount"): ("2083-06-21", "11:03:37 AM"),
            (payment.id, "discount_amount"): ("2083-06-21", "11:03:37 AM"),  # the payment's
        })

    def test_staff_trial_balance_times_and_who_paid_the_slip(self):
        year = dict(academic_year=self.ay, economic_year=self.fy)
        with self.signed_in(self.sankalpa):
            StaffLedger.objects.create(staff=self.teacher, school=self.school, total=20000, date="2083-06-01", **year)
            slip = StaffInvoice.objects.create(
                staff=self.teacher, school=self.school, invoice_id=5, date="2083-06-21",
                payment_month=6, total_paid=19000, total_deduction=1000, **year,
            )
        rows = StaffInvoiceView().getTrialBalance(self.teacher.id, self.school.id)
        self.assertEqual(len(rows), 3)  # the salary, the payment, its TDS line
        for row in rows:
            self.assertRegex(row["entered_time"], r"^\d{2}:\d{2}:\d{2} [AP]M$")
            self.assertRegex(row["entered_on"], r"^\d{4}-\d{2}-\d{2}$")
        for reader in (self.admin, self.prabeena):
            with self.signed_in(reader):
                printed = generateStaffInvoiceDataById(slip.id, self.teacher.id, self.school.id)
            self.assertEqual((printed["cashier"], printed["cashier_designation"]), ("Sankalpa Kumar KC", "accountant"))
        with self.signed_in(self.admin):
            by_admin = StaffInvoice.objects.create(
                staff=self.teacher, school=self.school, invoice_id=6, date="2083-06-22",
                payment_month=6, total_paid=500, **year,
            )
        with self.signed_in(self.sankalpa):
            printed = generateStaffInvoiceDataById(by_admin.id, self.teacher.id, self.school.id)
        self.assertEqual((printed["cashier"], printed["cashier_designation"]), ("admin", None))


class TransportEnrolmentTests(AuditSchoolWithStudent, TestCase):
    """Enrolling a student in transport with no station is refused before the
    running service is touched."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.stop = BusStation.objects.create(school=cls.school, station="Ghorahi Bazaar", fee=395)
        cls.running = StudentTransportationInfo.objects.create(
            student=cls.student, school=cls.school, bus_station=cls.stop, start_date="2083-01-01",
        )

    def setUp(self):
        self.addCleanup(users_context.set, None)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.objects.create(user=self.admin).key}")

    def enrol(self, **fields):
        return self.client.post("/api/students/transportations", {
            "student": self.student.id, "school": self.school.id, "strict": True, **fields,
        }, format="json")

    def test_no_station_changes_nothing(self):
        refused = self.enrol(start_date="2083-06-21")
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(refused.data["message"], "Choose a bus station first.")
        services = StudentTransportationInfo.objects.filter(student=self.student)
        self.assertEqual([(s.id, s.is_active) for s in services], [(self.running.id, True)])

    def test_a_station_replaces_the_running_service(self):
        other = BusStation.objects.create(school=self.school, station="Tulsipur Chowk", fee=500)
        started = self.enrol(bus_station=other.id, start_date="2083-06-21")
        self.assertEqual(started.status_code, 200, started.content)
        self.assertEqual(started.data["service"]["bus_station"], other.id)
        self.assertEqual(started.data["service"]["station"], "Tulsipur Chowk")
        self.running.refresh_from_db()
        self.assertFalse(self.running.is_active)
        self.assertEqual(StudentTransportationInfo.objects.filter(student=self.student, is_active=True).count(), 1)


class OneBrowserOneSignInTests(AuditSchool, TestCase):
    """What the portal's stale-tab check relies on. Every role signs in to the
    same cookie, so a browser holds one sign-in: a tab opened as someone else
    keeps its screen and acts as the newcomer."""

    def setUp(self):
        self.addCleanup(users_context.set, None)
        for account in (self.admin, self.sankalpa, self.prabeena):
            account.set_password("Secret#12345")
            account.save()
        self.browser = APIClient()

    def sign_in(self, role, username):
        answer = self.browser.post(f"/auth/{role}/signin", {"username": username, "password": "Secret#12345"}, format="json")
        self.assertEqual(answer.status_code, 200, answer.content)
        return answer.data["user"]

    def holder(self, role):
        answer = self.browser.get(f"/auth/{role}/obtain")
        self.assertEqual(answer.status_code, 200)
        return (answer.data or {}).get("user")

    def test_the_tab_can_tell_whose_session_the_browser_holds(self):
        signed = self.sign_in("staff", "sankalpa")
        asked = self.holder("staff")
        # the name a tab remembers from signing in is the name it is told later
        self.assertEqual((signed["username"], signed["role"]), (asked["username"], asked["role"]))

        self.sign_in("admin", "audit-admin")       # another tab, same browser
        self.assertIsNone(self.holder("staff"))    # the staff tab's portal has no session now
        self.assertEqual(self.holder("admin")["username"], "audit-admin")
        # and whatever that staff tab saves is the admin's doing
        paid = self.browser.post("/api/payments", {
            "school": self.school.id, "economic_year": self.fy.id, "academic_year": self.ay.id,
            "isCashReceipt": True, "payment_month": 6, "date": "2083-06-21", "total_paid": "1100",
            "details": [{"AMT": 1100, "PAR": "Transportation"}], "extra_info": {"name": "Aayushma"},
        }, format="json")
        self.assertEqual(paid.data["invoice"]["cashier"], "admin")

        self.sign_in("staff", "prabeena")          # a second member of staff
        self.assertEqual(self.holder("staff")["username"], "prabeena")
        self.assertIsNone(self.holder("admin"))
        self.assertIsNone(APIClient().get("/auth/staff/obtain").data.get("user"))  # no sign-in at all


class InvoiceAuditOverHttpTests(AuditSchool, TestCase):
    """The same thing through the real door: a signed-in member of staff pays,
    the school's own login reprints, and the receipt is the same receipt."""

    def setUp(self):
        # A request leaves its account in the context for the worker's next
        # request to clear (ResetUsersContextMiddleware). No request follows the
        # last one here, and the next test class would log its fixtures to it.
        self.addCleanup(users_context.set, None)

    def client_for(self, token_model, account):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"IGNITE {token_model.objects.create(user=account).key}")
        return client

    def test_staff_pays_admin_reprints_and_deletes(self):
        staff = self.client_for(StaffAuthToken, self.sankalpa)
        admin = self.client_for(AdminAuthToken, self.admin)
        paid = staff.post("/api/payments", {
            "school": self.school.id, "economic_year": self.fy.id, "academic_year": self.ay.id,
            "isCashReceipt": True, "payment_month": 6, "date": "2083-06-21", "total_paid": "1100",
            "details": [{"AMT": 1100, "PAR": "Transportation"}], "extra_info": {"name": "Aayushma"},
        }, format="json")
        self.assertEqual(paid.status_code, 200, paid.content)
        first = paid.data["invoice"]
        self.assertEqual(first["cashier"], "Sankalpa Kumar KC")
        self.assertTrue(first["entered_on"] and first["entered_time"])
        invoice = StudentInvoice.objects.get(school=self.school)

        reprint = admin.get("/api/payments", {"id": invoice.id, "school": self.school.id})
        self.assertEqual(reprint.status_code, 200, reprint.content)
        again = reprint.data["invoice"]
        self.assertEqual(
            (again["cashier"], again["entered_on"], again["entered_time"], again["deleted"]),
            (first["cashier"], first["entered_on"], first["entered_time"], None),
        )

        removed = admin.put("/api/payments", {
            "id": invoice.id, "school": self.school.id, "remarks": "entered twice",
        }, format="json")
        self.assertEqual(removed.status_code, 200, removed.content)
        after = staff.get("/api/payments", {"id": invoice.id, "school": self.school.id}).data["invoice"]
        self.assertEqual(after["cashier"], "Sankalpa Kumar KC")
        self.assertEqual(after["deleted"]["by"], "admin")
