from types import SimpleNamespace
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.contrib.contenttypes.models import ContentType
from rest_framework.response import Response

from account.models import AdminAccount, StaffAccount
from main.models.SchoolAdmin import SchoolAdmin
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.Invoice import StudentInvoice
from main.models.history_log.HistoryLog import HistoryLog
from main.serializers.InvoiceSerializer import StudentInvoiceSerializer
from main.views.search.TransactionsSearchView import TransactionsSearchView
from .models.Billing import ExtraInvoice, ExtraLedger, ExtraLedgerPosting
from .models.Party import BillingParty, BillingTitle, PartyCharge
from .views.PartyViews import BillingPartyView
from .views.PaymentViews import ExtraPaymentView
from .views.ReportViews import ExtraReportView


class SharedReceiptTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.fy = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")
        cls.school = SchoolAdmin.objects.create(
            name="Test school", address="Test address", estd_date="2080-01-01",
            renew_date="2084-01-01", pan_no="123", email="test@example.com",
            account=AdminAccount.objects.create(username="test-admin"), economic_year=cls.fy,
        )
        cls.ay = AcademicYear.objects.create(school=cls.school, name="2083", start_date="2083-01-01", end_date="2083-12-30")
        cls.party = BillingParty.objects.create(school=cls.school, name="Shop tenant")

    def extra(self, number=1, **kwargs):
        return ExtraInvoice.objects.create(
            school=self.school, economic_year=self.fy, party=self.party,
            invoice_id=number, total_paid="125.50", date="2083-06-05",
            details={"1": "125.50", "__titles": {"1": "Rent"}}, **kwargs,
        )

    def student(self):
        return StudentInvoiceSerializer().create(dict(
            school=self.school, economic_year=self.fy, academic_year=self.ay,
            isCashReceipt=True, payment_month=6, date="2083-06-05",
            total_paid="100", details=[{"AMT": 100, "PAR": "Cash"}],
        ))

    def test_alternating_receipts_continue_and_void_does_not_reuse(self):
        first = self.student()
        self.assertEqual(first.invoice_id, 1)
        number = ExtraPaymentView()._next_number(self.school.pk, self.fy.pk)
        self.assertEqual(number, 2)
        self.extra(number, is_active=False)
        self.assertEqual(self.student().invoice_id, 3)
        self.assertEqual(ExtraPaymentView()._next_number(self.school.pk, self.fy.pk), 4)

    def test_existing_extra_sequence_and_new_fiscal_year(self):
        self.extra(40)
        self.assertEqual(self.student().invoice_id, 41)
        next_year = EconomicYear.objects.create(name="2084/85", start_date="2084-04-01", end_date="2085-03-31")
        self.assertEqual(ExtraPaymentView()._next_number(self.school.pk, next_year.pk), 1)

    def test_history_details_and_filters(self):
        receipt = self.extra(8, mode=4)
        view = TransactionsSearchView()
        rows, titles = view.getExtraInvoices(self.school.pk, {"date_range": ["2083-06-01", "2083-06-30"]})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], f"extra:{receipt.pk}")
        self.assertEqual(rows[0]["extra_invoice_id"], receipt.pk)
        self.assertEqual(rows[0]["name"], "Shop tenant")
        self.assertEqual(rows[0]["mode"], 4)
        self.assertEqual(view.getExtraInvoices(self.school.pk, {"mode": 1})[0], [])
        self.assertEqual(len(view.getExtraInvoices(self.school.pk, {"mode": "4"})[0]), 1)
        self.assertEqual(rows[0]["details"], {"extra:1": {"amt": "125.50"}})
        self.assertEqual(titles, {"extra:1": "Rent"})
        for filters in ({"title": 1}, {"education_level": 2}, {"isCashReceipt": True},
                        {"isCashReceipt": False}, {"is_active": False},
                        {"date_range": ["2083-05-01", "2083-05-30"]}):
            self.assertEqual(view.getExtraInvoices(self.school.pk, filters)[0], [])
        self.assertEqual(view.getExtraInvoices(self.school.pk + 1, {})[0], [])

    def test_deleted_history_and_cashier_filter(self):
        receipt = self.extra(is_active=False)
        staff = StaffAccount.objects.create(username="cashier")
        HistoryLog.objects.create(
            user_id=staff.pk, user_type=ContentType.objects.get_for_model(StaffAccount),
            object_id=receipt.pk, object_type=ContentType.objects.get_for_model(ExtraInvoice),
            school_id=self.school.pk, action=1,
        )
        view = TransactionsSearchView()
        rows, _ = view.getExtraInvoices(self.school.pk, {"is_active": False, "user": staff.pk})
        self.assertEqual(len(rows), 1)
        self.assertEqual(view.getExtraInvoices(self.school.pk, {"is_active": False, "user": staff.pk + 1})[0], [])

    def test_extra_only_history_response_includes_ranges(self):
        self.extra(8)
        view = TransactionsSearchView()
        # Student query uses PostgreSQL JSON SQL; isolate it for this merge test.
        with patch.object(view, "getStudentInvoices", return_value=Response({"data": [], "titles": {}})):
            response = view.post(SimpleNamespace(data={"school": self.school.pk, "date_range": ["2083-06-01", "2083-06-30"]}))
        self.assertEqual(len(response.data["data"]), 1)
        self.assertEqual(response.data["info"]["invoice_no"], {"from": 8, "to": 8})

    def test_collect_endpoint_uses_shared_number_and_history(self):
        first = self.student()
        view = ExtraPaymentView()
        request = SimpleNamespace(query_params={}, data={
            "school": self.school.pk, "party": self.party.pk,
            "details": {"od": "25.50"}, "date": "2083-06-05",
        })
        with patch.object(view, "gate", return_value=None), patch.object(view, "economic_year", return_value=self.fy.pk):
            response = view.post(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["invoice_id"], first.invoice_id + 1)
        self.assertEqual(self.student().invoice_id, first.invoice_id + 2)
        rows, _ = TransactionsSearchView().getExtraInvoices(self.school.pk, {})
        self.assertEqual(rows[0]["details"]["extra:od"]["amt"], "25.50")

    def test_collection_totals_include_each_source_and_exclude_voided(self):
        from django.db.models import Q
        from main.methods.collections import collection_totals
        self.student()
        self.extra(2)
        self.extra(3, is_active=False)
        self.assertEqual(collection_totals(Q(school=self.school))[self.school.pk], Decimal("225.50"))
        self.assertEqual(collection_totals(Q(school=self.school), "month")[6], Decimal("225.50"))
        self.assertEqual(collection_totals(Q(school=self.school, date="2083-05-01")), {})

    def test_recent_transactions_paginate_both_sources_without_id_collision(self):
        from rest_framework.test import APIRequestFactory
        from rest_framework.request import Request
        from main.views.InvoiceViews import InvoiceViews
        self.student()
        receipt = self.extra(2, mode=2)
        request = Request(APIRequestFactory().get("/api/payments", {"school": self.school.pk}, HTTP_HOST="localhost"))
        response = InvoiceViews().getTransactions(self.school.pk, None, request)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(response.data["results"][0]["extra_invoice_id"], receipt.pk)
        self.assertEqual(response.data["results"][1]["invoice_id"], 1)
        self.assertEqual(response.data["results"][0]["mode"], 2)
        self.assertEqual(response.data["results"][1]["mode"], 1)

    def test_history_method_filter_applies_to_both_receipt_sources(self):
        receipt = self.student()
        receipt.mode = 2
        receipt.save(update_fields=["mode"])
        self.extra(2, mode=4)
        self.extra(3, mode=2)
        self.extra(4, mode=2, is_active=False)
        response = TransactionsSearchView().post(SimpleNamespace(data={
            "school": self.school.pk, "mode": "2",
            "date_range": ["2083-06-01", "2083-06-30"],
        }))
        self.assertEqual(len(response.data["data"]), 2)
        self.assertEqual({row["invoice_id"] for row in response.data["data"]}, {1, 3})
        self.assertTrue(all(row["mode"] == 2 for row in response.data["data"]))


