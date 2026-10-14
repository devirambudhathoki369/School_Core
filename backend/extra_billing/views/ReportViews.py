"""The records: a party's statement, who owes what, and what came in.

  GET  /extra-billing/reports  ?school=&type=dues        [&economic_year=]
  GET  /extra-billing/reports  ?school=&type=statement&party=
  GET  /extra-billing/reports  ?school=&type=collection&from=&to=
  GET  /extra-billing/reports  ?school=&type=summary     the module's dashboard tiles

Every one of these reads through `methods/balances`, so the dues report, the
payment screen and the statement cannot disagree about what a party owes — they
are the same arithmetic, called from three places.

Nepali dates are stored as zero-padded YYYY-MM-DD strings, so a string range IS
a date range. That is how every other dated report in this product filters.
"""

from rest_framework.response import Response

from ..constants import (
    MONTH_NAMES,
    PARTY_TYPE_CHOICES,
    PAYMENT_MODES,
    TITLE_NAMES_KEY,
    label,
)
from ..methods.balances import (
    detail_rows,
    monthly_rates,
    party_balances,
    title_wise_outstanding,
)
from ..models.Billing import ExtraInvoice, ExtraLedger
from ..models.Party import BillingParty
from .BaseViews import ExtraBillingBaseView

# The party's own record, read through the join on a receipt or a bill and
# carried onto the row under these names, so a register of receipts or of bills
# also says who the party is: where they are, how long their agreement runs,
# what they pay a month and what they owed coming in. The row's own `remarks`
# is the note written on that receipt or bill, so the party's note travels as
# `party_remarks` and the two are never mistaken for each other.
PARTY_COLUMNS = {
    "party__name": "name",
    "party__property_name": "property_name",
    "party__address": "address",
    "party__agreement_start": "agreement_start",
    "party__agreement_end": "agreement_end",
    "party__opening_due": "opening",
    "party__remarks": "party_remarks",
}


def with_party_details(rows):
    """Rename the joined party columns on each row and add the monthly rate."""
    monthly = monthly_rates({row["party"] for row in rows})
    for row in rows:
        for source, key in PARTY_COLUMNS.items():
            row[key] = row.pop(source)
        row["monthly"] = monthly.get(row["party"], 0)
    return rows


