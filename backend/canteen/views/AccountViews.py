"""Canteen accounts: money in, money back, limits, lost cards.

  GET     /canteen/accounts   ?school=[&filter=held|owing|blocked]   every account
  GET     /canteen/accounts   ?school=&id=                           one, with statement
  POST    /canteen/accounts   {action: "topup"|"refund", buyer_type, buyer, amount, mode, ...}
  PUT     /canteen/accounts   {id, daily_limit, credit_limit, is_blocked, block_reason, notes}
  DELETE  /canteen/accounts   ?school=&txn=&remarks=                 void a top-up / refund
  GET     /canteen/receipts   ?school=&id=                           one office receipt, for print

A top-up and a refund are money across the office desk, so each gets a numbered
receipt (its own series per school and fiscal year). Voiding one keeps it and
its number on the record.
"""

from django.db import IntegrityError, transaction
from rest_framework.response import Response

from main.methods.nepaliDatetime import npt

from ..constants import (
    BUYER_CHOICES,
    BUYER_STAFF,
    BUYER_STUDENT,
    MODES,
    MONTH_NAMES,
    PAGE_ACCOUNTS,
    PAGE_COLLECT,
    TXN_CHOICES,
    TXN_REFUND,
    TXN_TOPUP,
    label,
)
from ..methods.balances import balance, balances, effective_limits, spent_on
from ..methods.ledger import TITLES, detail_rows, details_blob
from ..methods.ledger import statement as ledger_statement
from ..methods.buyers import (
    account_facts,
    account_owner,
    describe_buyers,
    find_staff,
    find_students,
    get_or_open_account,
)
from ..methods.notify import tell_family
from ..methods.plans import due_allowance, enrollments_by_student
from ..methods.numbering import next_receipt_no
from ..methods.settings import settings_for
from ..models import CanteenAccount, CanteenSale, CanteenTransaction
from .BaseViews import CanteenBaseView

MAX_MINT_ATTEMPTS = 5
# One top-up larger than this is a typo (an extra zero), not a lunch fund.
MAX_TOPUP = 100000


def txn_json(txn):
    return {
        "id": txn.id,
        "kind": txn.kind,
        "kind_name": label(TXN_CHOICES, txn.kind),
        "amount": txn.amount,
        "date": txn.date,
        "time": npt(txn.entered_at).strftime("%I:%M %p") if txn.entered_at else None,
        "receipt_no": txn.receipt_no,
        "mode": txn.mode,
        "mode_name": label(MODES, txn.mode),
        "remarks": txn.remarks,
        "entered_by": txn.entered_by,
        "sale": txn.sale_id,
        "is_active": txn.is_active,
        "void_reason": (txn.extra_info or {}).get("void_reason"),
        "balance_after": (txn.extra_info or {}).get("balance_after"),
        # item-wise: what was charged, or what this receipt paid
        "lines": [
            {"item": key, "name": ((txn.details or {}).get(TITLES) or {}).get(key, "Item"), "amount": amount}
            for key, amount in detail_rows(txn.details)
        ],
        "months": [MONTH_NAMES.get(m, m) for m in (txn.months or [])],
    }


def student_due(account, today):
    if not account.student_id:
        return 0
    return due_allowance(enrollments_by_student(account.school_id, [account.student_id], today)
                         .get(account.student_id, []))


def account_row(account, settings, today, bal_map, spent_map):
    buyer_type, buyer_id, name, detail = account_owner(account)
    return {
        "id": account.id,
        "buyer_type": buyer_type,
        "buyer_type_name": label(BUYER_CHOICES, buyer_type),
        "buyer": buyer_id,
        "name": name,
        "detail": detail,
        "block_reason": account.block_reason,
        **account_facts(account, settings, today, bal_map, spent_map, student_due(account, today)),
    }


