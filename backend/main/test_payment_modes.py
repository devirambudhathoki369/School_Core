from decimal import Decimal
from unittest.mock import patch

from django.test import SimpleTestCase

from main.methods.getStudentInvoiceDetails import (
    formatStudentInvoiceDetails, getStudentInvoiceDetails,
)
from main.views.InvoiceViews import InvoiceViews, STUDENT_INVOICE_RETURN_FIELDS
from main.views.search.TransactionsSearchView import TransactionsSearchView


class PaymentModeReportTests(SimpleTestCase):
    def test_trial_balance_keeps_mode_on_payment_but_not_discount(self):
        for mode in (1, 2, 3, 4, None):
            with self.subTest(mode=mode):
                rows = formatStudentInvoiceDetails([{
                    "id": 1, "invoice_id": 10, "date": "2083-06-18",
                    "mode": mode, "total_paid": Decimal("900.50"),
                    "details": {"1": {"amt": "1000.50", "dis": "100"}},
                }], {1: "Monthly fee"})
                self.assertEqual(rows[0]["mode"], mode)
                self.assertEqual(rows[0]["credit_amount"], Decimal("900.50"))
                self.assertEqual(rows[1]["discount_amount"], Decimal("100"))
                self.assertNotIn("mode", rows[1])
                self.assertNotIn("credit_amount", rows[1])

    def test_trial_query_fetches_mode_and_preserves_scope(self):
        with patch("main.methods.getStudentInvoiceDetails.StudentInvoice.objects.filter") as query:
            query.return_value.values.return_value = []
            getStudentInvoiceDetails(12, 34, 56)
            self.assertIn("mode", query.return_value.values.call_args.args)
            filters = dict(query.call_args.args[0].children)
            self.assertEqual(filters["school__id"], 34)
            self.assertEqual(filters["academic_year"], 56)
            self.assertTrue(filters["is_active"])

    def test_recent_transactions_keep_modes(self):
        self.assertIn("mode", STUDENT_INVOICE_RETURN_FIELDS)
        rows = InvoiceViews().formatTransactions([
            {"id": mode, "mode": mode, "isCashReceipt": True, "total_paid": 100}
            for mode in (1, 2, 3, 4)
        ])
        self.assertEqual([row["mode"] for row in rows], [1, 2, 3, 4])

    def test_history_filter_keeps_school_active_status_and_method(self):
        query, school, _, _ = TransactionsSearchView().prepareQuery({"school": 34, "mode": "4"})
        self.assertEqual(school, 34)
        self.assertEqual(dict(query.children), {"school": 34, "is_active": True, "mode": "4"})
