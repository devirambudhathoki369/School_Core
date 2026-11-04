"""The canteen, end to end through the real URLs and token authentication."""

from decimal import Decimal

from django.core.cache import cache
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken, StaffAuthToken, SuperAdminAuthToken
from account.auth.context import users_context
from account.models import AdminAccount, SuperAdminAccount
from main.methods.academicYear import gen_class_key
from main.models.ClassInfo import CLASS_DETAILS_FIELDS, ClassInfo
from main.models.FiscalYears import AcademicYear, AcademicYearMapping
from main.methods.schoolModules import set_school_modules
from main.models.Invoice import StudentInvoice
from main.models.Ledger import StudentLedger
from main.models.SchoolAdmin import SchoolAdmin
from main.test_invoice_audit import AuditSchoolWithStudent
from main.views.LedgerViews import LedgerView

from main.models.Staff import Staff
from main.models.Student import Student, StudentGuardianInfo

from .constants import (
    BUYER_STAFF, BUYER_STUDENT, BUYER_WALKIN, PAGE_ACCOUNTS, PAGE_COLLECT, PAGE_COUNTER, PAGE_ITEMS, PAGE_PROFILE,
    PAGE_MONTHLY_POSTING, PAGE_REPORTS, PAGE_USE_TYPES, PAGE_USER_SETUP, PAGE_USERS, PAGES,
    PAY_ACCOUNT, PAY_CASH, PAY_PLAN, TXN_POSTING,
)
from .methods.balances import balance
from .models import (
    CanteenAccount, CanteenEnrollment, CanteenItem, CanteenPlan, CanteenSale, CanteenTransaction, CanteenUser,
    CanteenUserToken,
)


def grant_canteen(school, on=True):
    """Switch the school's canteen grant (main.SchoolModule) on or off."""
    set_school_modules(school, {"canteen": on})


class CanteenFixture(AuditSchoolWithStudent):
    def setUp(self):
        self.addCleanup(users_context.set, None)
        cache.clear()
        grant_canteen(self.school, True)
        self.client = APIClient()
        self.client.credentials(
            HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.objects.create(user=self.admin).key}"
        )
        self.samosa = CanteenItem.objects.create(school=self.school, name="Samosa", price="25.00")
        self.juice = CanteenItem.objects.create(school=self.school, name="Juice", price="40.00")
        details = ClassInfo.objects.filter(id=self.ten.id).values(*CLASS_DETAILS_FIELDS).first()
        AcademicYearMapping.objects.create(
            school=self.school, key=gen_class_key(details), academic_year=self.ay,
        )

    def call(self, method, path, data=None, client=None, **params):
        client = client or self.client
        if method in ("get", "delete"):
            return getattr(client, method)(
                path + ("?" + "&".join(f"{k}={v}" for k, v in {"school": self.school.id, **params}.items())),
            )
        return getattr(client, method)(path, {"school": self.school.id, **(data or {})}, format="json")

    def sell(self, lines, payment=PAY_CASH, buyer_type=BUYER_WALKIN, buyer=None, **extra):
        return self.call("post", "/canteen/sales", {
            "lines": [{"item": item.id, "qty": qty} for item, qty in lines],
            "payment": payment, "buyer_type": buyer_type, "buyer": buyer,
            "date": "2083-07-10", **extra,
        })

    def top_up(self, amount, **extra):
        return self.call("post", "/canteen/accounts", {
            "action": "topup", "buyer_type": BUYER_STUDENT, "buyer": self.student.id,
            "amount": amount, "date": "2083-07-10", **extra,
        })

    def account(self):
        return CanteenAccount.objects.get(school=self.school, student=self.student, is_active=True)


class GateTests(CanteenFixture, TestCase):
    def test_a_school_without_the_module_is_refused(self):
        grant_canteen(self.school, False)
        cache.clear()
        res = self.call("get", "/canteen/items")
        self.assertEqual(res.status_code, 403)
        self.assertIn("not enabled", res.json()["message"])

    def test_another_schools_login_cannot_read_this_school(self):
        other = AdminAccount.objects.create(username="other-admin")
        grant_canteen(SchoolAdmin.objects.create(
            name="Other", address="x", estd_date="2080-01-01", renew_date="2084-01-01",
            pan_no="9", email="o@example.com", account=other, economic_year=self.fy,
        ))
        stranger = APIClient()
        stranger.credentials(HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.objects.create(user=other).key}")
        res = self.call("get", "/canteen/items", client=stranger)
        self.assertIn(res.status_code, (401, 403))

    def test_superadmin_switches_a_school_on_and_off(self):
        root = APIClient()
        root.credentials(HTTP_AUTHORIZATION=(
            f"IGNITE {SuperAdminAuthToken.objects.create(user=SuperAdminAccount.objects.create(username='root')).key}"
        ))
        self.top_up(300)
        off = root.put("/canteen/manage/access", {"school": self.school.id, "uses_canteen": False}, format="json")
        self.assertEqual(off.status_code, 200, off.content)
        self.assertIn("300.00", off.json()["message"])  # money held is said out loud
        self.assertEqual(self.call("get", "/canteen/items").status_code, 403)  # applies at once
        listed = {s["id"]: s for s in root.get("/canteen/manage/access").json()["schools"]}
        self.assertEqual((listed[self.school.id]["uses_canteen"], listed[self.school.id]["held"]), (False, 300))
        root.put("/canteen/manage/access", {"school": self.school.id, "uses_canteen": True}, format="json")
        self.assertEqual(balance(self.account().id), Decimal("300.00"))  # nothing was deleted


class CounterTests(CanteenFixture, TestCase):
    def test_the_price_comes_from_the_item_not_the_client(self):
        res = self.sell([(self.samosa, 2), (self.juice, 1)], lines_price_hint=1)
        self.assertEqual(res.status_code, 200, res.content)
        sale = res.json()
        self.assertEqual((sale["sale_no"], Decimal(sale["total"])), (1, Decimal("90.00")))
        self.assertEqual(sorted((l["name"], l["qty"]) for l in sale["lines"]), [("Juice", 1), ("Samosa", 2)])
        self.assertEqual(self.sell([(self.samosa, 1)]).json()["sale_no"], 2)

    def test_a_retried_ring_up_is_not_charged_twice(self):
        first = self.sell([(self.samosa, 1)], client_key="key-12345678").json()
        again = self.sell([(self.samosa, 1)], client_key="key-12345678").json()
        self.assertEqual((again["id"], again["duplicate"]), (first["id"], True))
        self.assertEqual(CanteenSale.objects.filter(school=self.school).count(), 1)

    def test_sold_out_and_unknown_items_are_refused(self):
        CanteenItem.objects.filter(id=self.juice.id).update(is_available=False)
        res = self.sell([(self.juice, 1)])
        self.assertEqual(res.status_code, 400)
        self.assertIn("sold out", res.json()["message"])
        self.assertEqual(self.sell([(self.samosa, 100)]).status_code, 400)

    def test_a_walk_in_cannot_pay_from_an_account(self):
        res = self.sell([(self.samosa, 1)], payment=PAY_ACCOUNT)
        self.assertEqual(res.status_code, 400)

    def test_the_card_finds_the_student(self):
        type(self.student).objects.filter(id=self.student.id).update(rfid_card="0012345678")
        found = self.call("get", "/canteen/buyers", card="0012345678").json()
        self.assertEqual([(b["buyer_type"], b["id"]) for b in found["buyers"]], [(BUYER_STUDENT, self.student.id)])
        self.assertEqual(found["buyers"][0]["detail"], "Seven")  # grade 10 is class seven
        by_name = self.call("get", "/canteen/buyers", q="aayush").json()["buyers"]
        self.assertEqual([b["name"] for b in by_name], ["Aayushma Chaudhary"])

    def test_a_staff_sale_names_who_rang_it_up(self):
        Staff.objects.filter(account=self.sankalpa).update(permissions=[PAGE_COUNTER])
        counter = APIClient()
        counter.credentials(HTTP_AUTHORIZATION=f"IGNITE {StaffAuthToken.objects.create(user=self.sankalpa).key}")
        res = counter.post("/canteen/sales", {
            "school": self.school.id, "lines": [{"item": self.samosa.id, "qty": 1}],
            "payment": PAY_CASH, "buyer_type": BUYER_STAFF, "buyer": self.teacher.id,
        }, format="json")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()["entered_by"], "Sankalpa Kumar KC")