class ExtraReportView(ExtraBillingBaseView):
    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        report = (request.query_params.get("type") or "summary").lower()
        handler = {
            "dues": self.dues,
            "statement": self.statement,
            "collection": self.collection,
            "charges": self.charges,
            "summary": self.summary,
        }.get(report)
        if not handler:
            return self.RESPONSE__INVALID_REQUEST
        return handler(request, school_id)

    # ----------------------------------------------------------------- dues
    def dues(self, request, school_id):
        """Everyone who owes, with what they were charged and what they paid."""
        upto = request.query_params.get("upto") or None
        parties = list(
            BillingParty.objects.filter(school_id=school_id, is_active=True)
            .order_by("name")
            .values(
                "id", "name", "party_type", "property_name", "contact",
                "address", "agreement_start", "agreement_end", "remarks",
            )
        )
        balances = party_balances(school_id, [p["id"] for p in parties], upto_date=upto)
        monthly = monthly_rates([p["id"] for p in parties])
        rows, total_due = [], 0
        for party in parties:
            bal = balances.get(party["id"], {})
            party["party_type_name"] = label(PARTY_TYPE_CHOICES, party["party_type"])
            party["monthly"] = monthly.get(party["id"], 0)
            party["opening"] = bal.get("opening", 0)
            party["charged"] = bal.get("charged", 0)
            party["paid"] = bal.get("paid", 0)
            party["balance"] = bal.get("balance", 0)
            total_due += party["balance"]
            rows.append(party)
        return Response(
            {
                "rows": rows,
                "total_due": total_due,
                "total_charged": sum(r["charged"] for r in rows),
                "total_paid": sum(r["paid"] for r in rows),
                "upto": upto,
            }
        )

    # ------------------------------------------------------------ statement
    def statement(self, request, school_id):
        """One party's whole account: every charge, every receipt, running balance.

        This is the page a school opens during a dispute, so it shows VOIDED
        receipts too — greyed out by `is_active` — rather than pretending they
        never happened.
        """
        party_id = self.int_or_none(request.query_params.get("party"))
        party = BillingParty.objects.filter(
            id=party_id, school_id=school_id, is_active=True
        ).first()
        if not party:
            return self.RESPONSE__NOT_FOUND

        entries = []
        opening = self.money(party.opening_due)
        if opening:
            entries.append(
                {
                    "date": party.agreement_start or "",
                    "kind": "opening",
                    "particular": "Old dues brought forward",
                    "charge": opening,
                    "payment": 0,
                    "is_active": True,
                }
            )
        for row in ExtraLedger.objects.filter(party=party).order_by("date", "id").values(
            "id", "date", "months", "details", "total", "remarks", "is_active"
        ):
            names = (row["details"] or {}).get(TITLE_NAMES_KEY) or {}
            parts = [
                f"{names.get(key, key)} {amount}"
                for key, amount in detail_rows(row["details"])
            ]
            months = ", ".join(
                MONTH_NAMES.get(int(m), str(m)) for m in (row["months"] or [])
            )
            entries.append(
                {
                    "date": row["date"],
                    "kind": "bill",
                    "particular": (f"Bill — {months}" if months else "Charge")
                    + (f" ({'; '.join(parts)})" if parts else ""),
                    "charge": row["total"],
                    "payment": 0,
                    "remarks": row["remarks"],
                    "is_active": row["is_active"],
                }
            )
        for row in ExtraInvoice.objects.filter(party=party).order_by("date", "id").values(
            "id", "invoice_id", "date", "total_paid", "mode", "remarks", "is_active"
        ):
            entries.append(
                {
                    "date": row["date"],
                    "kind": "receipt",
                    "receipt": row["invoice_id"],
                    "particular": f"Receipt No. {row['invoice_id']} ({label(PAYMENT_MODES, row['mode'])})",
                    "charge": 0,
                    "payment": row["total_paid"],
                    "remarks": row["remarks"],
                    "is_active": row["is_active"],
                }
            )
        entries.sort(key=lambda e: (str(e.get("date") or ""), e["kind"] != "opening"))

        running = self.money(0)
        for entry in entries:
            if entry["is_active"]:
                running += self.money(entry["charge"]) - self.money(entry["payment"])
            entry["balance"] = running
        return Response(
            {
                "party": {
                    "id": party.id,
                    "name": party.name,
                    "property_name": party.property_name,
                    "contact": party.contact,
                    "address": party.address,
                    "party_type_name": label(PARTY_TYPE_CHOICES, party.party_type),
                    "agreement_start": party.agreement_start,
                    "agreement_end": party.agreement_end,
                    "opening_due": opening,
                    "monthly": monthly_rates([party.id]).get(party.id, 0),
                    "remarks": party.remarks,
                },
                "entries": entries,
                "outstanding": title_wise_outstanding(party),
                "balance": running,
            }
        )

    # ----------------------------------------------------------- collection
    def collection(self, request, school_id):
        """What came in between two dates — the cash-up for extra billing."""
        start = request.query_params.get("from") or None
        end = request.query_params.get("to") or None
        rows = ExtraInvoice.objects.filter(school_id=school_id, is_active=True)
        if start:
            rows = rows.filter(date__gte=start)
        if end:
            rows = rows.filter(date__lte=end)
        receipts = list(
            rows.order_by("date", "invoice_id").values(
                "id", "invoice_id", "date", "total_paid", "mode", "remarks",
                "party", "details", *PARTY_COLUMNS,
            )
        )
        with_party_details(receipts)
        by_mode, by_title = {}, {}
        total = self.money(0)
        for receipt in receipts:
            receipt["mode_name"] = label(PAYMENT_MODES, receipt["mode"])
            amount = self.money(receipt["total_paid"])
            total += amount
            by_mode[receipt["mode_name"]] = self.money(by_mode.get(receipt["mode_name"], 0)) + amount
            names = (receipt["details"] or {}).get(TITLE_NAMES_KEY) or {}
            for key, value in detail_rows(receipt["details"]):
                name = names.get(key) or key
                by_title[name] = self.money(by_title.get(name, 0)) + value
            receipt.pop("details")
        return Response(
            {
                "rows": receipts,
                "total": total,
                "by_mode": [{"name": k, "total": v} for k, v in by_mode.items()],
                "by_title": [{"name": k, "total": v} for k, v in by_title.items()],
                "from": start,
                "to": end,
            }
        )

    # -------------------------------------------------------------- charges
    def charges(self, request, school_id):
        """Every bill raised between two dates — the other half of collection."""
        start = request.query_params.get("from") or None
        end = request.query_params.get("to") or None
        rows = ExtraLedger.objects.filter(school_id=school_id, is_active=True)
        if start:
            rows = rows.filter(date__gte=start)
        if end:
            rows = rows.filter(date__lte=end)
        ledgers = list(
            rows.order_by("date", "id").values(
                "id", "date", "months", "total", "remarks", "details",
                "party", *PARTY_COLUMNS,
            )
        )
        with_party_details(ledgers)
        by_title = {}
        total = self.money(0)
        for row in ledgers:
            row["months_name"] = ", ".join(
                MONTH_NAMES.get(int(m), str(m)) for m in (row["months"] or [])
            ) or "—"
            total += self.money(row["total"])
            names = (row["details"] or {}).get(TITLE_NAMES_KEY) or {}
            for key, value in detail_rows(row["details"]):
                name = names.get(key) or key
                by_title[name] = self.money(by_title.get(name, 0)) + value
            row.pop("details")
        return Response(
            {
                "rows": ledgers,
                "total": total,
                "by_title": [{"name": k, "total": v} for k, v in by_title.items()],
                "from": start,
                "to": end,
            }
        )

    # -------------------------------------------------------------- summary
    def summary(self, request, school_id):
        parties = list(
            BillingParty.objects.filter(school_id=school_id, is_active=True).values(
                "id", "name", "property_name"
            )
        )
        balances = party_balances(school_id, [p["id"] for p in parties])
        owing = [
            {**p, "balance": balances.get(p["id"], {}).get("balance", 0)}
            for p in parties
            if balances.get(p["id"], {}).get("balance", 0) > 0
        ]
        owing.sort(key=lambda p: p["balance"], reverse=True)
        return Response(
            {
                "parties": len(parties),
                "charged": sum(b["charged"] for b in balances.values()),
                "collected": sum(b["paid"] for b in balances.values()),
                "outstanding": sum(b["balance"] for b in balances.values()),
                "owing": owing[:10],
                "owing_count": len(owing),
            }
        )