class CanteenAccountView(CanteenBaseView):
    # Money in and out is taken at Card Accounts and at Collect & Receipt alike;
    # limits and blocked cards only at Card Accounts.
    pages_for = {
        "GET": (PAGE_ACCOUNTS, PAGE_COLLECT),
        "POST": (PAGE_ACCOUNTS, PAGE_COLLECT),
        "PUT": (PAGE_ACCOUNTS,),
        "DELETE": (PAGE_ACCOUNTS, PAGE_COLLECT),
    }

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        settings = settings_for(school_id)
        today = self.today()
        account_id = self.int_or_none(request.query_params.get("id"))
        if account_id:
            return self._one(school_id, account_id, settings, today)

        accounts = list(CanteenAccount.objects.filter(school_id=school_id, is_active=True))
        ids = [a.id for a in accounts]
        bal_map, spent_map = balances(ids), spent_on(ids, today)
        # Names in two queries for the whole list, not one per account.
        students = {
            s["id"]: s
            for s in describe_buyers(
                school_id, settings, today,
                students=find_students(school_id, ids=[a.student_id for a in accounts if a.student_id], limit=100000),
            )
        }
        staff = {
            s["id"]: s
            for s in describe_buyers(
                school_id, settings, today,
                staff=find_staff(school_id, ids=[a.staff_id for a in accounts if a.staff_id], limit=100000),
            )
        }
        rows = []
        for account in accounts:
            if account.student_id:
                known = students.get(account.student_id)
            else:
                known = staff.get(account.staff_id)
            if known:
                row = {
                    "id": account.id,
                    "buyer_type": known["buyer_type"],
                    "buyer_type_name": label(BUYER_CHOICES, known["buyer_type"]),
                    "buyer": known["id"],
                    "name": known["name"],
                    "detail": known["detail"],
                    "roll_no": known.get("roll_no"),
                    "contact": known.get("contact"),
                    "plans": known.get("plans", []),
                    **account_facts(account, settings, today, bal_map, spent_map, known.get("due_allowed", 0)),
                }
            else:
                # Left the school, or no longer employed: the account and its
                # money are still theirs, so it stays on the list.
                row = account_row(account, settings, today, bal_map, spent_map)
                row["left"] = True
            rows.append(row)
        wanted = (request.query_params.get("filter") or "").lower()
        if wanted == "held":
            rows = [r for r in rows if r["balance"] > 0]
        elif wanted == "owing":
            rows = [r for r in rows if r["balance"] < 0]
        elif wanted == "blocked":
            rows = [r for r in rows if r["is_blocked"]]
        rows.sort(key=lambda r: (r["name"] or "").lower())
        return Response(rows)

    def _one(self, school_id, account_id, settings, today):
        account = CanteenAccount.objects.filter(id=account_id, school_id=school_id).first()
        if not account:
            return self.RESPONSE__NOT_FOUND
        bal_map, spent_map = balances([account.id]), spent_on([account.id], today)
        data = account_row(account, settings, today, bal_map, spent_map)
        txns = list(account.transactions.order_by("id"))
        running, statement = 0, []
        for txn in txns:
            row = txn_json(txn)
            if txn.is_active:
                running += txn.amount
            row["running"] = running
            statement.append(row)
        sale_nos = dict(
            CanteenSale.objects.filter(id__in=[t.sale_id for t in txns if t.sale_id]).values_list("id", "sale_no")
        )
        for row in statement:
            row["sale_no"] = sale_nos.get(row["sale"])
        statement.reverse()
        data["statement"] = statement
        data["dues"] = ledger_statement(school_id, account.id)
        return Response(data)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        data = request.data
        action = (data.get("action") or "").lower()
        if action not in ("topup", "refund"):
            return self.RESPONSE__INVALID_REQUEST
        economic_year_id = self.economic_year(request, school_id)
        if not economic_year_id:
            return Response({"message": "This school has no economic year set."}, status=400)
        settings = settings_for(school_id)
        # What a payment pays, item by item ({item id: amount}); the rest of the
        # amount is an advance. Refunds name no items.
        allocations = {}
        if action == "topup":
            for key, value in (data.get("details") or {}).items():
                value = self.money(value)
                if value < 0:
                    return Response({"message": "An amount cannot be below zero."}, status=400)
                if value > 0:
                    allocations[str(key)] = value
        amount = self.money(data.get("amount")) if data.get("amount") not in (None, "") else sum(
            allocations.values(), self.money(0))
        if amount <= 0:
            return Response({"message": "Enter an amount."}, status=400)
        if sum(allocations.values(), self.money(0)) > amount:
            return Response({"message": "The items paid add up to more than the amount received."}, status=400)
        if amount > MAX_TOPUP:
            return Response({"message": f"At most Rs. {MAX_TOPUP:,} at one time."}, status=400)
        mode = self.int_or_none(data.get("mode")) or 1
        if mode not in dict(MODES):
            mode = 1

        account_id = self.int_or_none(data.get("account"))
        if account_id:
            account = CanteenAccount.objects.filter(id=account_id, school_id=school_id, is_active=True).first()
        else:
            buyer_type = self.int_or_none(data.get("buyer_type"))
            buyer_id = self.int_or_none(data.get("buyer"))
            if buyer_type not in (BUYER_STUDENT, BUYER_STAFF) or not buyer_id:
                return Response({"message": "Pick the student or member of staff."}, status=400)
            if action == "refund":
                account = CanteenAccount.objects.filter(
                    school_id=school_id, is_active=True,
                    **({"student_id": buyer_id} if buyer_type == BUYER_STUDENT else {"staff_id": buyer_id}),
                ).first()
            else:
                account = get_or_open_account(school_id, buyer_type, buyer_id)
        if not account:
            return self.RESPONSE__NOT_FOUND

        kind = TXN_TOPUP if action == "topup" else TXN_REFUND
        signed = amount if kind == TXN_TOPUP else -amount
        entered_by = self.entered_by(request)
        txn, after = None, None
        for _ in range(MAX_MINT_ATTEMPTS):
            try:
                with transaction.atomic():
                    CanteenAccount.objects.select_for_update().get(id=account.id)
                    before = balance(account.id)
                    if kind == TXN_REFUND and amount > before:
                        return Response(
                            {"message": f"Only Rs. {max(before, 0):,.2f} is on the account to give back."},
                            status=400,
                        )
                    dues = {r["item"]: r for r in ledger_statement(school_id, account.id)["items"]}
                    for key, value in allocations.items():
                        owed = dues.get(key, {}).get("raw_due", self.money(0))
                        if value > owed:
                            name = dues.get(key, {}).get("name", "that item")
                            return Response(
                                {"message": f"{name}: Rs. {value:,.2f} entered, but only Rs. {owed:,.2f} is due."},
                                status=400,
                            )
                    names = {k: dues[k]["name"] for k in allocations}
                    after = before + signed
                    number = next_receipt_no(school_id, economic_year_id)
                    txn = CanteenTransaction.objects.create(
                        school_id=school_id,
                        economic_year_id=economic_year_id,
                        account=account,
                        kind=kind,
                        amount=signed,
                        date=self.bs_date(data.get("date")),
                        receipt_no=number,
                        mode=mode,
                        remarks=self.text(data.get("remarks"), 120),
                        details=details_blob(allocations, names) if allocations else {},
                        entered_by=entered_by,
                        extra_info={"balance_after": str(after)},
                    )
                    tell_family(settings, account, kind, amount, after)
                break
            except IntegrityError:
                txn = None
        if not txn:
            return Response({"message": "Could not issue a receipt number, please retry."}, status=409)
        word = "Receipt" if kind == TXN_TOPUP else "Refund receipt"
        left = f"Rs. {after:,.2f} advance" if after >= 0 else f"Rs. {-after:,.2f} still due"
        return Response(
            {
                **txn_json(txn),
                "account": account.id,
                "balance": after,
                "message": f"{word} C-{txn.receipt_no} saved — Rs. {amount:,.2f}. Now {left}.",
            }
        )

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        data = request.data
        account_id = self.int_or_none(data.get("id"))
        if account_id:
            account = CanteenAccount.objects.filter(id=account_id, school_id=school_id, is_active=True).first()
        else:
            # Limits or a note for a buyer who has never used the canteen yet:
            # their account opens here.
            account = get_or_open_account(
                school_id, self.int_or_none(data.get("buyer_type")), self.int_or_none(data.get("buyer"))
            )
        if not account:
            return self.RESPONSE__NOT_FOUND
        for field in ("daily_limit", "credit_limit"):
            if field in data:
                raw = data.get(field)
                if raw in (None, ""):
                    setattr(account, field, None)  # back to the school's default
                else:
                    amount = self.money(raw)
                    if amount < 0:
                        return Response({"message": "Limits cannot be below zero."}, status=400)
                    setattr(account, field, amount)
        if "is_blocked" in data:
            account.is_blocked = self.bool_of(data.get("is_blocked"))
            account.block_reason = self.text(data.get("block_reason"), 100) if account.is_blocked else None
        if "notes" in data:
            account.notes = self.text(data.get("notes"), 500)
        account.save()
        settings = settings_for(school_id)
        today = self.today()
        return Response(
            {
                **account_row(account, settings, today, balances([account.id]), spent_on([account.id], today)),
                "message": (
                    "Card blocked. The balance stays on the account."
                    if account.is_blocked and data.get("is_blocked") is not None
                    else "Account saved!"
                ),
            }
        )

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        txn = CanteenTransaction.objects.filter(
            id=self.int_or_none(request.query_params.get("txn")), school_id=school_id, is_active=True
        ).first()
        if not txn:
            return self.RESPONSE__NOT_FOUND
        if txn.kind not in (TXN_TOPUP, TXN_REFUND):
            return Response(
                {
                    "message": "Only a receipt or a refund is voided here. A sale is voided at the "
                    "counter; a monthly posting is withdrawn in Monthly Posting."
                },
                status=400,
            )
        reason = self.text(request.query_params.get("remarks"), 100) or "voided"
        with transaction.atomic():
            account = CanteenAccount.objects.select_for_update().get(id=txn.account_id)
            # A receipt voided by mistake-correction: whatever it paid is due
            # again, which is the truth once the money is not there. The void
            # keeps who did it and why.
            after = balance(account.id) - txn.amount
            txn.is_active = False
            txn.extra_info = {**(txn.extra_info or {}), "void_reason": reason}
            txn.save(update_fields=["is_active", "extra_info", "updated_at"])
        return Response(
            {
                "message": (
                    f"Receipt C-{txn.receipt_no} voided — whatever it paid is due again "
                    f"(balance now Rs. {after:,.2f}). It stays on the record and its number is not reused."
                )
            }
        )


class CanteenReceiptView(CanteenBaseView):
    """One office receipt (a top-up or a refund), for the printed copy."""

    pages_for = {"GET": (PAGE_ACCOUNTS, PAGE_COLLECT)}

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        txn = CanteenTransaction.objects.filter(
            id=self.int_or_none(request.query_params.get("id")),
            school_id=school_id,
            kind__in=(TXN_TOPUP, TXN_REFUND),
        ).select_related("account").first()
        if not txn:
            return self.RESPONSE__NOT_FOUND
        buyer_type, buyer_id, name, detail = account_owner(txn.account)
        return Response(
            {
                **txn_json(txn),
                "buyer_type": buyer_type,
                "buyer": buyer_id,
                "name": name,
                "detail": detail,
            }
        )
