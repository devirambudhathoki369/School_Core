"""Collecting money from a party, and the receipt it produces.

  GET     /extra-billing/payments   ?school=&party=        what they owe + their receipts
  GET     /extra-billing/payments   ?school=&id=           one receipt, for reprint
  POST    /extra-billing/payments   collect
  DELETE  /extra-billing/payments   ?school=&id=           void a receipt

THE NUMBER. Receipts run serially within a school's FISCAL year and restart at 1
when it rolls over. Student, cash and extra-billing receipts share this series.

VOIDING KEEPS THE NUMBER. A voided receipt is soft-deleted, stops counting
towards the balance immediately, and keeps its number forever. A gap in a
receipt book is a record; a reused number is a fraud.
"""

from django.db import IntegrityError, transaction
from rest_framework.response import Response

from ..constants import (
    OPENING_DUE,
    PAYMENT_MODES,
    TITLE_NAMES_KEY,
    label,
)
from ..methods.balances import party_balances, title_wise_outstanding
from ..models.Billing import ExtraInvoice
from ..models.Party import BillingParty, BillingTitle
from .BaseViews import ExtraBillingBaseView

MAX_MINT_ATTEMPTS = 5

RECEIPT_FIELDS = (
    "id", "invoice_id", "date", "details", "total_paid", "total_due",
    "mode", "remarks", "economic_year",
)


class ExtraPaymentView(ExtraBillingBaseView):
    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        receipt_id = self.int_or_none(request.query_params.get("id"))
        if receipt_id:
            receipt = (
                ExtraInvoice.objects.filter(id=receipt_id, school_id=school_id)
                .values(*RECEIPT_FIELDS, "party", "party__name", "party__property_name",
                        "party__contact", "party__address", "is_active")
                .first()
            )
            if not receipt:
                return self.RESPONSE__NOT_FOUND
            receipt["mode_name"] = label(PAYMENT_MODES, receipt["mode"])
            return Response(receipt)

        party_id = self.int_or_none(request.query_params.get("party"))
        if not party_id:
            return self.RESPONSE__INVALID_REQUEST
        party = BillingParty.objects.filter(
            id=party_id, school_id=school_id, is_active=True
        ).first()
        if not party:
            return self.RESPONSE__NOT_FOUND

        rows = title_wise_outstanding(party)
        balance = party_balances(school_id, [party_id]).get(party_id, {})
        receipts = list(
            ExtraInvoice.objects.filter(party=party)
            .order_by("-id")
            .values(*RECEIPT_FIELDS, "is_active")
        )
        for receipt in receipts:
            receipt["mode_name"] = label(PAYMENT_MODES, receipt["mode"])
        return Response(
            {
                "party": {
                    "id": party.id,
                    "name": party.name,
                    "property_name": party.property_name,
                    "contact": party.contact,
                    "address": party.address,
                },
                "outstanding": rows,
                "balance": balance.get("balance", 0),
                "charged": balance.get("charged", 0),
                "paid": balance.get("paid", 0),
                "opening": balance.get("opening", 0),
                "receipts": receipts,
            }
        )

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        economic_year_id = self.economic_year(request, school_id)
        if not economic_year_id:
            return Response(
                {"message": "This school has no economic year set."}, status=400
            )
        data = request.data
        party_id = self.int_or_none(data.get("party"))
        party = BillingParty.objects.filter(
            id=party_id, school_id=school_id, is_active=True
        ).first()
        if not party:
            return self.RESPONSE__NOT_FOUND

        titles = {
            str(row["id"]): row["title"]
            for row in BillingTitle.objects.filter(
                school_id=school_id, is_active=True
            ).values("id", "title")
        }
        paid_by_title = {}
        for key, value in (data.get("details") or {}).items():
            key = str(key)
            if key != OPENING_DUE and key not in titles:
                continue
            amount = self.money(value)
            if amount > 0:
                paid_by_title[key] = amount
        total_paid = sum(paid_by_title.values(), self.money(0))
        if total_paid <= 0:
            return Response({"message": "Enter an amount to collect."}, status=400)

        # What they owe BEFORE this receipt, so the receipt can print the
        # balance the payer is left with.
        before = party_balances(school_id, [party_id]).get(party_id, {}).get("balance", 0)
        # Stored as STRINGS, like every other amount in a details blob here:
        # a JSON float rounds the paisa, and every reader coerces before adding.
        details = {key: str(amount) for key, amount in paid_by_title.items()}
        details[TITLE_NAMES_KEY] = {
            key: (titles.get(key) if key != OPENING_DUE else "Old dues")
            for key in paid_by_title
        }

        values = {
            "school_id": school_id,
            "economic_year_id": economic_year_id,
            "party": party,
            "details": details,
            "total_paid": total_paid,
            "total_due": self.money(before) - total_paid,
            "mode": self.int_or_none(data.get("mode")) or 1,
            "remarks": (data.get("remarks") or "").strip() or None,
        }
        # Left out entirely when the client sends none, so the model default
        # (today, on the Nepali calendar) applies.
        if data.get("date"):
            values["date"] = data.get("date")

        for _ in range(MAX_MINT_ATTEMPTS):
            try:
                with transaction.atomic():
                    number = self._next_number(school_id, economic_year_id)
                    receipt = ExtraInvoice.objects.create(invoice_id=number, **values)
                break
            except IntegrityError:
                # Another cashier took the number; try the next one.
                receipt = None
        else:
            return Response(
                {"message": "Could not issue a receipt number, please retry."},
                status=409,
            )

        return Response(
            {
                "id": receipt.id,
                "invoice_id": receipt.invoice_id,
                "date": receipt.date,
                "total_paid": receipt.total_paid,
                "total_due": receipt.total_due,
                "message": f"Receipt {receipt.invoice_id} saved!",
            }
        )

    def _next_number(self, school_id, economic_year_id):
        from main.methods.nextReceiptNumber import next_receipt_number

        return next_receipt_number(school_id, economic_year_id)

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        receipt_id = self.int_or_none(request.query_params.get("id"))
        reason = (request.query_params.get("remarks") or "").strip()
        receipt = ExtraInvoice.objects.filter(
            id=receipt_id, school_id=school_id, is_active=True
        ).first()
        if not receipt:
            return self.RESPONSE__NOT_FOUND
        receipt.is_active = False
        # Why it was voided, kept beside the row rather than in a log nobody
        # opens. The number itself is never reused.
        receipt.extra_info = {**(receipt.extra_info or {}), "void_reason": reason or "voided"}
        receipt.save(update_fields=["is_active", "extra_info", "updated_at"])
        return Response(
            {
                "message": (
                    f"Receipt {receipt.invoice_id} voided. It stays on the record and "
                    "its number is not reused."
                )
            }
        )
