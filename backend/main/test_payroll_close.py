from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.db import transaction
from django.test import TestCase
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken, SuperAdminAuthToken
from account.auth.context import users_context
from account.models import SuperAdminAccount
from accounting.models.AccountingEconomicYear import AccountingEconomicYear
from main.methods.payrollClose import (
    PayrollCloseError,
    closePayrollAfterYearSwitch,
    closePayrollYear,
    isPayrollClosed,
    duesBroughtForward,
    payrollYearsToClose,
    reopenPayrollYear,
    staffBalances,
)
from main.models.FiscalYears import EconomicYear
from main.models.Invoice import StaffInvoice
from main.models.Ledger import StaffLedger
from main.models.PayrollClose import StaffPayrollClose
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Staff import Staff
from main.test_invoice_audit import AuditSchool
from main.views.InvoiceViewsStaff import StaffInvoiceView
from main.views.LedgerViewsStaff import StaffLedgerView


def total(balance):
    return sum(balance.values(), Decimal(0))


class PayrollSchool(AuditSchool):
    """AuditSchool, working in 2083/84 with a year of payroll behind it.

    In 2082/83 Sankalpa was posted 30,000 and paid 20,000 of it (200 withheld
    as TDS): 10,000 still owed. Prabeena was posted 12,000 and paid 15,000:
    3,000 ahead.
    """

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.old = EconomicYear.objects.create(
            name="2082/83", start_date="2082-04-01", end_date="2083-03-32"
        )
        cls.books = AccountingEconomicYear.objects.create(
            school=cls.school, name="AFY 2082/83", start_date="2082-04-01", end_date="2083-03-31",
        )
        cls.teacher = Staff.objects.get(account=cls.sankalpa)
        cls.clerk = Staff.objects.get(account=cls.prabeena)
        last_year = dict(school=cls.school, academic_year=cls.ay, economic_year=cls.old)
        StaffLedger.objects.create(
            staff=cls.teacher, months=[11, 12], date="2083-01-05", total=30000,
            details={"salary": 25000, "allowance": 5000}, **last_year,
        )
        StaffInvoice.objects.create(
            staff=cls.teacher, invoice_id=1, date="2083-02-10", payment_month=11,
            total_paid=19800, total_deduction=200,
            details={"salary": {"amt": 20000, "tdsp": 1, "tdsa": 200}}, **last_year,
        )
        StaffLedger.objects.create(
            staff=cls.clerk, months=[12], date="2083-01-05", total=12000,
            details={"salary": 12000}, **last_year,
        )
        StaffInvoice.objects.create(
            staff=cls.clerk, invoice_id=2, date="2083-03-01", payment_month=12,
            total_paid=15000, details={"salary": {"amt": 15000}}, **last_year,
        )

    def close(self, accounting_year=None):
        with transaction.atomic():
            return closePayrollYear(self.school.id, self.old, accounting_year)

    def carried(self, year):
        return {
            (row.staff_id, next(iter(row.details))): row.total
            for row in StaffLedger.objects.filter(
                school=self.school, economic_year=year, is_active=True,
                details__has_any_keys=["ob", "cfo"],
            )
        }


