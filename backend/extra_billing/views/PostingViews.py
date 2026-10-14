"""Raising the bills: the extra-billing equivalent of Payment > Ledger posting.

  GET     /extra-billing/postings   ?school= [&economic_year=]   the run history
  POST    /extra-billing/postings   raise a month (or several) for chosen parties
  DELETE  /extra-billing/postings   ?school=&id=   withdraw a run made by mistake

THE ONE RULE THIS SCREEN MUST NOT BREAK IS DOUBLE BILLING.
A month charged twice is silent — nothing errors, the tenant simply owes double
until somebody adds up their own receipts. So a party already billed for a month
in this fiscal year is SKIPPED, never charged again, and the response names who
was skipped so the office can see it happened rather than wonder.

A run writes ONE `ExtraLedgerPosting` (the run) and one `ExtraLedger` per party
(their charge). Withdrawing a run soft-deletes both: the rows stay for anyone
asking what happened, and stop counting towards the balance immediately — but
only while no receipt has been issued against that party since, because money
already collected against a bill must never be left pointing at nothing.
"""

from django.db import transaction
from rest_framework.response import Response

from ..constants import MONTH_NAMES, TITLE_NAMES_KEY
from ..methods.balances import posted_months
from ..models.Billing import ExtraInvoice, ExtraLedger, ExtraLedgerPosting
from ..models.Party import BillingParty, BillingTitle, PartyCharge
from .BaseViews import ExtraBillingBaseView