class AccountTests(CanteenFixture, TestCase):
    def test_prepaid_means_no_top_up_no_sale(self):
        res = self.sell([(self.samosa, 1)], payment=PAY_ACCOUNT, buyer_type=BUYER_STUDENT, buyer=self.student.id)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Not enough", res.json()["message"])
        receipt = self.top_up("100").json()
        self.assertEqual((receipt["receipt_no"], Decimal(receipt["balance"])), (1, Decimal("100.00")))
        ok = self.sell([(self.samosa, 2)], payment=PAY_ACCOUNT, buyer_type=BUYER_STUDENT, buyer=self.student.id)
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(Decimal(ok.json()["balance_after"]), Decimal("50.00"))
        too_much = self.sell([(self.juice, 2)], payment=PAY_ACCOUNT, buyer_type=BUYER_STUDENT, buyer=self.student.id)
        self.assertEqual(too_much.status_code, 400)
        self.assertEqual(balance(self.account().id), Decimal("50.00"))

    def test_daily_limit_and_a_blocked_card(self):
        self.top_up(500)
        self.call("put", "/canteen/accounts", {"id": self.account().id, "daily_limit": "60"})
        args = dict(payment=PAY_ACCOUNT, buyer_type=BUYER_STUDENT, buyer=self.student.id)
        self.assertEqual(self.sell([(self.juice, 1)], **args).status_code, 200)
        over = self.sell([(self.samosa, 1)], **args)
        self.assertEqual(over.status_code, 400)
        self.assertIn("Daily limit", over.json()["message"])
        self.call("put", "/canteen/accounts", {"id": self.account().id, "daily_limit": "", "is_blocked": True,
                                               "block_reason": "card lost"})
        blocked = self.sell([(self.samosa, 1)], **args)
        self.assertEqual(blocked.status_code, 403)
        self.assertIn("card lost", blocked.json()["message"])
        self.assertEqual(self.sell([(self.samosa, 1)], buyer_type=BUYER_STUDENT, buyer=self.student.id).status_code, 200)

    def test_voiding_a_sale_puts_the_money_back_and_keeps_its_number(self):
        self.top_up(100)
        sale = self.sell([(self.juice, 1)], payment=PAY_ACCOUNT, buyer_type=BUYER_STUDENT, buyer=self.student.id).json()
        self.assertEqual(balance(self.account().id), Decimal("60.00"))
        void = self.call("delete", "/canteen/sales", id=sale["id"], remarks="wrong child")
        self.assertEqual(void.status_code, 200, void.content)
        self.assertEqual(balance(self.account().id), Decimal("100.00"))
        self.assertEqual(self.sell([(self.samosa, 1)]).json()["sale_no"], 2)

    def test_refunds_only_give_back_what_is_there_and_a_void_makes_it_owed(self):
        topup = self.top_up(100).json()
        self.sell([(self.juice, 2)], payment=PAY_ACCOUNT, buyer_type=BUYER_STUDENT, buyer=self.student.id)
        refund = self.call("post", "/canteen/accounts", {
            "action": "refund", "buyer_type": BUYER_STUDENT, "buyer": self.student.id, "amount": 50,
        })
        self.assertEqual(refund.status_code, 400)
        ok = self.call("post", "/canteen/accounts", {
            "action": "refund", "buyer_type": BUYER_STUDENT, "buyer": self.student.id, "amount": 20,
        }).json()
        self.assertEqual((ok["receipt_no"], Decimal(str(ok["balance"]))), (2, Decimal("0.00")))
        # the top-up voided as a mistake: what it paid for is owed again
        void = self.call("delete", "/canteen/accounts", txn=topup["id"])
        self.assertEqual(void.status_code, 200, void.content)
        self.assertEqual(balance(self.account().id), Decimal("-100.00"))


class BillingFixture(CanteenFixture):
    """The usual three use types, and helpers to rate, enrol, post and collect."""

    def setUp(self):
        super().setUp()
        added = self.call("post", "/canteen/plans", {"standard": True}).json()
        self.assertEqual(added["added"], ["Day care", "Tiffin monthly", "Tiffin cash or due"])
        self.plans = {p["name"]: p for p in self.call("get", "/canteen/plans").json()}
        self.tiffin = CanteenItem.objects.get(school=self.school, name="Tiffin")
        self.day_care = CanteenItem.objects.get(school=self.school, name="Day care")
        self.key = "g10"     # the fixture's class: grade 10, class Seven

    def rates(self, item, **by_key):
        res = self.call("put", "/canteen/class-rates", {
            "item": item.id, "rates": [{"key": k, "label": k, "monthly_rate": v} for k, v in by_key.items()],
        })
        self.assertEqual(res.status_code, 200, res.content)

    def enroll(self, plan_name, rate=None, start="2083-04-01"):
        data = {"plan": self.plans[plan_name]["id"], "students": [self.student.id], "start_date": start}
        if rate is not None:
            data["rate"] = rate
        res = self.call("post", "/canteen/enrollments", data)
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def post_months(self, months, **extra):
        return self.call("post", "/canteen/monthly-posting", {
            "bs_year": 2083, "months": months, "date": "2083-07-15", **extra,
        }).json()

    def dues(self):
        return self.call("get", "/canteen/accounts", id=self.account().id).json()["dues"]

    def collect(self, amount, details=None):
        return self.call("post", "/canteen/accounts", {
            "action": "topup", "account": self.account().id, "amount": amount,
            "details": {str(k.id): v for k, v in (details or {}).items()}, "date": "2083-07-20",
        })

class CanteenBillingTests(BillingFixture, TestCase):
    """The canteen's own billing: use types, class rates, monthly posting,
    item-wise dues and receipts — none of it on the school's fee bills."""

    def test_class_rates_list_every_class_and_save(self):
        listed = self.call("get", "/canteen/class-rates", item=self.tiffin.id).json()
        self.assertEqual([(r["key"], r["label"], r["students"]) for r in listed["rows"]], [("g10", "Seven", 1)])
        self.rates(self.tiffin, g10="1500", g9="2500")
        listed = self.call("get", "/canteen/class-rates", item=self.tiffin.id).json()
        self.assertEqual({r["key"]: Decimal(str(r["monthly_rate"])) for r in listed["rows"]},
                         {"g10": Decimal("1500"), "g9": Decimal("2500")})

    def test_monthly_posting_charges_the_class_rate_item_wise(self):
        self.rates(self.tiffin, g10="1500")
        self.rates(self.day_care, g10="2500")
        self.enroll("Tiffin monthly")
        self.enroll("Day care")
        preview = self.call("get", "/canteen/monthly-posting", bs_year=2083, months="7,8").json()
        self.assertEqual((preview["to_post"], Decimal(str(preview["to_post_total"]))), (1, Decimal("8000")))
        done = self.post_months([7, 8])
        self.assertEqual(len(done["posted"]), 1, done)
        txn = CanteenTransaction.objects.get(kind=TXN_POSTING)
        self.assertEqual(txn.amount, Decimal("-8000.00"))
        self.assertEqual({k: v for k, v in txn.details.items() if k != "__titles"},
                         {str(self.tiffin.id): "3000.00", str(self.day_care.id): "5000.00"})
        self.assertEqual(txn.months, [7, 8])
        self.assertEqual([(r["name"], Decimal(str(r["due"]))) for r in self.dues()["items"]],
                         [("Day care", Decimal("5000")), ("Tiffin", Decimal("3000"))])  # same posting: by name
        again = self.post_months([7, 8])
        self.assertEqual(again["posted"], [])
        self.assertEqual(CanteenTransaction.objects.filter(kind=TXN_POSTING, is_active=True).count(), 1)
        # never on the school's fee bills
        self.assertEqual((StudentLedger.objects.count(), StudentInvoice.objects.count()), (0, 0))
        titles, _, _ = LedgerView().getFeeDetails(self.school.id, self.ten.id)
        self.assertFalse({"cn", "tf", "dc"} & set(titles))

    def test_own_rate_and_a_class_with_no_rate(self):
        self.rates(self.tiffin, g9="2500")       # no rate for this student's class
        self.enroll("Tiffin monthly")
        row = self.call("get", "/canteen/monthly-posting", bs_year=2083, months="7").json()["rows"][0]
        self.assertEqual((row["state"], row["why"]), ("skip", "no Tiffin rate for Seven"))
        e = CanteenEnrollment.objects.get(student=self.student)
        self.call("put", "/canteen/enrollments", {"id": e.id, "rate": "1200"})
        self.assertEqual(len(self.post_months([7])["posted"]), 1)
        self.assertEqual(CanteenTransaction.objects.get(kind=TXN_POSTING).amount, Decimal("-1200.00"))

    def test_withdraw_and_post_again(self):
        self.rates(self.tiffin, g10="1500")
        self.enroll("Tiffin monthly")
        txn = self.post_months([7])["posted"][0]["txn"]
        paid = self.collect("1500", {self.tiffin: "1500"}).json()
        refused = self.call("delete", "/canteen/monthly-posting", txn=txn)
        self.assertEqual(refused.status_code, 400)
        self.assertIn(f"C-{paid['receipt_no']}", refused.json()["message"])
        self.call("delete", "/canteen/accounts", txn=paid["id"])
        ok = self.call("delete", "/canteen/monthly-posting", txn=txn)
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(balance(self.account().id), Decimal("0.00"))
        self.assertEqual(len(self.post_months([7])["posted"]), 1)

    def test_collect_item_wise_with_an_advance(self):
        self.rates(self.tiffin, g10="1500")
        self.enroll("Tiffin monthly")
        self.post_months([7])
        over = self.collect("2000", {self.tiffin: "1600"})
        self.assertEqual(over.status_code, 400)
        res = self.collect("2000", {self.tiffin: "1500"}).json()
        self.assertEqual([(l["name"], Decimal(str(l["amount"]))) for l in res["lines"]], [("Tiffin", Decimal("1500"))])
        dues = self.dues()
        self.assertEqual((Decimal(str(dues["due"])), Decimal(str(dues["advance"]))), (Decimal("0"), Decimal("500")))
        # the advance meets next month's posting
        self.post_months([8])
        dues = self.dues()
        self.assertEqual((Decimal(str(dues["due"])), Decimal(str(dues["advance"]))), (Decimal("1000"), Decimal("0")))

    def test_paise_are_exact(self):
        self.rates(self.tiffin, g10="33.33")
        self.enroll("Tiffin monthly")
        self.post_months([7, 8, 9])
        self.assertEqual(Decimal(str(self.dues()["due"])), Decimal("99.99"))
        self.collect("99.99", {self.tiffin: "99.99"})
        dues = self.dues()
        self.assertEqual((Decimal(str(dues["due"])), Decimal(str(dues["advance"]))), (Decimal("0"), Decimal("0")))
        self.assertEqual(balance(self.account().id), Decimal("0.00"))

    def test_months_outside_the_enrolment_are_not_posted(self):
        self.rates(self.tiffin, g10="1500")
        self.enroll("Tiffin monthly", start="2083-08-10")
        self.assertEqual(self.call("get", "/canteen/monthly-posting", bs_year=2083, months="7").json()["rows"], [])
        self.assertEqual(self.post_months([7, 8])["posted"][0]["amount"], 1500)

    def test_a_monthly_meal_is_served_without_charge(self):
        self.enroll("Tiffin monthly")
        res = self.sell([(self.samosa, 2)], payment=PAY_PLAN, buyer_type=BUYER_STUDENT, buyer=self.student.id)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual((Decimal(str(res.json()["total"])), res.json()["payment_name"]), (Decimal("0"), "Plan · Tiffin monthly"))
        self.assertEqual(CanteenTransaction.objects.count(), 0)
        items = self.call("get", "/canteen/reports", type="items", **{"from": "2083-07-10", "to": "2083-07-10"}).json()
        self.assertEqual([(r["name"], r["qty"], r["plan_qty"]) for r in items["rows"]], [("Samosa", 2, 2)])

    def test_cash_or_due_takes_it_on_due_item_wise(self):
        plan = self.plans["Tiffin cash or due"]
        self.call("put", "/canteen/plans", {**plan, "due_limit": "60"})
        args = dict(payment=PAY_ACCOUNT, buyer_type=BUYER_STUDENT, buyer=self.student.id)
        self.assertEqual(self.sell([(self.samosa, 1)], **args).status_code, 400)
        self.enroll("Tiffin cash or due")
        self.assertEqual(self.sell([(self.samosa, 2)], **args).status_code, 200)
        self.assertEqual(self.sell([(self.samosa, 1)], **args).status_code, 400)   # 75 > 60
        self.assertEqual([(r["name"], Decimal(str(r["due"]))) for r in self.dues()["items"]], [("Samosa", Decimal("50"))])
        self.collect("50", {self.samosa: "50"})
        self.assertEqual(balance(self.account().id), Decimal("0.00"))

    def test_monthly_only_items_stay_off_the_counter(self):
        listed = [i["name"] for i in self.call("get", "/canteen/items", available=1).json()]
        self.assertNotIn("Day care", listed)
        res = self.sell([(self.day_care, 1)])
        self.assertEqual(res.status_code, 400)
        self.assertIn("billed monthly", res.json()["message"])

    def test_dues_and_postings_reports(self):
        self.rates(self.tiffin, g10="1500")
        self.enroll("Tiffin monthly")
        self.post_months([7])
        self.collect("500", {self.tiffin: "500"})
        dues = self.call("get", "/canteen/reports", type="dues").json()
        self.assertEqual([(r["name"], Decimal(str(r["due"]))) for r in dues["rows"]], [("Aayushma Chaudhary", Decimal("1000"))])
        self.assertEqual(self.call("get", "/canteen/reports", type="dues", class_key="g9").json()["rows"], [])
        postings = self.call("get", "/canteen/reports", type="postings", **{"from": "2083-07-01", "to": "2083-07-30"}).json()
        self.assertEqual((Decimal(str(postings["total"])), postings["rows"][0]["months"]), (Decimal("1500"), "Kartik"))