class PayrollCloseTests(PayrollSchool, TestCase):
    def test_the_balance_moves_into_the_next_year(self):
        before = {
            staff: total(staffBalances(self.school.id, self.old.id)[staff])
            for staff in (self.teacher.id, self.clerk.id)
        }
        self.assertEqual(before, {self.teacher.id: 10000, self.clerk.id: -3000})
        # a stray year dated inside the one closing is not "the next year"
        EconomicYear.objects.create(name="stray", start_date="2083-01-01", end_date="2083-01-01")
        close = self.close()
        # moved, not copied: the old year is at zero, the new one holds it
        for balance in staffBalances(self.school.id, self.old.id).values():
            self.assertEqual(total(balance), 0)
        opened = staffBalances(self.school.id, self.fy.id)
        self.assertEqual(opened[self.teacher.id]["ob"], 10000)
        self.assertEqual(opened[self.clerk.id]["ob"], -3000)  # paid ahead: carried too
        self.assertEqual(self.carried(self.old), {
            (self.teacher.id, "cfo"): -10000, (self.clerk.id, "cfo"): 3000,
        })
        self.assertEqual(self.carried(self.fy), {
            (self.teacher.id, "ob"): 10000, (self.clerk.id, "ob"): -3000,
        })
        self.assertEqual((close.staff_count, close.total_carried), (2, 7000))
        self.assertEqual((close.carried_out_on, close.carried_in_on), ("2083-03-32", "2083-04-01"))
        self.assertEqual(close.next_economic_year, self.fy)
        self.assertEqual(close.breakdown[str(self.teacher.id)], {"salary": "5000.00", "allowance": "5000.00"})

    def test_a_settled_member_of_staff_gets_no_lines(self):
        StaffInvoice.objects.create(
            staff=self.teacher, school=self.school, academic_year=self.ay, economic_year=self.old,
            invoice_id=3, date="2083-03-20", payment_month=12, total_paid=10000,
            details={"salary": {"amt": 5000}, "allowance": {"amt": 5000}},
        )
        close = self.close()
        self.assertEqual(close.staff_count, 1)
        self.assertNotIn((self.teacher.id, "ob"), self.carried(self.fy))

    def test_closing_twice_carries_once(self):
        self.close()
        self.assertIsNone(self.close())
        self.assertEqual(len(self.carried(self.fy)), 2)
        self.assertEqual(StaffPayrollClose.objects.filter(is_active=True).count(), 1)

    def test_a_year_with_no_payroll_and_the_working_year_are_left_alone(self):
        with transaction.atomic():
            self.assertIsNone(closePayrollYear(self.school.id, EconomicYear.objects.create(
                name="2081/82", start_date="2081-04-01", end_date="2082-03-31",
            )))
        # 2083/84 is the latest year: there is nowhere to carry it to
        StaffLedger.objects.create(
            staff=self.teacher, school=self.school, academic_year=self.ay, economic_year=self.fy,
            date="2083-05-01", total=100, details={"salary": 100},
        )
        with self.assertRaises(PayrollCloseError), transaction.atomic():
            closePayrollYear(self.school.id, self.fy)
        self.assertEqual(StaffPayrollClose.objects.count(), 0)

    def test_which_years_an_accounting_close_takes(self):
        # the year end is typed 03-30, 03-31, 03-32 and 04-01 across schools
        for end in ("2083-03-30", "2083-03-31", "2083-03-32", "2083-04-01"):
            self.books.end_date = end
            self.assertEqual(payrollYearsToClose(self.school.id, self.books), [self.old], end)
        # the year the school is working in is never one of them
        this_year = AccountingEconomicYear(school=self.school, start_date="2083-04-01", end_date="2084-03-31")
        StaffLedger.objects.create(
            staff=self.teacher, school=self.school, academic_year=self.ay, economic_year=self.fy,
            date="2083-05-01", total=100, details={"salary": 100},
        )
        self.assertEqual(payrollYearsToClose(self.school.id, this_year), [])
        self.close()
        self.assertEqual(payrollYearsToClose(self.school.id, self.books), [])  # already closed

    def test_undo_takes_the_carried_lines_away(self):
        close = self.close()
        with transaction.atomic():
            self.assertEqual(reopenPayrollYear(close), 4)
        self.assertFalse(isPayrollClosed(self.school.id, self.old.id))
        self.assertEqual(self.carried(self.old), {})
        self.assertEqual(self.carried(self.fy), {})
        self.assertEqual(total(staffBalances(self.school.id, self.old.id)[self.teacher.id]), 10000)
        # and the year can be closed again, to the same figures
        self.assertEqual(self.close().total_carried, 7000)

    def test_a_close_cannot_be_undone_under_a_later_one(self):
        close = self.close()
        later = EconomicYear.objects.create(name="2084/85", start_date="2084-04-01", end_date="2085-03-31")
        with transaction.atomic():
            self.assertIsNotNone(closePayrollYear(self.school.id, self.fy))
        with self.assertRaises(PayrollCloseError), transaction.atomic():
            reopenPayrollYear(close)
        # the chain: what 2082/83 carried in went on into 2084/85
        self.assertEqual(staffBalances(self.school.id, later.id)[self.teacher.id]["ob"], 10000)

    def test_the_year_switch_closes_a_year_whose_books_were_already_closed(self):
        previous = {self.school.id: self.old.id}
        with transaction.atomic():
            self.assertEqual(closePayrollAfterYearSwitch(previous, self.fy), [])  # books still open
        AccountingEconomicYear.objects.filter(id=self.books.id).update(closed=True)
        with transaction.atomic():
            closes = closePayrollAfterYearSwitch(previous, self.fy)
        self.assertEqual([c.accounting_economic_year_id for c in closes], [self.books.id])
        self.assertTrue(isPayrollClosed(self.school.id, self.old.id))