class ExtraPostingView(ExtraBillingBaseView):
    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        economic_year_id = self.economic_year(request, school_id)
        party_id = self.int_or_none(request.query_params.get("party"))

        runs = list(
            ExtraLedgerPosting.objects.filter(
                school_id=school_id, economic_year_id=economic_year_id, is_active=True
            )
            .order_by("-id")
            .values("id", "date", "months", "remarks")
        )
        ledgers = ExtraLedger.objects.filter(
            posting_id__in=[r["id"] for r in runs], is_active=True
        )
        if party_id:
            ledgers = ledgers.filter(party_id=party_id)
        counts, totals = {}, {}
        for posting_id, total in ledgers.values_list("posting_id", "total"):
            counts[posting_id] = counts.get(posting_id, 0) + 1
            totals[posting_id] = self.money(totals.get(posting_id, 0)) + self.money(total)
        for run in runs:
            run["months_name"] = ", ".join(
                MONTH_NAMES.get(int(m), str(m)) for m in (run["months"] or [])
            ) or "—"
            run["parties"] = counts.get(run["id"], 0)
            run["total"] = totals.get(run["id"], 0)
        # A party filter means "show me only the runs that touched them".
        if party_id:
            runs = [r for r in runs if r["parties"]]
        return Response(
            {
                "postings": runs,
                "already_posted": {
                    str(pid): sorted(months)
                    for pid, months in posted_months(school_id, economic_year_id).items()
                },
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
        months = [
            m for m in (self.int_or_none(x) for x in (data.get("months") or [])) if m
        ]
        party_ids = [
            p for p in (self.int_or_none(x) for x in (data.get("parties") or [])) if p
        ]
        date = data.get("date") or None
        remarks = (data.get("remarks") or "").strip() or None
        # A one-off charge (a repair recovered from a tenant) belongs to no
        # month, and is typed straight into `charges` instead of coming from the
        # rate card.
        one_off = data.get("charges") if isinstance(data.get("charges"), dict) else None

        parties = list(
            BillingParty.objects.filter(
                id__in=party_ids, school_id=school_id, is_active=True
            ).values("id", "name")
        )
        if not parties:
            return Response({"message": "Choose at least one party."}, status=400)
        if not months and not one_off:
            return Response({"message": "Choose at least one month."}, status=400)

        titles = {
            row["id"]: row["title"]
            for row in BillingTitle.objects.filter(
                school_id=school_id, is_active=True
            ).values("id", "title")
        }
        rate_card = {}
        for row in PartyCharge.objects.filter(
            party_id__in=[p["id"] for p in parties], is_active=True
        ).values("party_id", "title_id", "amount"):
            rate_card.setdefault(row["party_id"], {})[row["title_id"]] = self.money(
                row["amount"]
            )

        already = posted_months(school_id, economic_year_id, [p["id"] for p in parties])
        posted, skipped, no_rate = [], [], []
        with transaction.atomic():
            run_values = {
                "school_id": school_id,
                "economic_year_id": economic_year_id,
                "months": months,
                "remarks": remarks,
            }
            # Left out entirely when the client sends none, so the model default
            # (today, Nepali calendar) applies instead of a NULL.
            if date:
                run_values["date"] = date
            run = ExtraLedgerPosting.objects.create(**run_values)
            rows = []
            for party in parties:
                pid = party["id"]
                # Months this party has NOT been billed yet, in this year.
                due_months = [m for m in months if m not in already.get(pid, set())]
                if months and not due_months:
                    skipped.append(
                        {
                            "party": pid,
                            "name": party["name"],
                            "months": [MONTH_NAMES.get(m, str(m)) for m in months],
                        }
                    )
                    continue

                if one_off:
                    amounts = {}
                    for key, value in one_off.items():
                        title_id = self.int_or_none(key)
                        amount = self.money(value)
                        if title_id in titles and amount > 0:
                            amounts[str(title_id)] = amount
                else:
                    card = rate_card.get(pid) or {}
                    if not card:
                        no_rate.append({"party": pid, "name": party["name"]})
                        continue
                    # One row per party per run, carrying every month chosen:
                    # the amount is the monthly rate times the months billed,
                    # exactly like a student's ledger row for two months.
                    amounts = {
                        str(title_id): amount * len(due_months)
                        for title_id, amount in card.items()
                    }
                total = sum(amounts.values(), self.money(0))
                if total <= 0:
                    no_rate.append({"party": pid, "name": party["name"]})
                    continue
                # Amounts go into JSON as STRINGS: a JSON float would silently
                # round the paisa, and every reader in this module coerces with
                # `_money` before adding anything, so a string is never summed
                # as text (that mistake once turned a receipt into ten times
                # itself on the student side).
                details = {key: str(amount) for key, amount in amounts.items()}
                details[TITLE_NAMES_KEY] = {
                    key: titles.get(int(key), "") for key in amounts
                }
                rows.append(
                    ExtraLedger(
                        posting=run,
                        party_id=pid,
                        school_id=school_id,
                        economic_year_id=economic_year_id,
                        date=date or run.date,
                        months=due_months,
                        details=details,
                        total=total,
                        remarks=remarks,
                    )
                )
                posted.append(
                    {
                        "party": pid,
                        "name": party["name"],
                        "months": [MONTH_NAMES.get(m, str(m)) for m in due_months],
                        "total": total,
                    }
                )
            if rows:
                ExtraLedger.objects.bulk_create(rows)
            else:
                # Nothing was raised: do not leave an empty run in the history,
                # it reads as a bill that vanished.
                run.is_active = False
                run.save(update_fields=["is_active", "updated_at"])
        return Response(
            {
                "posting": run.id if rows else None,
                "posted": posted,
                "skipped": skipped,
                "without_rate": no_rate,
                "total": sum(p["total"] for p in posted),
                "message": (
                    f"{len(posted)} bill(s) raised."
                    + (f" {len(skipped)} already billed for those months." if skipped else "")
                    + (f" {len(no_rate)} have no monthly charge set." if no_rate else "")
                )
                if posted
                else (
                    "Nothing was raised — "
                    + (
                        "those parties are already billed for the months chosen."
                        if skipped
                        else "no monthly charge is set for them (Parties ▸ Charges)."
                    )
                ),
            }
        )

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        run_id = self.int_or_none(request.query_params.get("id"))
        run = ExtraLedgerPosting.objects.filter(
            id=run_id, school_id=school_id, is_active=True
        ).first()
        if not run:
            return self.RESPONSE__NOT_FOUND
        ledgers = ExtraLedger.objects.filter(posting=run, is_active=True)
        party_ids = set(ledgers.values_list("party_id", flat=True))
        # Money already collected from these parties after the run was raised is
        # the line we do not cross: withdrawing the bill under a receipt leaves
        # the payer in credit and the books wrong.
        paid_after = ExtraInvoice.objects.filter(
            party_id__in=party_ids, is_active=True, date__gte=run.date
        ).count()
        if paid_after:
            return Response(
                {
                    "message": (
                        f"{paid_after} receipt(s) have been issued to these parties since this run. "
                        "Withdrawing the bill would leave those receipts pointing at nothing — "
                        "void the receipts first, or raise a correcting charge instead."
                    )
                },
                status=400,
            )
        with transaction.atomic():
            ledgers.update(is_active=False)
            run.is_active = False
            run.save(update_fields=["is_active", "updated_at"])
        return Response({"message": "Bill run withdrawn. The record stays on file."})