class ReportPartyDetailsTests(TestCase):
    """Every report says who the party is, not only what they were charged."""

    @classmethod
    def setUpTestData(cls):
        cls.fy = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")
        cls.school = SchoolAdmin.objects.create(
            name="Report school", address="Test address", estd_date="2080-01-01",
            renew_date="2084-01-01", pan_no="456", email="reports@example.com",
            account=AdminAccount.objects.create(username="report-admin"), economic_year=cls.fy,
        )
        cls.rent = BillingTitle.objects.create(school=cls.school, title="Rent")
        cls.water = BillingTitle.objects.create(school=cls.school, title="Water")
        cls.party = BillingParty.objects.create(
            school=cls.school, name="Shop tenant", property_name="Shutter 3",
            address="Ghorahi 10", agreement_start="2080-04-01", agreement_end="2088-03-30",
            opening_due="8640", remarks="2081 Saun to 2083 Asar",
        )
        PartyCharge.objects.create(party=cls.party, title=cls.rent, amount="3000")
        PartyCharge.objects.create(party=cls.party, title=cls.water, amount="600")
        # A rate that is no longer in force is kept on the record, not billed.
        PartyCharge.objects.create(party=cls.party, title=cls.water, amount="999", is_active=False)
        cls.bare = BillingParty.objects.create(school=cls.school, name="No rate card")
        posting = ExtraLedgerPosting.objects.create(
            school=cls.school, economic_year=cls.fy, date="2083-04-05", months=[4],
        )
        ExtraLedger.objects.create(
            posting=posting, party=cls.party, school=cls.school, economic_year=cls.fy,
            date="2083-04-05", months=[4], total="3600", remarks="Shrawan bill",
            details={str(cls.rent.pk): "3000.00", str(cls.water.pk): "600.00",
                     "__titles": {str(cls.rent.pk): "Rent", str(cls.water.pk): "Water"}},
        )
        ExtraInvoice.objects.create(
            school=cls.school, economic_year=cls.fy, party=cls.party, invoice_id=1,
            total_paid="1000", date="2083-04-10", remarks="part payment",
            details={str(cls.rent.pk): "1000.00", "__titles": {str(cls.rent.pk): "Rent"}},
        )

    def report(self, kind, **params):
        handler = getattr(ExtraReportView(), kind)
        return handler(SimpleNamespace(query_params=params), self.school.pk)

    def assertPartyRecord(self, row):
        self.assertEqual(row["address"], "Ghorahi 10")
        self.assertEqual(row["agreement_start"], "2080-04-01")
        self.assertEqual(row["agreement_end"], "2088-03-30")
        self.assertEqual(row["monthly"], Decimal("3600.00"))
        self.assertEqual(row["opening"], Decimal("8640.00"))

    def test_dues_rows_carry_the_party_record(self):
        data = self.report("dues").data
        rows = {row["name"]: row for row in data["rows"]}
        self.assertPartyRecord(rows["Shop tenant"])
        self.assertEqual(rows["Shop tenant"]["remarks"], "2081 Saun to 2083 Asar")
        # the figures the report already gave are the same figures
        self.assertEqual(rows["Shop tenant"]["charged"], Decimal("3600.00"))
        self.assertEqual(rows["Shop tenant"]["paid"], Decimal("1000.00"))
        self.assertEqual(rows["Shop tenant"]["balance"], Decimal("11240.00"))
        self.assertEqual(data["total_due"], Decimal("11240.00"))
        bare = rows["No rate card"]
        self.assertEqual(bare["monthly"], 0)
        self.assertIsNone(bare["address"])
        self.assertIsNone(bare["agreement_start"])
        self.assertIsNone(bare["remarks"])

    def test_receipts_and_bills_carry_the_party_record_beside_their_own_remarks(self):
        for kind, own_remarks, amount_key, amount in (
            ("collection", "part payment", "total_paid", Decimal("1000.00")),
            ("charges", "Shrawan bill", "total", Decimal("3600.00")),
        ):
            with self.subTest(report=kind):
                data = self.report(kind, **{"from": "2083-04-01", "to": "2083-04-30"}).data
                self.assertEqual(len(data["rows"]), 1)
                row = data["rows"][0]
                self.assertPartyRecord(row)
                self.assertEqual(row["name"], "Shop tenant")
                self.assertEqual(row["property_name"], "Shutter 3")
                self.assertEqual(row["remarks"], own_remarks)
                self.assertEqual(row["party_remarks"], "2081 Saun to 2083 Asar")
                self.assertEqual(row[amount_key], amount)
                self.assertEqual(data["total"], amount)
                self.assertFalse([key for key in row if key.startswith("party__")])
                self.assertEqual(self.report(kind, **{"from": "2083-05-01"}).data["rows"], [])

    def test_statement_heads_with_the_party_record(self):
        data = self.report("statement", party=str(self.party.pk)).data
        party = data["party"]
        self.assertEqual(party["address"], "Ghorahi 10")
        self.assertEqual(party["agreement_start"], "2080-04-01")
        self.assertEqual(party["agreement_end"], "2088-03-30")
        self.assertEqual(party["monthly"], Decimal("3600.00"))
        self.assertEqual(party["opening_due"], Decimal("8640.00"))
        self.assertEqual(party["remarks"], "2081 Saun to 2083 Asar")
        self.assertEqual(data["balance"], Decimal("11240.00"))
        self.assertEqual(self.report("statement", party=str(self.bare.pk)).data["party"]["monthly"], 0)

    def test_party_list_and_reports_agree_on_the_monthly_rate(self):
        view = BillingPartyView()
        request = SimpleNamespace(query_params={"school": self.school.pk}, data={})
        with patch.object(view, "gate", return_value=None):
            listed = {row["name"]: row["monthly"] for row in view.get(request).data}
        reported = {row["name"]: row["monthly"] for row in self.report("dues").data["rows"]}
        self.assertEqual(listed, reported)
        self.assertEqual(listed["Shop tenant"], Decimal("3600.00"))