class PayrollCloseScreenTests(PayrollSchool, TestCase):
    """What the payroll screens say once a year has been closed."""

    def setUp(self):
        self.addCleanup(users_context.set, None)
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.objects.create(user=self.admin).key}"
        )

    def post_salary(self, year, details=None):
        return self.client.post("/api/staff_ledgers", {
            "school": self.school.id, "academic_year": self.ay.id, "economic_year": year.id,
            "date": "2083-05-01", "months": [1],
            "ledgers": [{"staff": self.teacher.id, "details": details or {"salary": 4000}, "total": 4000}],
        }, format="json")

    def pay(self, year, details, paid, **extra):
        return self.client.post("/api/staff_payments", {
            "school": self.school.id, "academic_year": self.ay.id, "economic_year": year.id,
            "staff": self.teacher.id, "date": "2083-05-02", "payment_month": 1, "mode": 1,
            "total_paid": paid, "details": details, **extra,
        }, format="json")

    def ledger(self, year):
        return self.client.get("/api/staff_ledgers", {
            "school": self.school.id, "staff": self.teacher.id, "economic_year": year.id,
        }).json()

    def test_a_closed_year_takes_no_postings_payments_or_deletions(self):
        self.assertEqual(self.post_salary(self.old).status_code, 200)  # open: accepted
        posted = StaffLedger.objects.filter(economic_year=self.old, staff=self.teacher).latest("id")
        self.close()
        refused = self.post_salary(self.old)
        self.assertEqual(refused.status_code, 400)
        self.assertIn("2082/83 is closed", refused.json()["message"])
        self.assertEqual(self.pay(self.old, {"salary": {"amt": 100}}, 100).status_code, 400)
        delete = {"school": self.school.id, "remarks": "typo"}
        self.assertEqual(self.client.put("/api/staff_ledgers", {"id": posted.id, **delete}, format="json").status_code, 400)
        paid = StaffInvoice.objects.filter(economic_year=self.old, staff=self.teacher).first()
        self.assertEqual(self.client.put("/api/staff_payments", {"id": paid.id, **delete}, format="json").status_code, 400)
        self.assertTrue(StaffLedger.objects.get(id=posted.id).is_active)
        self.assertTrue(StaffInvoice.objects.get(id=paid.id).is_active)
        # the year the school is working in is untouched by any of this
        self.assertEqual(self.post_salary(self.fy).status_code, 200)

    def test_nobody_can_post_a_carried_line_by_hand(self):
        self.assertEqual(self.post_salary(self.fy, {"ob": 4000}).status_code, 400)
        self.assertEqual(self.post_salary(self.fy, {"cfo": -4000}).status_code, 400)

    def test_old_dues_head_the_payment_screen_until_they_are_paid(self):
        untouched = self.ledger(self.fy)
        self.assertNotIn("ob", untouched["bill_amount"])  # nothing carried: no such row
        self.close()
        opened = self.ledger(self.fy)
        self.assertEqual(list(opened["bill_amount"])[0], "ob")
        self.assertEqual((opened["bill_amount"]["ob"], opened["total"]), (10000, 10000))
        self.assertEqual(self.pay(self.fy, {"ob": {"amt": 6000, "tdsp": 1, "tdsa": 60}}, 5940, total_deduction=60).status_code, 200)
        self.assertEqual(self.ledger(self.fy)["bill_amount"]["ob"], 4000)
        self.assertEqual(self.pay(self.fy, {"ob": {"amt": 4000}}, 4000).status_code, 200)
        settled = self.ledger(self.fy)
        self.assertNotIn("ob", settled["bill_amount"])  # paid off: the row goes
        self.assertEqual(settled["total"], 0)
        # the closed year reads as settled, by what was carried out of it
        self.assertEqual(self.ledger(self.old)["total"], 0)

    def test_the_staff_picker_agrees_with_the_ledger(self):
        self.close()
        # PF and insurance settle the salary as TDS does
        self.post_salary(self.fy)
        self.pay(self.fy, {"salary": {"amt": 4000, "tdsp": 1, "tdsa": 40}}, 3660,
                 total_deduction=40, pf_deduction=200, insurance_deduction=100)
        picked = self.client.post("/api/search/staffs", {
            "school": self.school.id, "include_balance": True, "economic_year": self.fy.id,
        }, format="json").json()
        balances = {row["id"]: Decimal(str(row["balance"])) for row in picked}
        self.assertEqual(balances[self.teacher.id], 10000)  # the old dues, salary settled
        self.assertEqual(balances[self.clerk.id], -3000)
        self.assertEqual(self.ledger(self.fy)["total"], 10000)

    def test_someone_who_left_still_owed_money_stays_on_the_payroll_picker(self):
        self.close()
        DEPARTED = 2
        Staff.objects.filter(id__in=[self.teacher.id, self.clerk.id]).update(status=DEPARTED)
        gone = Staff.objects.create(
            role=self.role, first_name="Gone", last_name="Settled", primary_contact="9800000001",
            location="Ghorahi", school=self.school, status=DEPARTED,
            account=type(self.sankalpa).objects.create(username="gone"),
        )
        search = lambda **extra: self.client.post("/api/search/staffs", {
            "school": self.school.id, **extra,
        }, format="json").json()
        picked = {row["id"]: row for row in search(include_balance=True, economic_year=self.fy.id)}
        # owed 10,000 and 3,000 ahead: both still listed, and marked as gone
        self.assertEqual({i: row["status"] for i, row in picked.items()},
                         {self.teacher.id: DEPARTED, self.clerk.id: DEPARTED})
        self.assertNotIn(gone.id, picked)  # left with nothing outstanding
        # every other staff list is the working staff, as it was
        self.assertEqual(search(), [])
        self.assertEqual({row["id"] for row in search(status=DEPARTED, include_balance=True, economic_year=self.fy.id)},
                         {self.teacher.id, self.clerk.id, gone.id})

    def test_the_statement_shows_the_balance_leaving_and_arriving(self):
        view = StaffInvoiceView()
        running = lambda rows: sum(
            (row.get("debit_amount") or 0) - (row.get("credit_amount") or row.get("tds_amount") or 0)
            for row in rows
        )
        before = view.getTrialBalance(self.teacher.id, self.school.id)
        self.close()
        rows = view.getTrialBalance(self.teacher.id, self.school.id)
        self.assertEqual(running(rows), running(before))  # all years: unchanged
        out, arrived = rows[-2], rows[-1]
        self.assertEqual((out["date"], out["particulars"], out["tds_amount"]),
                         ("2083-03-32", [["carried forward", 10000]], 10000))
        self.assertNotIn("debit_amount", out)
        self.assertEqual((arrived["date"], arrived["particulars"], arrived["debit_amount"]),
                         ("2083-04-01", [["old dues", 10000.0]], 10000))
        # only the lines of the closed year are locked
        self.assertEqual([row["closed"] for row in rows], [True, True, True, True, False])

    def sheet(self, start, end):
        rows = self.client.get("/api/staff_payments", {
            "school": self.school.id, "salary_sheet": True, "start_date": start, "end_date": end,
        }).json()
        return {row["staff"]: row for row in rows}

    def test_closing_changes_nothing_on_the_closed_years_salary_sheet(self):
        before = self.sheet("2082-04-01", "2083-03-32")
        self.close()
        after = self.sheet("2082-04-01", "2083-03-32")
        self.assertEqual(before, after)
        self.assertEqual((after[self.teacher.id]["total"], after[self.teacher.id]["balance"]), (30000, 10000))

    def test_the_new_years_salary_sheet_opens_with_the_old_dues(self):
        self.close()
        self.post_salary(self.fy)  # 4,000 dated 2083-05-01
        self.pay(self.fy, {"ob": {"amt": 6000}}, 6000)  # dated 2083-05-02
        teacher = self.sheet("2083-04-01", "2083-12-30")[self.teacher.id]
        # carried lines are not salary: gross is this year's posting alone
        self.assertEqual((teacher["previous_dues"], teacher["total"], teacher["paid"], teacher["balance"]),
                         (10000, 4000, 6000, 8000))
        self.assertEqual(self.sheet("2083-04-01", "2083-12-30")[self.clerk.id]["previous_dues"], -3000)
        # a range holding both years already has what the old dues are made of
        both = self.sheet("2082-04-01", "2083-12-30")[self.teacher.id]
        self.assertEqual((both["previous_dues"], both["total"], both["balance"]), (0, 34000, 8000))

    def test_any_range_opens_with_what_was_owed_before_it(self):
        self.close()
        self.post_salary(self.fy)  # 4,000 dated 2083-05-01
        self.pay(self.fy, {"ob": {"amt": 6000}}, 6000)  # dated 2083-05-02
        # the month after: nothing posted or paid in it, and still 8,000 owed
        later = self.sheet("2083-06-01", "2083-06-30")[self.teacher.id]
        self.assertEqual((later["previous_dues"], later["total"], later["paid"], later["balance"]),
                         (8000, 0, 0, 8000))
        # a range that starts after the old dues arrived still opens with them
        month = self.sheet("2083-05-01", "2083-05-30")[self.teacher.id]
        self.assertEqual((month["previous_dues"], month["total"], month["paid"], month["balance"]),
                         (10000, 4000, 6000, 8000))
        # whatever the range, the sheet ends on what the payment screen says
        self.assertEqual(self.ledger(self.fy)["total"], 8000)
        # inside the closed year too: an unpaid month is owed in the month after it
        other = self.sheet("2083-02-01", "2083-02-30")[self.teacher.id]
        self.assertEqual((other["previous_dues"], other["paid"], other["balance"]), (30000, 19800, 10000))

    def test_someone_who_left_still_owed_money_is_on_the_salary_sheet(self):
        self.close()
        DEPARTED = 2
        Staff.objects.filter(id=self.teacher.id).update(status=DEPARTED)
        Staff.objects.filter(id=self.clerk.id).update(status=DEPARTED)
        gone = Staff.objects.create(
            role=self.role, first_name="Gone", last_name="Settled", primary_contact="9800000001",
            location="Ghorahi", school=self.school, status=DEPARTED,
            account=type(self.sankalpa).objects.create(username="gone"),
        )
        sheet = self.sheet("2083-04-01", "2083-12-30")
        self.assertEqual({staff: (row["status"], row["balance"]) for staff, row in sheet.items()},
                         {self.teacher.id: (DEPARTED, 10000), self.clerk.id: (DEPARTED, -3000)})
        self.assertNotIn(gone.id, sheet)  # left with nothing outstanding and nothing in the range

    def test_old_dues_follow_the_date_where_the_year_stamp_disagrees(self):
        self.close()
        # entered after the year moved on, but dated back into the old one
        StaffInvoice.objects.create(
            staff=self.teacher, school=self.school, academic_year=self.ay, economic_year=self.fy,
            invoice_id=9, date="2083-03-32", payment_month=12, total_paid=2500,
            details={"ob": {"amt": 2500}},
        )
        self.assertEqual(self.ledger(self.fy)["total"], 7500)
        dues = duesBroughtForward(self.school.id, "2083-04-01", "2083-12-30")
        self.assertEqual(dues[self.teacher.id], 7500)  # what the payment screen says
        # and the other way round: stamped with the closed year, dated in the new
        # one. It is in the sheet's Paid column, and already inside the old dues.
        StaffInvoice.objects.filter(invoice_id=9).update(is_active=False)
        with transaction.atomic():
            reopenPayrollYear(StaffPayrollClose.objects.get(is_active=True))
        StaffInvoice.objects.create(
            staff=self.teacher, school=self.school, academic_year=self.ay, economic_year=self.old,
            invoice_id=10, date="2083-04-03", payment_month=12, total_paid=1000,
            details={"salary": {"amt": 1000}},
        )
        self.close()
        row = self.sheet("2083-04-01", "2083-12-30")[self.teacher.id]
        self.assertEqual((row["previous_dues"], row["paid"], row["balance"]), (10000, 1000, 9000))
        self.assertEqual(self.ledger(self.fy)["total"], 9000)

    def test_the_pay_slip_list_says_what_each_slip_paid(self):
        self.close()
        self.pay(self.fy, {"ob": {"amt": 6000}, "salary": {"amt": 500}}, 6500)
        StaffInvoice.objects.create(
            staff=self.clerk, school=self.school, academic_year=self.ay, economic_year=self.fy,
            invoice_id=40, date="2083-05-03", payment_month=1, total_paid=100,
        )
        slips = self.client.get("/api/staff_payments", {"school": self.school.id}).json()["results"]
        self.assertEqual([slip["paid_for"] for slip in slips[:2]], [["salary"], ["old dues", "salary"]])

    def test_the_staff_details_report_can_show_what_each_is_owed(self):
        self.close()
        rows = self.client.post("/api/search/staffs", {
            "school": self.school.id, "status": "1", "finance": True,
            "include_balance": True, "economic_year": self.fy.id,
        }, format="json").json()
        self.assertEqual({row["id"]: Decimal(str(row["balance"])) for row in rows},
                         {self.teacher.id: 10000, self.clerk.id: -3000})

    def test_the_salary_sheet_answers_on_the_v2_route_too(self):
        answer = self.client.get("/api/v2/staff_payments", {
            "school": self.school.id, "salary_sheet": True, "start_date": "2083-01-01", "end_date": "2083-03-32",
        })
        self.assertIn(answer.status_code, (200, 404))  # 404 only if v2 has no such route; never 500
        if answer.status_code == 200:
            self.assertEqual({row["staff"] for row in answer.json()}, {self.teacher.id, self.clerk.id})


