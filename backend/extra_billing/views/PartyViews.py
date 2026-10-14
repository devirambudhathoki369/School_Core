"""The people (and shops, and offices) a school bills besides its students.

  GET/POST/PUT/DELETE  /extra-billing/parties        ?school= [&as_options=true]
  GET/POST             /extra-billing/charges        ?school=&party=

A DELETE here is SOFT and refused once the party has any money against them.
That is the house rule in this codebase (BusStation, Course, Section, Subject,
hostel rooms all behave this way) and it matters most where money is: removing a
tenant who has paid takes the record of what they paid with them.
"""

from django.db.models import Q
from rest_framework.response import Response

from ..constants import PARTY_TYPE_CHOICES, label
from ..methods.balances import monthly_rates, party_balances
from ..models.Billing import ExtraInvoice, ExtraLedger
from ..models.Party import BillingParty, BillingTitle, PartyCharge
from .BaseViews import ExtraBillingBaseView

PARTY_FIELDS = (
    "id", "name", "party_type", "contact", "address", "property_name",
    "agreement_start", "agreement_end", "opening_due", "remarks",
)


class BillingPartyView(ExtraBillingBaseView):
    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        as_options = self.getBooleanValue(request.query_params.get("as_options"))

        parties = list(
            BillingParty.objects.filter(school_id=school_id, is_active=True)
            .order_by("name")
            .values(*PARTY_FIELDS)
        )
        if as_options:
            return Response(
                [
                    {
                        "value": p["id"],
                        "name": f"{p['name']}" + (f" — {p['property_name']}" if p["property_name"] else ""),
                    }
                    for p in parties
                ]
            )
        balances = party_balances(school_id, [p["id"] for p in parties])
        # The rate card, so the list can show what each party is billed monthly
        # without a query per row.
        monthly = monthly_rates([p["id"] for p in parties])
        for p in parties:
            bal = balances.get(p["id"], {})
            p["party_type_name"] = label(PARTY_TYPE_CHOICES, p["party_type"])
            p["monthly"] = monthly.get(p["id"], 0)
            p["charged"] = bal.get("charged", 0)
            p["paid"] = bal.get("paid", 0)
            p["balance"] = bal.get("balance", 0)
        return Response(parties)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        return self._save(request, None)

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        party_id = self.int_or_none(request.data.get("id"))
        if not party_id:
            return self.RESPONSE__INVALID_REQUEST
        return self._save(request, party_id)

    def _save(self, request, party_id):
        school_id = self.school_id(request)
        data = request.data
        name = (data.get("name") or "").strip()
        if len(name) < 2:
            return Response({"message": "A name is required."}, status=400)
        property_name = (data.get("property_name") or "").strip() or None

        # Two tenants of the same name in the same shutter is a duplicate entry,
        # not a second tenant — and two identical rows in a dues report are
        # indistinguishable from a double bill.
        twin = BillingParty.objects.filter(
            school_id=school_id, is_active=True, name__iexact=name
        ).filter(Q(property_name__iexact=property_name) if property_name else Q(property_name__isnull=True))
        if party_id:
            twin = twin.exclude(id=party_id)
        if twin.exists():
            return self.RESPONSE__ALREADY_EXISTS

        values = {
            "name": name,
            "party_type": self.int_or_none(data.get("party_type")) or 1,
            "contact": (data.get("contact") or "").strip() or None,
            "address": (data.get("address") or "").strip() or None,
            "property_name": property_name,
            "agreement_start": data.get("agreement_start") or None,
            "agreement_end": data.get("agreement_end") or None,
            "remarks": (data.get("remarks") or "").strip() or None,
        }
        if party_id:
            party = BillingParty.objects.filter(
                id=party_id, school_id=school_id, is_active=True
            ).first()
            if not party:
                return self.RESPONSE__NOT_FOUND
            # The opening due is only editable while nothing has been posted
            # against the party. After that it is history: silently moving it
            # would change a balance that receipts have already been issued
            # against.
            if "opening_due" in data:
                has_money = (
                    ExtraLedger.objects.filter(party=party, is_active=True).exists()
                    or ExtraInvoice.objects.filter(party=party, is_active=True).exists()
                )
                if not has_money:
                    values["opening_due"] = self.money(data.get("opening_due"))
            for field, value in values.items():
                setattr(party, field, value)
            party.save()
            return Response({"id": party.id, "message": "Party updated!"})

        values["opening_due"] = self.money(data.get("opening_due"))
        party = BillingParty.objects.create(school_id=school_id, **values)
        return Response({"id": party.id, "message": "Party added!"})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        party_id = self.int_or_none(request.query_params.get("id"))
        party = BillingParty.objects.filter(
            id=party_id, school_id=school_id, is_active=True
        ).first()
        if not party:
            return self.RESPONSE__NOT_FOUND
        charged = ExtraLedger.objects.filter(party=party, is_active=True).count()
        paid = ExtraInvoice.objects.filter(party=party, is_active=True).count()
        if charged or paid:
            return Response(
                {
                    "message": (
                        f"{party.name} has {charged} bill(s) and {paid} receipt(s) on record, "
                        "so the record has to stay. Nothing was deleted."
                    )
                },
                status=400,
            )
        party.is_active = False
        party.save(update_fields=["is_active", "updated_at"])
        PartyCharge.objects.filter(party=party).update(is_active=False)
        return Response({"message": "Party removed!"})