class ExtrasTests(BillingFixture, TestCase):
    """Printed bills (dues lines), the app reminder, the kitchen's meal count."""

    def owe(self):
        self.rates(self.tiffin, g10="1500")
        self.enroll("Tiffin monthly")
        self.post_months([7])

    def test_dues_rows_carry_the_bill_lines(self):
        self.owe()
        row = self.call("get", "/canteen/reports", type="dues").json()["rows"][0]
        self.assertEqual([(l["name"], Decimal(str(l["due"]))) for l in row["lines"]], [("Tiffin", Decimal("1500"))])
        self.assertFalse(row["has_app"])

    def test_reminder_reaches_families_with_the_app_once_a_day(self):
        from unittest.mock import patch
        from account.models import StudentAccount
        self.owe()
        account = StudentAccount.objects.create(username="aayushma-app", app_device_token="device-token-1")
        type(self.student).objects.filter(id=self.student.id).update(account=account)
        sent = []
        run_now = patch("main.methods.push._in_background", side_effect=lambda fn, *a, **k: fn(*a, **k))
        record = patch("main.methods.push.dispatch_push", side_effect=lambda *a, **k: sent.append(a))
        with run_now, record:
            with self.captureOnCommitCallbacks(execute=True):
                first = self.call("post", "/canteen/dues-reminder", {}).json()
            with self.captureOnCommitCallbacks(execute=True):
                again = self.call("post", "/canteen/dues-reminder", {}).json()
        self.assertEqual((first["sent"], again["sent"], again["already_today"]), (1, 0, 1))
        self.assertEqual(len(sent), 1)
        school_id, role, recipients, title, body = sent[0][:5]
        self.assertEqual((recipients, title), ([(self.student.id, "device-token-1")], "क्यान्टिन"))
        self.assertIn("1,500.00", body)

    def test_meal_count_by_class(self):
        self.enroll("Tiffin monthly")
        CanteenItem.objects.filter(id=self.tiffin.id).update(sold_at_counter=True, price="60")
        self.sell([(self.samosa, 1)], payment=PAY_PLAN, buyer_type=BUYER_STUDENT, buyer=self.student.id)
        self.sell([(self.tiffin, 2)])   # a walk-in buys two tiffins for cash
        meals = self.call("get", "/canteen/reports", type="meals", date="2083-07-10").json()
        by_class = {r["class_label"]: (r["on_plan"], r["served"], r["not_yet"], r["bought"]) for r in meals["rows"]}
        self.assertEqual(by_class, {"Seven": (1, 1, 0, 0), "Staff and walk-ins": (0, 0, 0, 2)})
        self.assertEqual((meals["on_plan"], meals["served"], meals["bought"]), (1, 1, 2))


