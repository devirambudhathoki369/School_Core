from types import SimpleNamespace

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken
from account.auth.context import users_context
from accounting.views.BaseViews import BaseEntryView
from main.methods import idempotency as idem
from main.models.Invoice import StudentInvoice
from main.test_invoice_audit import AuditSchool


class ReclaimTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def test_one_caller_follows_on_from_a_deleted_record(self):
        key = idem.make_signature("reclaim", 1)
        idem.reserve(key)
        idem.fill(key, {"pk": 7})
        self.assertTrue(idem.reclaim(key, 7))
        # the key is a save in flight again, and nobody else may take it
        self.assertEqual(idem.peek(key), idem.PENDING)
        self.assertFalse(idem.reclaim(key, 7))
        self.assertFalse(idem.reserve(key))

    def test_the_next_record_can_be_followed_on_from_in_its_turn(self):
        key = idem.make_signature("reclaim", 2)
        idem.reserve(key)
        idem.fill(key, {"pk": 7})
        self.assertTrue(idem.reclaim(key, 7))
        idem.fill(key, {"pk": 8})
        self.assertTrue(idem.reclaim(key, 8))


class ReenteredBillTests(AuditSchool, TestCase):
    """A bill deleted and entered again within two minutes is a new bill.

    School 66, 2083-06-22: bill 409 went in with the wrong payment method, was
    deleted 46 seconds later and entered again 72 seconds after that. The
    double-click guard still remembered 409, called the new entry a duplicate
    and answered with 409's receipt: the school printed "CASH RECEIPT
    (DELETED)" and nothing recorded the money.
    """

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.addCleanup(users_context.set, None)
        self.admin_client = APIClient()
        self.admin_client.credentials(
            HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.objects.create(user=self.admin).key}"
        )

    def pay(self, mode=1, remarks="CASH RECEIVED"):
        return self.admin_client.post("/api/payments", {
            "school": self.school.id, "economic_year": self.fy.id, "academic_year": self.ay.id,
            "isCashReceipt": True, "payment_month": 6, "date": "2083-06-22", "total_paid": "2000",
            "details": [{"AMT": 2000, "PAR": "Old Dues"}], "extra_info": {"name": "Rupesh"},
            "mode": mode, "remarks": remarks,
        }, format="json")

    def delete(self, invoice):
        response = self.admin_client.put("/api/payments", {
            "id": invoice.id, "school": self.school.id, "remarks": "wrong method",
        }, format="json")
        self.assertEqual(response.status_code, 200, response.content)

    def bills(self):
        return list(StudentInvoice.objects.filter(school=self.school).order_by("id"))

    def test_a_double_click_still_stores_one_bill(self):
        first, again = self.pay(), self.pay()
        self.assertEqual((first.status_code, again.status_code), (200, 200))
        self.assertNotIn("duplicate", first.data)
        self.assertTrue(again.data["duplicate"])
        self.assertEqual(again.data["invoice"]["invoice_id"], first.data["invoice"]["invoice_id"])
        self.assertEqual(len(self.bills()), 1)

    def test_a_bill_deleted_and_entered_again_is_saved_as_a_new_bill(self):
        self.pay(mode=2)
        [wrong] = self.bills()
        self.delete(wrong)
        again = self.pay(mode=1)
        self.assertEqual(again.status_code, 200, again.content)
        self.assertNotIn("duplicate", again.data)
        self.assertEqual(again.data["message"], "Payment completed!")
        wrong, right = self.bills()
        self.assertEqual((wrong.is_active, right.is_active), (False, True))
        self.assertEqual((wrong.mode, right.mode), (2, 1))
        receipt = again.data["invoice"]
        self.assertIsNone(receipt["deleted"])
        self.assertEqual(int(receipt["invoice_id"]), right.invoice_id)
        self.assertNotEqual(right.invoice_id, wrong.invoice_id)

    def test_a_double_click_on_the_new_bill_stores_one(self):
        self.pay()
        self.delete(self.bills()[0])
        new, again = self.pay(), self.pay()
        self.assertTrue(again.data["duplicate"])
        self.assertIsNone(again.data["invoice"]["deleted"])
        self.assertEqual(again.data["invoice"]["invoice_id"], new.data["invoice"]["invoice_id"])
        self.assertEqual([bill.is_active for bill in self.bills()], [False, True])

    def test_two_new_entries_arriving_together_store_one(self):
        self.pay()
        [gone] = self.bills()
        self.delete(gone)
        # another worker has just taken the key over and is saving
        key = next(k for k in cache._cache if "dedup:" in k and ":after:" not in k)
        self.assertTrue(idem.reclaim(key.split(":", 2)[-1], gone.id))
        waiting = self.pay()
        self.assertEqual(waiting.status_code, 409, waiting.content)
        self.assertEqual(len(self.bills()), 1)

    def test_deleted_twice_entered_three_times(self):
        for _ in range(2):
            self.pay()
            self.delete(self.bills()[-1])
        last = self.pay()
        self.assertNotIn("duplicate", last.data)
        self.assertEqual([bill.is_active for bill in self.bills()], [False, False, True])
        self.assertEqual(len({bill.invoice_id for bill in self.bills()}), 3)


class ReenteredVoucherTests(SimpleTestCase):
    """The accounting vouchers keep the same guard and had the same fault."""

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.rows = rows = {}       # voucher id -> is_active

        class Entries:
            objects = SimpleNamespace(
                filter=lambda id, is_active: SimpleNamespace(exists=lambda: rows.get(id) is is_active)
            )

        class Serializer:
            def __init__(self, data):
                pass

            def is_valid(self):
                return True

            def save(self, entry_type_id):
                rows[len(rows) + 1] = True
                return SimpleNamespace(id=len(rows))

        class View(BaseEntryView):
            ID, Name, EntryModel, EntrySerializer = 3, "Journal", Entries, Serializer
            _isClosedYear = staticmethod(lambda year: False)
            getVoucher = staticmethod(lambda voucher_id: {"id": voucher_id, "is_active": rows[voucher_id]})

        self.view = View()

    def save(self):
        return self.view.save(SimpleNamespace(data={
            "school": 1, "economic_year": 2, "date": "2083-06-22", "remarks": "rent",
            "mode": 1, "ledger": 5, "particulars": [{"ledger": 9, "amount": 500}],
        }))

    def test_a_double_click_still_stores_one_voucher(self):
        first, again = self.save(), self.save()
        self.assertNotIn("duplicate", first.data)
        self.assertTrue(again.data["duplicate"])
        self.assertEqual(self.rows, {1: True})

    def test_a_voucher_deleted_and_entered_again_is_saved_as_a_new_voucher(self):
        self.save()
        self.rows[1] = False
        again = self.save()
        self.assertNotIn("duplicate", again.data)
        self.assertEqual(again.data["entry"], {"id": 2, "is_active": True})
        self.assertEqual(self.rows, {1: False, 2: True})
        # ...and a double click on that one is still caught
        self.assertEqual(self.save().data["entry"], {"id": 2, "is_active": True})
        self.assertEqual(len(self.rows), 2)