class PartyChargeView(ExtraBillingBaseView):
    """A party's rate card: what they owe per month, title by title.

    POST replaces the whole set for that party in one call, because that is how
    the screen works — the office edits a small table and saves it once. Rows
    that disappear are deactivated rather than deleted, so a rate that was in
    force when a bill was raised can still be found.
    """

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        party_id = self.int_or_none(request.query_params.get("party"))
        if not party_id:
            return self.RESPONSE__INVALID_REQUEST
        if not BillingParty.objects.filter(
            id=party_id, school_id=school_id, is_active=True
        ).exists():
            return self.RESPONSE__NOT_FOUND
        titles = list(
            BillingTitle.objects.filter(school_id=school_id, is_active=True)
            .order_by("order", "title")
            .values("id", "title", "order")
        )
        amounts = {
            row["title_id"]: row["amount"]
            for row in PartyCharge.objects.filter(
                party_id=party_id, is_active=True
            ).values("title_id", "amount")
        }
        return Response(
            [
                {**t, "amount": amounts.get(t["id"], 0), "billed": t["id"] in amounts}
                for t in titles
            ]
        )

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        party_id = self.int_or_none(request.data.get("party"))
        rows = request.data.get("charges")
        if not party_id or not isinstance(rows, list):
            return self.RESPONSE__INVALID_REQUEST
        if not BillingParty.objects.filter(
            id=party_id, school_id=school_id, is_active=True
        ).exists():
            return self.RESPONSE__NOT_FOUND

        valid_titles = set(
            BillingTitle.objects.filter(
                school_id=school_id, is_active=True
            ).values_list("id", flat=True)
        )
        wanted = {}
        for row in rows:
            title_id = self.int_or_none((row or {}).get("title"))
            if title_id not in valid_titles:
                continue
            amount = self.money((row or {}).get("amount"))
            # Zero is "not billed": a rate card row of 0 would put a 0.00 line
            # on every bill for the rest of the tenancy.
            if amount > 0:
                wanted[title_id] = amount

        existing = {
            charge.title_id: charge
            for charge in PartyCharge.objects.filter(party_id=party_id)
        }
        for title_id, amount in wanted.items():
            charge = existing.get(title_id)
            if charge:
                charge.amount = amount
                charge.is_active = True
                charge.save(update_fields=["amount", "is_active", "updated_at"])
            else:
                PartyCharge.objects.create(
                    party_id=party_id, title_id=title_id, amount=amount
                )
        dropped = [tid for tid in existing if tid not in wanted]
        if dropped:
            PartyCharge.objects.filter(
                party_id=party_id, title_id__in=dropped
            ).update(is_active=False)
        return Response(
            {
                "message": "Charges saved!",
                "titles": len(wanted),
                "monthly": sum(wanted.values()),
            }
        )