class CanteenUserTests(CanteenFixture, TestCase):
    """Sign-ins that open the canteen and nothing else, added by the school."""

    PASSWORD = "Counter lunch garden 123"

    def add_user(self, username="counter01", pages=(PAGE_COUNTER,), client=None, **extra):
        return self.call("post", "/canteen/users", {
            "username": username, "password": self.PASSWORD, "full_name": "Sita Thapa",
            "permissions": list(pages), **extra,
        }, client=client)

    def sign_in(self, username="counter01", password=PASSWORD):
        return APIClient().post("/auth/canteen/signin", {"username": username, "password": password}, format="json")

    def signed_in(self, username="counter01"):
        res = self.sign_in(username)
        self.assertEqual(res.status_code, 200, res.content)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"IGNITE {res.json()['user']['token']}")
        return client

    def test_the_school_adds_a_user_who_signs_in_to_the_canteen(self):
        res = self.add_user()
        self.assertEqual(res.status_code, 200, res.content)
        user = CanteenUser.objects.get(username="counter01")
        self.assertEqual((user.school_id, user.permissions, user.created_by), (self.school.id, [PAGE_COUNTER], "admin"))
        signed = self.sign_in().json()["user"]
        self.assertEqual(signed["role"], "canteen")
        profile = signed["profile"]
        self.assertEqual((profile["school"], profile["name"], profile["permissions"], profile["uses_canteen"]),
                         (self.school.id, "Sita Thapa", [PAGE_COUNTER], True))
        self.assertEqual(profile["school_name"], self.school.name)
        self.assertEqual(self.sign_in(password="Wrong@123").status_code, 401)
        listed = self.call("get", "/canteen/users").json()
        self.assertEqual([(u["username"], u["page_names"]) for u in listed], [("counter01", ["Counter"])])

    def test_bad_usernames_passwords_and_pages_are_refused(self):
        self.assertEqual(self.add_user(username="abc").status_code, 400)
        self.assertEqual(self.add_user(password="simple").status_code, 400)
        self.assertEqual(self.add_user(pages=[]).status_code, 400)
        self.assertEqual(self.add_user(pages=[1, 2]).status_code, 400)       # not canteen pages
        self.add_user()
        self.assertEqual(self.add_user(username="COUNTER01").status_code, 409)

    def test_a_canteen_user_opens_their_pages_and_no_others(self):
        self.add_user()
        counter = self.signed_in()
        self.assertEqual(self.call("get", "/canteen/items", client=counter).status_code, 200)
        sold = self.call("post", "/canteen/sales", {
            "lines": [{"item": self.samosa.id, "qty": 2}], "payment": PAY_CASH, "buyer_type": BUYER_WALKIN,
        }, client=counter)
        self.assertEqual(sold.status_code, 200, sold.content)
        self.assertEqual(sold.json()["entered_by"], "Sita Thapa")
        # writes to a page they were not given, and the records, are refused
        self.assertEqual(self.call("post", "/canteen/items", {"name": "Momo", "price": 80}, client=counter).status_code, 403)
        self.assertEqual(self.call("get", "/canteen/reports", client=counter, type="summary").status_code, 403)
        self.assertEqual(self.call("get", "/canteen/users", client=counter).status_code, 403)
        # a page taken away is refused at once, not at the next sign-in
        CanteenUser.objects.filter(username="counter01").update(permissions=[PAGE_REPORTS])
        self.assertEqual(self.call("get", "/canteen/reports", client=counter, type="summary").status_code, 200)
        self.assertEqual(self.call("delete", "/canteen/sales", client=counter, id=sold.json()["id"]).status_code, 403)

    def test_the_rest_of_the_product_refuses_a_canteen_token(self):
        self.add_user()
        counter = self.signed_in()
        self.assertIn(counter.get(f"/api/students?school={self.school.id}").status_code, (401, 403))
        self.assertIn(counter.get(f"/api/fees?school={self.school.id}").status_code, (401, 403))
        self.assertIn(counter.get("/auth/profile").status_code, (401, 403))
        self.assertIn(counter.get("/canteen/manage/access").status_code, (401, 403))

    def test_a_canteen_user_is_held_to_their_own_school(self):
        other = AdminAccount.objects.create(username="other-admin")
        stranger_school = SchoolAdmin.objects.create(
            name="Other", address="x", estd_date="2080-01-01", renew_date="2084-01-01",
            pan_no="9", email="o@example.com", account=other, economic_year=self.fy,
        )
        grant_canteen(stranger_school)
        self.add_user()
        counter = self.signed_in()
        res = counter.get(f"/canteen/items?school={stranger_school.id}")
        self.assertEqual(res.status_code, 401)

    def test_a_canteen_user_cannot_name_another_schools_student(self):
        other = AdminAccount.objects.create(username="other-admin")
        stranger_school = SchoolAdmin.objects.create(
            name="Other", address="x", estd_date="2080-01-01", renew_date="2084-01-01",
            pan_no="9", email="o@example.com", account=other, economic_year=self.fy,
        )
        stranger_year = AcademicYear.objects.create(
            school=stranger_school, name="2083", start_date="2083-01-01", end_date="2083-12-30",
        )
        stranger = Student.objects.create(
            first_name="Other", last_name="Pupil", birth_date="2070-01-01", gender=2, location="x",
            class_info=ClassInfo.objects.create(
                school=stranger_school, academic_year=stranger_year, education_level=2, grade=10,
            ),
            academic_year=stranger_year,
            guardian_info=StudentGuardianInfo.objects.create(
                father_name="Father", mother_name="Mother", guardian_contact="9800000001",
            ),
        )
        self.add_user(pages=(PAGE_USE_TYPES,))
        counter = self.signed_in()
        res = self.call("post", "/canteen/enrollments", {"plan": 1, "students": [stranger.id]}, client=counter)
        self.assertEqual(res.status_code, 403)
        # their own school's student gets past it, to the handler (no such use type)
        res = self.call("post", "/canteen/enrollments", {"plan": 1, "students": [self.student.id]}, client=counter)
        self.assertEqual(res.status_code, 404)

    def test_switching_off_ends_the_sessions_and_the_sign_in(self):
        self.add_user()
        counter = self.signed_in()
        user = CanteenUser.objects.get(username="counter01")
        res = self.call("put", "/canteen/users", {"id": user.id, "is_active": False})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertFalse(CanteenUserToken.objects.filter(user=user).exists())
        self.assertEqual(self.call("get", "/canteen/items", client=counter).status_code, 401)
        refused = self.sign_in()
        self.assertEqual(refused.status_code, 403)
        self.assertIn("switched off", refused.json()["message"])
        self.call("put", "/canteen/users", {"id": user.id, "is_active": True})
        self.assertEqual(self.sign_in().status_code, 200)

    def test_the_module_switched_off_closes_the_canteen_portal(self):
        self.add_user()
        counter = self.signed_in()
        obtained = counter.get("/auth/canteen/obtain").json()
        self.assertEqual(obtained["user"]["profile"]["permissions"], [PAGE_COUNTER])
        grant_canteen(self.school, False)
        cache.clear()
        self.assertNotIn("user", counter.get("/auth/canteen/obtain").json())
        refused = self.sign_in()
        self.assertEqual(refused.status_code, 403)
        self.assertIn("not enabled", refused.json()["message"])

    def test_a_manager_gives_only_the_pages_they_hold(self):
        self.add_user(username="manager01", pages=(PAGE_USERS, PAGE_COUNTER, PAGE_ITEMS))
        self.add_user(username="office01", pages=(PAGE_COUNTER, PAGE_REPORTS))
        manager = self.signed_in("manager01")
        made = self.add_user(username="counter02", pages=(PAGE_COUNTER,), client=manager)
        self.assertEqual(made.status_code, 200, made.content)
        self.assertEqual(made.json()["user"]["permissions"], [PAGE_COUNTER])
        self.assertEqual(CanteenUser.objects.get(username="counter02").created_by, "Sita Thapa")
        self.assertEqual(self.add_user(username="counter03", pages=(PAGE_REPORTS,), client=manager).status_code, 403)
        office = CanteenUser.objects.get(username="office01")
        # a user holding a page the manager lacks is the office's to change
        res = self.call("put", "/canteen/users", {"id": office.id, "password": "Taken@123"}, client=manager)
        self.assertEqual(res.status_code, 403)
        me = CanteenUser.objects.get(username="manager01")
        self.assertEqual(self.call("put", "/canteen/users", {"id": me.id, "is_active": False}, client=manager).status_code, 400)

    def test_a_canteen_user_changes_their_own_password(self):
        self.add_user()
        counter, other_device = self.signed_in(), self.signed_in()
        wrong = self.call("put", "/canteen/my-password", {"current_password": "nope", "password": "New counter garden password"}, client=counter)
        self.assertEqual(wrong.status_code, 400)
        res = self.call("put", "/canteen/my-password", {"current_password": self.PASSWORD, "password": "New counter garden password"}, client=counter)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.call("get", "/canteen/items", client=counter).status_code, 200)
        self.assertEqual(self.call("get", "/canteen/items", client=other_device).status_code, 401)
        self.assertEqual(self.sign_in(password="New counter garden password").status_code, 200)
        # staff and admins have their own way; this one is the canteen user's
        self.assertIn(self.call("put", "/canteen/my-password", {"current_password": "x", "password": "New counter garden password"}).status_code, (401, 403))

    def test_sign_out_ends_that_session(self):
        self.add_user()
        browser = APIClient()
        res = browser.post("/auth/canteen/signin", {"username": "counter01", "password": self.PASSWORD}, format="json")
        token = res.json()["user"]["token"]
        self.assertEqual(browser.cookies["smsys"].value, token)   # the portal's session cookie
        out = browser.post("/auth/logout", {"role": "canteen"}, format="json", HTTP_ORIGIN="http://testserver")
        self.assertEqual(out.status_code, 200, out.content)
        self.assertFalse(CanteenUserToken.objects.filter(key=token).exists())

    def test_a_page_opens_only_the_reads_its_screen_makes(self):
        """A read used to be open to anyone holding any canteen page."""
        reads = {
            "/canteen/settings": PAGES,
            "/canteen/categories": (PAGE_ITEMS,),
            "/canteen/items": (PAGE_ITEMS, PAGE_COUNTER, PAGE_USE_TYPES),
            "/canteen/class-rates": (PAGE_ITEMS,),
            "/canteen/classes": (PAGE_USE_TYPES, PAGE_MONTHLY_POSTING, PAGE_REPORTS),
            "/canteen/buyers": (PAGE_COUNTER, PAGE_ACCOUNTS, PAGE_COLLECT),
            "/canteen/sales": (PAGE_COUNTER,),
            "/canteen/accounts": (PAGE_ACCOUNTS, PAGE_COLLECT),
            "/canteen/receipts": (PAGE_ACCOUNTS, PAGE_COLLECT, PAGE_PROFILE, PAGE_REPORTS),
            "/canteen/profile": (PAGE_PROFILE, PAGE_COLLECT),
            "/canteen/class-options": (PAGE_COLLECT,),
            "/canteen/units": (PAGE_ITEMS,),
            "/canteen/facilities": (PAGE_USE_TYPES, PAGE_USER_SETUP, PAGE_MONTHLY_POSTING),
            "/canteen/facility-users": (PAGE_USER_SETUP,),
            "/canteen/manual-posting": (PAGE_MONTHLY_POSTING,),
            "/canteen/plans": (PAGE_USE_TYPES, PAGE_MONTHLY_POSTING),
            "/canteen/enrollments": (PAGE_USE_TYPES,),
            "/canteen/monthly-posting": (PAGE_MONTHLY_POSTING,),
            "/canteen/reports": (PAGE_REPORTS,),
            "/canteen/users": (PAGE_USERS,),
        }
        self.add_user(pages=(PAGE_ITEMS,))
        clerk = self.signed_in()
        user = CanteenUser.objects.get(username="counter01")
        for page in PAGES:
            CanteenUser.objects.filter(pk=user.pk).update(permissions=[page])
            for path, pages in reads.items():
                refused = self.call("get", path, client=clerk).status_code == 403
                self.assertEqual(refused, page not in pages, f"page {page} on {path}")

    def test_buyer_search_does_not_hand_out_contact_numbers(self):
        self.add_user(pages=(PAGE_COUNTER,))
        buyers = self.call("get", "/canteen/buyers", q=self.student.first_name, client=self.signed_in()).json()["buyers"]
        self.assertTrue(buyers)
        self.assertNotIn("contact", buyers[0])

    def test_staff_need_the_page_too(self):
        clerk = APIClient()
        clerk.credentials(HTTP_AUTHORIZATION=f"IGNITE {StaffAuthToken.objects.create(user=self.sankalpa).key}")
        self.assertEqual(self.call("get", "/canteen/items", client=clerk).status_code, 403)
        Staff.objects.filter(account=self.sankalpa).update(permissions=[PAGE_ITEMS])
        self.assertEqual(self.call("get", "/canteen/items", client=clerk).status_code, 200)
        self.assertEqual(self.call("post", "/canteen/items", {"name": "Momo", "price": 80}, client=clerk).status_code, 200)
        self.assertEqual(self.call("post", "/canteen/sales", {
            "lines": [{"item": self.samosa.id, "qty": 1}], "payment": PAY_CASH, "buyer_type": BUYER_WALKIN,
        }, client=clerk).status_code, 403)


