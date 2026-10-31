"""The canteen, end to end through the real URLs and token authentication."""

from decimal import Decimal

from django.core.cache import cache
from django.test import TestCase
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
    BUYER_STAFF, BUYER_STUDENT, BUYER_WALKIN, PAGE_ACCOUNTS, PAGE_COLLECT, PAGE_COUNTER, PAGE_ITEMS,
    PAGE_MONTHLY_POSTING, PAGE_REPORTS, PAGE_USE_TYPES, PAGE_USERS, PAGES,
    PAY_ACCOUNT, PAY_CASH, PAY_PLAN, TXN_POSTING,
)
from .methods.balances import balance
from .models import (
    CanteenAccount, CanteenEnrollment, CanteenItem, CanteenSale, CanteenTransaction, CanteenUser,
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

    PASSWORD = "Counter@123"

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
        wrong = self.call("put", "/canteen/my-password", {"current_password": "nope", "password": "Newpass@1"}, client=counter)
        self.assertEqual(wrong.status_code, 400)
        res = self.call("put", "/canteen/my-password", {"current_password": self.PASSWORD, "password": "Newpass@1"}, client=counter)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(self.call("get", "/canteen/items", client=counter).status_code, 200)
        self.assertEqual(self.call("get", "/canteen/items", client=other_device).status_code, 401)
        self.assertEqual(self.sign_in(password="Newpass@1").status_code, 200)
        # staff and admins have their own way; this one is the canteen user's
        self.assertIn(self.call("put", "/canteen/my-password", {"current_password": "x", "password": "Newpass@1"}).status_code, (401, 403))

    def test_sign_out_ends_that_session(self):
        self.add_user()
        browser = APIClient()
        res = browser.post("/auth/canteen/signin", {"username": "counter01", "password": self.PASSWORD}, format="json")
        token = res.json()["user"]["token"]
        self.assertEqual(browser.cookies["smsys"].value, token)   # the portal's session cookie
        out = browser.post("/auth/logout", {"role": "canteen"}, format="json")
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
            "/canteen/receipts": (PAGE_ACCOUNTS, PAGE_COLLECT),
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