class AccountingCloseTests(PayrollSchool, TestCase):
    """Closing the books closes the payroll of that year in the same breath."""

    def setUp(self):
        self.addCleanup(users_context.set, None)
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.objects.create(user=self.admin).key}"
        )

    def close_books(self):
        return self.client.post("/accounting/economic_year/closing", {
            "school": self.school.id, "id": self.books.id,
            "new_accounting_economic_year": {
                "name": "AFY 2083/84", "start_date": "2083-04-01", "end_date": "2084-03-31",
            },
        }, format="json")

    def test_the_payroll_year_closes_with_the_books(self):
        preview = self.client.get("/api/payroll/year_close", {
            "school": self.school.id, "accounting_economic_year": self.books.id,
        }).json()
        self.assertEqual(preview["closed"], [])
        (pending,) = preview["pending"]
        self.assertEqual((pending["economic_year"]["name"], pending["next_economic_year"]["name"]),
                         ("2082/83", "2083/84"))
        self.assertEqual((pending["staff_count"], pending["total"]), (2, 7000))
        self.assertEqual([row["name"] for row in pending["rows"]], ["Prabeena Chaudhary", "Sankalpa Kumar KC"])

        closed = self.close_books()
        self.assertEqual(closed.status_code, 200, closed.content)
        self.assertIn("Payroll 2082/83 closed with it: Rs 7,000.00 for 2 staff", closed.json()["message"])
        close = StaffPayrollClose.objects.get(school=self.school, is_active=True)
        self.assertEqual((close.economic_year, close.accounting_economic_year_id), (self.old, self.books.id))
        self.assertEqual(staffBalances(self.school.id, self.fy.id)[self.teacher.id]["ob"], 10000)
        after = self.client.get("/api/payroll/year_close", {
            "school": self.school.id, "accounting_economic_year": self.books.id,
        }).json()
        self.assertEqual((len(after["closed"]), after["pending"]), (1, []))

    def test_undoing_the_books_reopens_the_payroll(self):
        self.close_books()
        superadmin = SuperAdminAccount.objects.create(username="root")
        undo = APIClient()
        undo.credentials(
            HTTP_AUTHORIZATION=f"IGNITE {SuperAdminAuthToken.objects.create(user=superadmin).key}"
        )
        done = undo.post("/accounting/economic_year/closing/undo", {
            "school": self.school.id, "closed_economic_year": self.books.id,
        }, format="json")
        self.assertEqual(done.status_code, 200, done.content)
        self.assertIn("Payroll 2082/83 reopened", done.json()["message"])
        self.assertFalse(isPayrollClosed(self.school.id, self.old.id))
        self.assertNotIn("ob", staffBalances(self.school.id, self.fy.id).get(self.teacher.id, {}))
        self.assertFalse(AccountingEconomicYear.objects.get(id=self.books.id).closed)

    def test_the_command_is_a_dry_run_until_told_otherwise(self):
        AccountingEconomicYear.objects.filter(id=self.books.id).update(closed=True)
        out = StringIO()
        call_command("close_payroll_year", school=[self.school.id], stdout=out)
        self.assertIn("2 staff, Rs 7,000.00 to carry", out.getvalue())
        self.assertEqual(StaffPayrollClose.objects.count(), 0)
        self.assertEqual(StaffLedger.objects.filter(details__has_any_keys=["ob", "cfo"]).count(), 0)
        call_command("close_payroll_year", school=[self.school.id], apply=True, stdout=out)
        close = StaffPayrollClose.objects.get()
        self.assertEqual((close.total_carried, close.accounting_economic_year_id), (7000, self.books.id))
        # a second run finds nothing left to do
        call_command("close_payroll_year", school=[self.school.id], apply=True, stdout=out)
        self.assertEqual(StaffPayrollClose.objects.count(), 1)
        call_command("close_payroll_year", school=[self.school.id], economic_year=self.old.id,
                     undo=True, apply=True, stdout=out)
        self.assertFalse(isPayrollClosed(self.school.id, self.old.id))