class EnrolByClassTests(BillingFixture, TestCase):
    def test_a_class_is_picked_the_way_the_rates_key_it(self):
        plan = self.plans["Tiffin monthly"]["id"]
        rows = self.call("get", "/canteen/enrollments", plan=plan, class_key=self.key).json()
        self.assertEqual([(r["id"], r["enrolled"]) for r in rows], [(self.student.id, False)])
        self.enroll("Tiffin monthly")
        rows = self.call("get", "/canteen/enrollments", plan=plan, class_key=self.key).json()
        self.assertEqual([(r["id"], r["enrolled"]) for r in rows], [(self.student.id, True)])
        self.assertEqual(self.call("get", "/canteen/enrollments", plan=plan, class_key="g4").json(), [])


class CanteenProfileTests(BillingFixture, TestCase):
    """A person's own canteen page: billing, payments, every transaction."""

    def profile(self, client=None, **params):
        return self.call(
            "get", "/canteen/profile", client=client,
            **{"buyer_type": BUYER_STUDENT, "buyer": self.student.id, **params},
        )

    def money(self, value):
        return Decimal(str(value))

    def billed_and_part_paid(self):
        self.rates(self.tiffin, g10="1500")
        self.enroll("Tiffin monthly")
        self.post_months([7, 8])                                  # 3,000 billed
        return self.collect("2000", {self.tiffin: "1500"})        # 1,500 paid, 500 advance

    def test_billed_paid_due_and_advance_agree_with_the_ledger(self):
        self.billed_and_part_paid()
        data = self.profile().json()
        summary = {k: self.money(data["summary"][k]) for k in ("billed", "paid", "refunded", "due", "advance", "balance")}
        self.assertEqual(summary, {
            "billed": Decimal("3000"), "paid": Decimal("2000"), "refunded": Decimal("0"),
            "due": Decimal("1000"), "advance": Decimal("0"), "balance": Decimal("-1000"),
        })
        dues = self.dues()
        self.assertEqual((summary["due"], summary["advance"]), (self.money(dues["due"]), self.money(dues["advance"])))
        tiffin = data["items"][0]
        self.assertEqual(
            (tiffin["name"], self.money(tiffin["charged"]), self.money(tiffin["paid"]),
             self.money(tiffin["from_advance"]), self.money(tiffin["due"])),
            ("Tiffin", Decimal("3000"), Decimal("1500"), Decimal("500"), Decimal("1000")),
        )
        self.assertEqual(data["name"], self.call("get", "/canteen/buyers", q=self.student.first_name).json()["buyers"][0]["name"])

    def test_history_has_every_kind_newest_first_with_the_running_balance(self):
        self.billed_and_part_paid()
        self.sell([(self.juice, 2)], payment=PAY_CASH, buyer_type=BUYER_STUDENT, buyer=self.student.id)
        rows = self.profile().json()["history"]
        self.assertEqual([r["what"] for r in rows], ["Cash purchase", "Payment", "Monthly bill"])
        cash, payment, bill = rows
        self.assertEqual((bill["group"], bill["months"], bill["bs_year"]), ("bill", ["Kartik", "Mangsir"], 2083))
        self.assertEqual((self.money(bill["charged"]), self.money(bill["running"])), (Decimal("3000"), Decimal("-3000")))
        self.assertEqual((payment["group"], payment["reference"][:2]), ("payment", "C-"))
        self.assertEqual((self.money(payment["paid"]), self.money(payment["advance"])), (Decimal("2000"), Decimal("500")))
        self.assertEqual(self.money(payment["running"]), Decimal("-1000"))
        self.assertIsNotNone(payment["receipt"])
        self.assertEqual(self.call("get", "/canteen/receipts", id=payment["receipt"]).status_code, 200)
        # Cash is settled on the spot: on the history, off the bill.
        self.assertEqual((cash["group"], cash["charged"], cash["paid"]), ("counter", None, None))
        self.assertEqual(self.money(cash["cash"]), Decimal("80"))
        self.assertEqual(self.money(cash["running"]), Decimal("-1000"))
        self.assertEqual([(l["name"], l["qty"]) for l in cash["lines"]], [("Juice", 2)])
        summary = self.profile().json()["summary"]
        self.assertEqual((self.money(summary["cash_at_counter"]), summary["cash_sales"]), (Decimal("80"), 1))
        self.assertEqual(self.money(summary["billed"]), Decimal("3000"))

    def test_a_purchase_on_account_names_its_items_and_quantities(self):
        self.top_up("500")
        self.sell([(self.samosa, 3)], payment=PAY_ACCOUNT, buyer_type=BUYER_STUDENT, buyer=self.student.id)
        row = self.profile().json()["history"][0]
        self.assertEqual((row["what"], row["group"], self.money(row["charged"])), ("Counter purchase on account", "bill", Decimal("75")))
        self.assertEqual([(l["name"], l["qty"], self.money(l["amount"])) for l in row["lines"]], [("Samosa", 3, Decimal("75"))])
        self.assertTrue(row["reference"].startswith("Sale "))

    def test_a_void_stays_listed_and_stops_counting(self):
        self.rates(self.tiffin, g10="1500")
        self.enroll("Tiffin monthly")
        self.post_months([7])
        paid = self.collect("1500", {self.tiffin: "1500"}).json()
        self.call("delete", "/canteen/accounts", txn=paid["id"], remarks="wrong student")
        data = self.profile().json()
        self.assertEqual((self.money(data["summary"]["paid"]), self.money(data["summary"]["due"])), (Decimal("0"), Decimal("1500")))
        voided = next(r for r in data["history"] if r["group"] == "payment")
        self.assertEqual((voided["is_active"], voided["void_reason"]), (False, "wrong student"))
        self.assertEqual(self.money(voided["running"]), Decimal("-1500"))

    def test_a_refund_counts_as_money_given_back(self):
        self.top_up("500")
        self.call("post", "/canteen/accounts", {
            "action": "refund", "buyer_type": BUYER_STUDENT, "buyer": self.student.id, "amount": "200",
        })
        summary = self.profile().json()["summary"]
        self.assertEqual(
            (self.money(summary["paid"]), self.money(summary["refunded"]), self.money(summary["advance"])),
            (Decimal("500"), Decimal("200"), Decimal("300")),
        )

    def test_opening_an_unused_person_writes_nothing(self):
        before = CanteenAccount.objects.count()
        res = self.profile()
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertEqual((data["account"], data["items"], data["history"]), (None, [], []))
        self.assertEqual(self.money(data["summary"]["due"]), Decimal("0"))
        self.assertEqual(CanteenAccount.objects.count(), before)

    def test_it_never_reads_the_schools_fee_tables(self):
        self.billed_and_part_paid()
        with CaptureQueriesContext(connection) as queries:
            self.assertEqual(self.profile().status_code, 200)
        sql = " ".join(q["sql"] for q in queries.captured_queries).lower()
        self.assertIn("canteen_canteentransaction", sql)
        for fee_table in (StudentLedger._meta.db_table, StudentInvoice._meta.db_table):
            self.assertNotIn(fee_table.lower(), sql)

    def test_search_finds_by_name_roll_and_card_and_never_opens_an_account(self):
        Student.objects.filter(id=self.student.id).update(rfid_card="CARD-77", roll_no="R7")
        for params in ({"q": self.student.first_name}, {"q": "R7"}, {"card": "CARD-77"}):
            people = self.call("get", "/canteen/profile", **params).json()["people"]
            self.assertEqual([p["id"] for p in people if p["buyer_type"] == BUYER_STUDENT], [self.student.id], params)
        self.assertEqual(self.call("get", "/canteen/profile").json()["people"], [])
        self.assertEqual(CanteenAccount.objects.count(), 0)

    def test_someone_who_left_is_still_found_while_they_have_an_account(self):
        self.top_up("100")
        Student.objects.filter(id=self.student.id).update(status=3)
        people = self.call("get", "/canteen/profile", q=self.student.first_name).json()["people"]
        self.assertEqual([(p["id"], p["left"]) for p in people], [(self.student.id, True)])
        self.assertEqual(self.money(people[0]["balance"]), Decimal("100"))
        data = self.profile().json()
        self.assertTrue(data["left"])
        self.assertEqual(self.money(data["summary"]["advance"]), Decimal("100"))

    def test_a_person_of_another_school_is_not_found(self):
        other_admin = AdminAccount.objects.create(username="other-admin")
        other = SchoolAdmin.objects.create(
            name="Other", address="x", estd_date="2080-01-01", renew_date="2084-01-01",
            pan_no="9", email="o@example.com", account=other_admin, economic_year=self.fy,
        )
        grant_canteen(other, True)
        self.assertEqual(self.profile(buyer=999999).status_code, 404)
        # Their login, asking about our school: refused at the door.
        stranger = APIClient()
        stranger.credentials(HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.objects.create(user=other_admin).key}")
        self.assertIn(self.profile(client=stranger).status_code, (401, 403))
        # Their login, naming their own school and our student: nothing.
        res = stranger.get(f"/canteen/profile?school={other.id}&buyer_type={BUYER_STUDENT}&buyer={self.student.id}")
        self.assertEqual(res.status_code, 404)

    def test_the_page_must_be_held(self):
        self.call("post", "/canteen/users", {
            "username": "counter01", "password": "Counter lunch garden 123", "full_name": "Sita Thapa",
            "permissions": [PAGE_COUNTER],
        })
        signed = APIClient().post("/auth/canteen/signin", {"username": "counter01", "password": "Counter lunch garden 123"}, format="json")
        counter = APIClient()
        counter.credentials(HTTP_AUTHORIZATION=f"IGNITE {signed.json()['user']['token']}")
        self.assertEqual(self.profile(client=counter).status_code, 403)
        self.assertEqual(self.call("get", "/canteen/profile", client=counter, q="a").status_code, 403)
        CanteenUser.objects.filter(username="counter01").update(permissions=[PAGE_PROFILE])
        self.assertEqual(self.profile(client=counter).status_code, 200)
        # The family's number stays with Card Accounts, and search never carries it.
        self.assertIsNone(self.profile(client=counter).json()["contact"])
        self.assertIsNotNone(self.profile().json()["contact"])
        CanteenUser.objects.filter(username="counter01").update(permissions=[PAGE_PROFILE, PAGE_ACCOUNTS])
        self.assertIsNotNone(self.profile(client=counter).json()["contact"])
        people = self.call("get", "/canteen/profile", q=self.student.first_name).json()["people"]
        self.assertFalse([p for p in people if "contact" in p])
        clerk = APIClient()
        clerk.credentials(HTTP_AUTHORIZATION=f"IGNITE {StaffAuthToken.objects.create(user=self.sankalpa).key}")
        self.assertEqual(self.profile(client=clerk).status_code, 403)
        Staff.objects.filter(account=self.sankalpa).update(permissions=[PAGE_PROFILE])
        self.assertEqual(self.profile(client=clerk).status_code, 200)

    def test_a_walk_in_has_no_profile(self):
        self.assertEqual(self.profile(buyer_type=BUYER_WALKIN).status_code, 400)


class ProductSetupTests(BillingFixture, TestCase):
    def test_units_are_the_schools_own_and_cannot_vanish_under_a_product(self):
        res = self.call("post", "/canteen/units", {"name": "Plate"})
        self.assertEqual(res.status_code, 200, res.content)
        unit = res.json()["id"]
        self.assertEqual(self.call("post", "/canteen/units", {"name": "plate"}).status_code, 409)
        self.assertEqual(self.call("post", "/canteen/units", {"name": ""}).status_code, 400)
        made = self.call("post", "/canteen/items", {"name": "Momo", "price": "120", "unit": unit, "remarks": "steamed"})
        self.assertEqual(made.status_code, 200, made.content)
        listed = self.call("get", "/canteen/units").json()
        self.assertEqual([(u["name"], u["products"]) for u in listed], [("Plate", 1)])
        refused = self.call("delete", "/canteen/units", id=unit)
        self.assertEqual(refused.status_code, 400)
        self.assertIn("use 'Plate'", refused.json()["message"])
        self.call("delete", "/canteen/items", id=made.json()["id"])
        self.assertEqual(self.call("delete", "/canteen/units", id=unit).status_code, 200)

    def test_a_product_without_a_price_stays_off_the_counter(self):
        made = self.call("post", "/canteen/items", {"name": "Water jar", "price": "", "sold_at_counter": False}).json()
        row = next(i for i in self.call("get", "/canteen/items", products=1).json() if i["id"] == made["id"])
        self.assertFalse(row["sold_at_counter"])
        self.assertNotIn(made["id"], [i["id"] for i in self.call("get", "/canteen/items", available=1).json()])

    def test_saving_a_product_keeps_what_the_form_no_longer_asks_for(self):
        CanteenItem.objects.filter(id=self.samosa.id).update(code="SAM", food_type=1, is_available=False)
        res = self.call("put", "/canteen/items", {"id": self.samosa.id, "name": "Samosa", "price": "30", "remarks": "hot"})
        self.assertEqual(res.status_code, 200, res.content)
        self.samosa.refresh_from_db()
        self.assertEqual(
            (self.samosa.code, self.samosa.food_type, self.samosa.is_available, self.samosa.remarks, self.samosa.price),
            ("SAM", 1, False, "hot", Decimal("30.00")),
        )

    def test_a_facilitys_title_is_not_listed_as_a_product(self):
        self.save_facility("Swimming")
        names = [i["name"] for i in self.call("get", "/canteen/items", products=1).json()]
        self.assertNotIn("Swimming", names)
        self.assertIn("Samosa", names)

    def save_facility(self, name, amount="800", key="g10", **extra):
        return self.call("post", "/canteen/facilities", {
            "name": name, "classes": [{"key": key, "label": "Seven", "amount": amount}], **extra,
        })


class FacilityTests(BillingFixture, TestCase):
    def facility(self, name="Swimming", amount="800", key="g10", label="Seven"):
        res = self.call("post", "/canteen/facilities", {"name": name, "classes": [{"key": key, "label": label, "amount": amount}]})
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()["id"]

    def tick(self, plan, students=None, start="2083-04-01"):
        rows = [{"id": self.student.id}] if students is None else students
        res = self.call("post", "/canteen/facility-users", {"plan": plan, "students": rows, "start_date": start})
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def row(self, plan):
        return self.call("get", "/canteen/facility-users", plan=plan).json()["students"]

    def test_a_facility_needs_classes_with_amounts(self):
        bad = self.call("post", "/canteen/facilities", {"name": "Swimming", "classes": []})
        self.assertEqual(bad.status_code, 400)
        bad = self.call("post", "/canteen/facilities", {"name": "Swimming", "classes": [{"key": "g10", "label": "Seven", "amount": 0}]})
        self.assertEqual(bad.status_code, 400)
        plan = self.facility()
        self.assertEqual(self.call("post", "/canteen/facilities", {"name": "swimming", "classes": [{"key": "g10", "amount": 5}]}).status_code, 409)
        row = next(f for f in self.call("get", "/canteen/facilities").json() if f["id"] == plan)
        self.assertEqual([(c["key"], Decimal(str(c["amount"])), c["students"]) for c in row["classes"]], [("g10", Decimal("800"), 1)])

    def test_renaming_follows_onto_the_bill_title(self):
        plan = self.facility()
        res = self.call("put", "/canteen/facilities", {"id": plan, "name": "Pool", "classes": [{"key": "g10", "label": "Seven", "amount": 900}]})
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(CanteenPlan.objects.get(id=plan).item.name, "Pool")

    def test_user_setup_lists_only_the_facilitys_classes_and_ticks_are_saved(self):
        plan = self.facility()
        self.assertEqual([(s["id"], s["ticked"]) for s in self.row(plan)], [(self.student.id, False)])
        self.assertEqual(self.tick(plan)["added"], 1)
        self.assertEqual([(s["id"], s["ticked"]) for s in self.row(plan)], [(self.student.id, True)])
        other = self.facility(name="Dance", key="g4", label="One")
        self.assertEqual(self.row(other), [])
        result = self.tick(other)
        self.assertEqual((result["added"], result["skipped"]), (0, 1))

    def test_a_class_with_ticked_students_cannot_leave_the_facility(self):
        plan = self.facility()
        self.tick(plan)
        res = self.call("put", "/canteen/facilities", {"id": plan, "name": "Swimming", "classes": [{"key": "g4", "label": "One", "amount": 500}]})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Untick", res.json()["message"])
        self.assertEqual(self.call("delete", "/canteen/facilities", id=plan).status_code, 400)
        self.tick(plan, students=[])
        self.assertEqual(self.call("delete", "/canteen/facilities", id=plan).status_code, 200)
        self.assertEqual([f for f in self.call("get", "/canteen/facilities").json() if f["id"] == plan], [])

    def test_unticked_and_ticked_again_is_never_charged_twice(self):
        plan = self.facility()
        self.tick(plan)
        self.assertEqual(len(self.post_months([7], plans=[plan])["posted"]), 1)
        self.assertEqual(self.tick(plan, students=[])["stopped"], 1)
        self.assertEqual(self.tick(plan)["added"], 1)
        again = self.post_months([7], plans=[plan])
        self.assertEqual(again["posted"], [])
        self.assertEqual(balance(self.account().id), Decimal("-800.00"))
        # and the preview shows them once, as already posted
        rows = self.call("get", "/canteen/monthly-posting", bs_year=2083, months="7", plans=plan).json()["rows"]
        self.assertEqual([r["state"] for r in rows], ["posted"])

    def test_posting_is_by_month_and_class(self):
        plan = self.facility()
        self.tick(plan)
        elsewhere = self.call("get", "/canteen/monthly-posting", bs_year=2083, months="7", class_key="g4").json()
        self.assertEqual(elsewhere["rows"], [])
        done = self.post_months([7], class_key="g10")
        self.assertEqual(Decimal(str(done["total"])), Decimal("800"))
        self.assertEqual(StudentLedger.objects.count(), 0)


class ManualPostingTests(BillingFixture, TestCase):
    def setUp(self):
        super().setUp()
        res = self.call("post", "/canteen/facilities", {"name": "Swimming", "classes": [{"key": "g10", "label": "Seven", "amount": 800}]})
        self.plan = res.json()["id"]

    def manual(self, lines, months=(7,), client=None, **extra):
        return self.call("post", "/canteen/manual-posting", {
            "buyer_type": BUYER_STUDENT, "buyer": self.student.id, "bs_year": 2083, "months": list(months),
            "date": "2083-07-15", "lines": lines, **extra,
        }, client=client)

    def test_titles_offered_with_the_amount_that_applies(self):
        data = self.call("get", "/canteen/manual-posting", buyer_type=BUYER_STUDENT, buyer=self.student.id, bs_year=2083).json()
        swim = next(t for t in data["titles"] if t["key"] == f"f{self.plan}")
        self.assertEqual((Decimal(str(swim["amount"])), swim["enrolled"], swim["posted_months"]), (Decimal("800"), False, []))
        samosa = next(t for t in data["titles"] if t["key"] == f"p{self.samosa.id}")
        self.assertEqual(Decimal(str(samosa["amount"])), Decimal("25"))

    def test_a_facility_month_posts_once_even_for_someone_not_ticked(self):
        first = self.manual([{"key": f"f{self.plan}", "amount": "700"}])
        self.assertEqual(first.status_code, 200, first.content)
        self.assertEqual(balance(self.account().id), Decimal("-700.00"))
        again = self.manual([{"key": f"f{self.plan}", "amount": "700"}])
        self.assertEqual(again.status_code, 400)
        self.assertIn("already posted for Kartik", again.json()["message"])
        self.assertEqual(balance(self.account().id), Decimal("-700.00"))
        # The class run treats that month as done for them too.
        self.call("post", "/canteen/facility-users", {"plan": self.plan, "students": [{"id": self.student.id}], "start_date": "2083-04-01"})
        self.assertEqual(self.post_months([7], plans=[self.plan])["posted"], [])

    def test_amount_is_per_month_and_a_product_needs_no_month(self):
        self.manual([{"key": f"f{self.plan}", "amount": "100"}], months=(7, 8))
        self.assertEqual(balance(self.account().id), Decimal("-200.00"))
        res = self.manual([{"key": f"p{self.samosa.id}", "amount": "50"}], months=())
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(balance(self.account().id), Decimal("-250.00"))
        self.assertEqual(self.manual([{"key": f"f{self.plan}", "amount": "100"}], months=()).status_code, 400)
        self.assertEqual(self.manual([{"key": f"p{self.samosa.id}", "amount": "0"}]).status_code, 400)
        self.assertEqual(self.manual([{"key": "f999999", "amount": "10"}]).status_code, 400)
        self.assertEqual(self.manual([]).status_code, 400)

    def test_withdrawn_posts_again_and_shows_on_the_profile(self):
        txn = self.manual([{"key": f"f{self.plan}", "amount": "700"}]).json()["txn"]
        rows = self.call("get", "/canteen/profile", buyer_type=BUYER_STUDENT, buyer=self.student.id).json()["history"]
        self.assertEqual([(r["what"], r["bs_year"], r["months"]) for r in rows], [("Monthly bill", 2083, ["Kartik"])])
        self.assertEqual(self.call("delete", "/canteen/monthly-posting", txn=txn).status_code, 200)
        self.assertEqual(balance(self.account().id), Decimal("0.00"))
        self.assertEqual(self.manual([{"key": f"f{self.plan}", "amount": "700"}]).status_code, 200)

    def test_only_holders_of_monthly_posting_may_post(self):
        self.call("post", "/canteen/users", {
            "username": "viewer0001", "password": "Viewer lunch garden 123", "full_name": "A Viewer", "permissions": [PAGE_PROFILE],
        })
        signed = APIClient().post("/auth/canteen/signin", {"username": "viewer0001", "password": "Viewer lunch garden 123"}, format="json")
        viewer = APIClient()
        viewer.credentials(HTTP_AUTHORIZATION=f"IGNITE {signed.json()['user']['token']}")
        self.assertEqual(self.manual([{"key": f"p{self.samosa.id}", "amount": "10"}], client=viewer).status_code, 403)

    def test_another_schools_student_cannot_be_posted(self):
        res = self.call("post", "/canteen/manual-posting", {
            "buyer_type": BUYER_STUDENT, "buyer": 999999, "bs_year": 2083, "months": [7],
            "lines": [{"key": f"p{self.samosa.id}", "amount": "10"}],
        })
        self.assertEqual(res.status_code, 404)


class PaymentDiscountTests(BillingFixture, TestCase):
    def billed(self):
        self.rates(self.tiffin, g10="1500")
        self.enroll("Tiffin monthly")
        self.post_months([7])

    def pay(self, cash, discount=None, month=7, advance="0"):
        amount = Decimal(str(cash)) + Decimal(str(advance))
        return self.call("post", "/canteen/accounts", {
            "action": "topup", "account": self.account().id, "amount": str(amount),
            "details": {str(self.tiffin.id): str(cash)},
            "discounts": {str(self.tiffin.id): str(discount)} if discount else {},
            "month": month, "date": "2083-07-20",
        })

    def summary(self):
        return self.call("get", "/canteen/profile", buyer_type=BUYER_STUDENT, buyer=self.student.id).json()

    def test_a_discount_settles_the_item_but_is_not_cash(self):
        self.billed()
        res = self.pay("1300", "200")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(Decimal(str(res.json()["amount"])), Decimal("1300"))
        self.assertEqual(Decimal(str(res.json()["discount"])), Decimal("200"))
        self.assertEqual(res.json()["months"], ["Kartik"])
        data = self.summary()
        s = {k: Decimal(str(data["summary"][k])) for k in ("billed", "paid", "discount", "due", "advance", "balance")}
        self.assertEqual(s, {"billed": Decimal("1500"), "paid": Decimal("1300"), "discount": Decimal("200"),
                             "due": Decimal("0"), "advance": Decimal("0"), "balance": Decimal("0")})
        self.assertEqual(s["billed"] - s["paid"] - s["discount"], s["due"] - s["advance"])
        # Day's cash counts what was taken, not what was let off.
        report = self.call("get", "/canteen/reports", type="receipts", **{"from": "2083-07-20", "to": "2083-07-20"}).json()
        self.assertEqual(Decimal(str(report["topups"])), Decimal("1300"))

    def test_paying_plus_discount_cannot_pass_what_is_due(self):
        self.billed()
        res = self.pay("1400", "200")
        self.assertEqual(res.status_code, 400)
        self.assertIn("only Rs. 1,500.00 is due", res.json()["message"])
        self.assertEqual(balance(self.account().id), Decimal("-1500.00"))

    def test_voiding_a_receipt_brings_its_discount_back_too(self):
        self.billed()
        paid = self.pay("1300", "200").json()
        res = self.call("delete", "/canteen/accounts", txn=paid["id"], remarks="wrong")
        self.assertEqual(res.status_code, 200, res.content)
        self.assertIn("-1,500.00", res.json()["message"])
        self.assertEqual(balance(self.account().id), Decimal("-1500.00"))
        s = self.summary()["summary"]
        self.assertEqual((Decimal(str(s["discount"])), Decimal(str(s["due"]))), (Decimal("0"), Decimal("1500")))

    def test_a_discounted_posting_cannot_be_withdrawn_until_the_receipt_is_voided(self):
        self.billed()
        txn = CanteenTransaction.objects.get(kind=TXN_POSTING)
        paid = self.pay("1300", "200").json()
        refused = self.call("delete", "/canteen/monthly-posting", txn=txn.id)
        self.assertEqual(refused.status_code, 400)
        self.assertIn(f"C-{paid['receipt_no']}", refused.json()["message"])
        self.call("delete", "/canteen/accounts", txn=paid["id"])
        self.assertEqual(self.call("delete", "/canteen/monthly-posting", txn=txn.id).status_code, 200)

    def test_the_payment_page_holder_can_read_a_ledger(self):
        self.billed()
        self.call("post", "/canteen/users", {
            "username": "cashier001", "password": "Cashier lunch garden 123", "full_name": "A Cashier", "permissions": [PAGE_COLLECT],
        })
        signed = APIClient().post("/auth/canteen/signin", {"username": "cashier001", "password": "Cashier lunch garden 123"}, format="json")
        cashier = APIClient()
        cashier.credentials(HTTP_AUTHORIZATION=f"IGNITE {signed.json()['user']['token']}")
        res = self.call("get", "/canteen/profile", client=cashier, buyer_type=BUYER_STUDENT, buyer=self.student.id)
        self.assertEqual(res.status_code, 200, res.content)
        by_class = self.call("get", "/canteen/profile", client=cashier, class_key="g10").json()["people"]
        self.assertEqual([p["id"] for p in by_class], [self.student.id])
        self.assertEqual(self.call("get", "/canteen/profile", client=cashier, class_key="g4").json()["people"], [])


class ImpossibleDateTests(BillingFixture, TestCase):
    def test_a_date_that_does_not_exist_is_a_plain_refusal(self):
        res = self.call("get", "/canteen/reports", type="transactions", **{"from": "2083-08-01", "to": "2083-08-30"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["message"], "2083-08-30 is not a real date on the Nepali calendar.")
        paid = self.call("post", "/canteen/accounts", {
            "action": "topup", "buyer_type": BUYER_STUDENT, "buyer": self.student.id, "amount": "100", "date": "2083-08-30",
        })
        self.assertEqual(paid.status_code, 400)
        self.assertEqual(CanteenTransaction.objects.count(), 0)


class TransactionReportTests(BillingFixture, TestCase):
    def report(self, **params):
        return self.call("get", "/canteen/reports", type="transactions",
                         **{"from": "2083-07-01", "to": "2083-07-30", **params}).json()

    def setUp(self):
        super().setUp()
        self.rates(self.tiffin, g10="1500")
        self.enroll("Tiffin monthly")
        self.post_months([7])
        self.paid = self.call("post", "/canteen/accounts", {
            "action": "topup", "account": self.account().id, "amount": "1800",
            "details": {str(self.tiffin.id): "1300"}, "discounts": {str(self.tiffin.id): "200"},
            "mode": 2, "date": "2083-07-20",
        }).json()

    def test_payments_by_default_with_lines_that_add_up(self):
        rows = self.report()["rows"]
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual((row["kind"], row["reference"], row["mode_name"], row["name"] != ""), (1, f"C-{self.paid['receipt_no']}", "bank", True))
        self.assertEqual([(l["name"], Decimal(str(l["amount"]))) for l in row["lines"]],
                         [("Tiffin", Decimal("1300")), ("Advance", Decimal("500"))])
        self.assertEqual(Decimal(str(row["discount"])), Decimal("200"))

    def test_the_filters(self):
        self.assertEqual(len(self.report(kind="bill")["rows"]), 1)
        self.assertEqual(len(self.report(kind="discount")["rows"]), 1)
        self.assertEqual(len(self.report(kind="all")["rows"]), 3)
        self.assertEqual(self.report(mode=1)["rows"], [])
        self.assertEqual(len(self.report(mode=2)["rows"]), 1)
        self.assertEqual(len(self.report(class_key="g10")["rows"]), 1)
        self.assertEqual(self.report(class_key="g4")["rows"], [])
        self.assertEqual(self.report(entered_by="nobody")["rows"], [])
        self.assertEqual(self.report(**{"from": "2083-08-01", "to": "2083-08-29"})["rows"], [])
        self.assertEqual(self.report(is_active="false")["rows"], [])
        self.call("delete", "/canteen/accounts", txn=self.paid["id"], remarks="wrong")
        self.assertEqual(self.report()["rows"], [])
        self.assertEqual(self.report(is_active="false")["rows"][0]["void_reason"], "wrong")


class PaymentSearchTests(BillingFixture, TestCase):
    """Payment's search form: the school's own fields, on canteen data."""

    def search(self, client=None, **body):
        return self.call("post", "/canteen/student-search", body, client=client)

    def found(self, **body):
        res = self.search(**body)
        self.assertEqual(res.status_code, 200, res.content)
        return [p["id"] for p in res.json() if p["buyer_type"] == BUYER_STUDENT]

    def test_needs_an_id_a_name_or_a_level_like_the_school_form(self):
        res = self.search()
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["message"], "Student ID, Name or Education Level is required!")
        self.assertEqual(self.search(middle_name="x").status_code, 400)

    def test_names_start_with_what_is_typed(self):
        name = self.student.first_name
        self.assertEqual(self.found(first_name=name[:2]), [self.student.id])
        self.assertEqual(self.found(first_name=name[1:] + "zz"), [])

    def test_by_id_and_by_card(self):
        Student.objects.filter(id=self.student.id).update(rfid_card="0012345678")
        self.assertEqual(self.found(student_id=str(self.student.id)), [self.student.id])
        self.assertEqual(self.found(student_id="0012345678"), [self.student.id])
        self.assertEqual(self.found(student_id="99999"), [])
        self.assertEqual(self.found(student_id="123456789012345678"), [])

    def test_by_class(self):
        info = ClassInfo.objects.get(id=self.ten.id)
        self.assertEqual(self.found(education_level=info.education_level, grade=info.grade), [self.student.id])
        self.assertEqual(self.found(education_level=info.education_level, grade=info.grade + 1), [])
        # A blank field is not a filter.
        self.assertEqual(self.found(education_level=info.education_level, grade=info.grade, section=""), [self.student.id])

    def test_status_is_running_unless_asked(self):
        name = self.student.first_name
        Student.objects.filter(id=self.student.id).update(status=3)
        self.assertEqual(self.found(first_name=name), [])
        row = self.search(first_name=name, status=3).json()[0]
        self.assertEqual((row["id"], row["left"]), (self.student.id, True))
        self.assertEqual(self.search(first_name=name, status=9).status_code, 400)

    def test_rows_read_like_the_school_list(self):
        self.rates(self.tiffin, g10="1500")
        self.enroll("Tiffin monthly")
        self.post_months([7])
        row = self.search(first_name=self.student.first_name).json()[0]
        self.assertEqual(row["classname"], "Seven")
        self.assertEqual(Decimal(str(row["balance"])), Decimal("-1500"))
        for key in ("father_name", "guardian_contact", "image", "buyer_type", "account"):
            self.assertIn(key, row)

    def test_staff_are_found_by_name_only(self):
        staff = Staff.objects.get(account=self.sankalpa)
        rows = self.search(first_name=staff.first_name).json()
        self.assertIn((BUYER_STAFF, staff.id), [(p["buyer_type"], p["id"]) for p in rows])
        info = ClassInfo.objects.get(id=self.ten.id)
        by_class = self.search(education_level=info.education_level).json()
        self.assertEqual([p for p in by_class if p["buyer_type"] == BUYER_STAFF], [])

    def test_another_school_cannot_reach_it_and_finds_nothing_of_ours(self):
        other_admin = AdminAccount.objects.create(username="other-admin")
        other = SchoolAdmin.objects.create(
            name="Other", address="x", estd_date="2080-01-01", renew_date="2084-01-01",
            pan_no="9", email="o@example.com", account=other_admin, economic_year=self.fy,
        )
        grant_canteen(other, True)
        stranger = APIClient()
        stranger.credentials(HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.objects.create(user=other_admin).key}")
        self.assertIn(self.search(client=stranger, first_name="a").status_code, (401, 403))
        own = stranger.post("/canteen/student-search", {"school": other.id, "first_name": self.student.first_name}, format="json")
        self.assertEqual(own.status_code, 200, own.content)
        self.assertEqual(own.json(), [])

    def test_class_options_answer_what_the_picker_reads(self):
        data = self.call("get", "/canteen/class-options").json()
        self.assertEqual(set(data), {"classes", "sections", "courses", "hidden"})
        for row in data["courses"]:
            self.assertEqual(set(row), {"id", "education_level", "course", "faculty"})

    def test_a_canteen_user_needs_the_payment_page(self):
        self.call("post", "/canteen/users", {
            "username": "cashier002", "password": "Cashier lunch garden 123", "full_name": "A Cashier", "permissions": [PAGE_COUNTER],
        })
        signed = APIClient().post("/auth/canteen/signin", {"username": "cashier002", "password": "Cashier lunch garden 123"}, format="json")
        cashier = APIClient()
        cashier.credentials(HTTP_AUTHORIZATION=f"IGNITE {signed.json()['user']['token']}")
        self.assertEqual(self.search(client=cashier, first_name="a").status_code, 403)
        self.assertEqual(self.call("get", "/canteen/class-options", client=cashier).status_code, 403)
        CanteenUser.objects.filter(username="cashier002").update(permissions=[PAGE_COLLECT])
        self.assertEqual(self.search(client=cashier, first_name="a").status_code, 200)
        self.assertEqual(self.call("get", "/canteen/class-options", client=cashier).status_code, 200)

    def test_the_family_number_is_for_card_accounts_holders(self):
        StudentGuardianInfo.objects.filter(student=self.student).update(guardian_contact="9800000001")
        name = self.student.first_name
        mine = [p for p in self.search(first_name=name).json() if p["id"] == self.student.id][0]
        self.assertEqual((mine["guardian_contact"], mine["contact"]), ("9800000001", "9800000001"))
        self.call("post", "/canteen/users", {
            "username": "cashier003", "password": "Cashier lunch garden 123", "full_name": "A Cashier", "permissions": [PAGE_COLLECT],
        })
        signed = APIClient().post("/auth/canteen/signin", {"username": "cashier003", "password": "Cashier lunch garden 123"}, format="json")
        cashier = APIClient()
        cashier.credentials(HTTP_AUTHORIZATION=f"IGNITE {signed.json()['user']['token']}")
        theirs = [p for p in self.search(client=cashier, first_name=name).json() if p["id"] == self.student.id][0]
        self.assertEqual((theirs["guardian_contact"], theirs["contact"]), (None, None))
        CanteenUser.objects.filter(username="cashier003").update(permissions=[PAGE_COLLECT, PAGE_ACCOUNTS])
        theirs = [p for p in self.search(client=cashier, first_name=name).json() if p["id"] == self.student.id][0]
        self.assertEqual(theirs["guardian_contact"], "9800000001")
