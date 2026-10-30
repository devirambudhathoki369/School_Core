"""The canteen's records.

  GET /canteen/reports ?school=&type=summary                     today's tiles
  GET /canteen/reports ?school=&type=sales&from=&to=[&payment=]   every sale, voided ones marked
  GET /canteen/reports ?school=&type=items&from=&to=              item-wise quantity and money
  GET /canteen/reports ?school=&type=cashier&from=&to=            what each person took, and the cash
  GET /canteen/reports ?school=&type=receipts&from=&to=           top-up and refund receipts
  GET /canteen/reports ?school=&type=postings&from=&to=           monthly posting, student by student
  GET /canteen/reports ?school=&type=dues[&class_key=]            who owes the canteen what, item by item
  GET /canteen/reports ?school=&type=meals&date=                  the kitchen's count: on plan, served, bought
  POST /canteen/dues-reminder {class_key?, accounts?}             app message to families who owe

Nepali dates are stored as zero-padded YYYY-MM-DD strings, so a string range IS
a date range — how every other dated report in this product filters. Voided rows
are listed (marked) but never counted in a total.
"""

from collections import defaultdict

from django.db import transaction
from django.db.models import Count, Q, Sum
from rest_framework.response import Response

from main.models.Student import Student

from ..constants import (
    MODE_CASH,
    PLAN_MONTHLY,
    MONTH_NAMES,
    PAGE_REPORTS,
    PAY_ACCOUNT,
    PAY_CASH,
    PAY_PLAN,
    TXN_POSTING,
    TXN_REFUND,
    TXN_TOPUP,
)
from ..methods.balances import live
from ..methods.buyers import CLASS_VALUES, account_owner, class_label, person_name
from ..methods.classes import KEY_VALUES, class_key, key_label, sort_key
from ..methods.plans import open_on
from ..methods.reminders import body_for, reachable, send_reminders
from ..methods.ledger import detail_rows, statements
from ..models import (
    CanteenAccount,
    CanteenEnrollment,
    CanteenItem,
    CanteenSale,
    CanteenSaleLine,
    CanteenTransaction,
)
from .AccountViews import txn_json
from .SaleViews import buyer_names, sale_json
from .BaseViews import CanteenBaseView

ZERO = 0


class CanteenReportView(CanteenBaseView):
    pages_for = {"GET": (PAGE_REPORTS,)}

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        handler = {
            "summary": self.summary,
            "sales": self.sales,
            "items": self.items,
            "cashier": self.cashier,
            "receipts": self.receipts,
            "postings": self.postings,
            "dues": self.dues,
            "meals": self.meals,
        }.get((request.query_params.get("type") or "summary").lower())
        if not handler:
            return self.RESPONSE__INVALID_REQUEST
        return handler(request, school_id)

    def _range(self, request):
        today = self.today()
        start = self.bs_date(request.query_params.get("from") or today)
        end = self.bs_date(request.query_params.get("to") or start)
        if end < start:
            start, end = end, start
        return start, end

    # ---------------------------------------------------------------- summary
    def summary(self, request, school_id):
        today = self.today()
        sales = CanteenSale.objects.filter(school_id=school_id, date=today, is_active=True)
        by_payment = {
            r["payment"]: (r["n"], r["total"] or ZERO)
            for r in sales.values("payment").annotate(n=Count("id"), total=Sum("total"))
        }
        office = {
            (r["kind"], r["mode"]): r["total"] or ZERO
            for r in CanteenTransaction.objects.filter(
                school_id=school_id, date=today, is_active=True, kind__in=(TXN_TOPUP, TXN_REFUND)
            )
            .values("kind", "mode")
            .annotate(total=Sum("amount"))
        }
        balances = (
            live(CanteenTransaction.objects.filter(school_id=school_id))
            .values("account_id")
            .annotate(balance=Sum("amount"))
        )
        held = sum((r["balance"] for r in balances if r["balance"] > 0), ZERO)
        owing = -sum((r["balance"] for r in balances if r["balance"] < 0), ZERO)
        cash_n, cash_total = by_payment.get(PAY_CASH, (0, ZERO))
        acc_n, acc_total = by_payment.get(PAY_ACCOUNT, (0, ZERO))
        plan_n, _ = by_payment.get(PAY_PLAN, (0, ZERO))
        topups = sum((v for (kind, _), v in office.items() if kind == TXN_TOPUP), ZERO)
        refunds = -sum((v for (kind, _), v in office.items() if kind == TXN_REFUND), ZERO)
        cash_topups = office.get((TXN_TOPUP, MODE_CASH), ZERO)
        cash_refunds = -office.get((TXN_REFUND, MODE_CASH), ZERO)
        items = CanteenItem.objects.filter(school_id=school_id, is_active=True)
        return Response({
            "date": today,
            "sales": cash_n + acc_n,
            "sales_total": cash_total + acc_total,
            # served on a monthly use type: counted, not money
            "plan_meals": plan_n,
            "cash_sales": cash_total,
            "account_sales": acc_total,
            "topups": topups,
            "refunds": refunds,
            "cash_in_hand": cash_total + cash_topups - cash_refunds,
            "held": held,
            "owing": owing,
            "accounts": CanteenAccount.objects.filter(school_id=school_id, is_active=True).count(),
            "blocked": CanteenAccount.objects.filter(school_id=school_id, is_active=True, is_blocked=True).count(),
            "items": items.count(),
            "sold_out": items.filter(is_available=False).count(),
        })

    # ------------------------------------------------------------------ sales
    def sales(self, request, school_id):
        start, end = self._range(request)
        qs = CanteenSale.objects.filter(school_id=school_id, date__gte=start, date__lte=end)
        payment = self.int_or_none(request.query_params.get("payment"))
        if payment:
            qs = qs.filter(payment=payment)
        sales = list(qs.order_by("date", "sale_no")[:5000])
        names = buyer_names(sales)
        counts = dict(
            CanteenSaleLine.objects.filter(sale__in=sales)
            .values("sale_id")
            .annotate(n=Sum("qty"))
            .values_list("sale_id", "n")
        )
        rows = []
        for sale in sales:
            row = sale_json(sale, with_lines=False)
            row["name"], row["detail"] = names[sale.id]
            row["qty"] = counts.get(sale.id, 0)
            rows.append(row)
        active = [r for r in rows if r["is_active"]]
        return Response({
            "from": start, "to": end, "rows": rows,
            "total": sum((r["total"] for r in active), ZERO),
            "cash": sum((r["total"] for r in active if r["payment"] == PAY_CASH), ZERO),
            "account": sum((r["total"] for r in active if r["payment"] == PAY_ACCOUNT), ZERO),
            "plan_meals": len([r for r in active if r["payment"] == PAY_PLAN]),
            "count": len(active),
            "voided": len(rows) - len(active),
        })

    # ------------------------------------------------------------------ items
    def items(self, request, school_id):
        start, end = self._range(request)
        rows = list(
            CanteenSaleLine.objects.filter(
                sale__school_id=school_id, sale__is_active=True,
                sale__date__gte=start, sale__date__lte=end,
            )
            .values("item_id", "name")
            # Named apart from the columns they add up, so the plan count below
            # sums the line's own `qty`, not the total annotated over it.
            .annotate(
                qty_sum=Sum("qty"), amount_sum=Sum("amount"), sales=Count("sale_id", distinct=True),
                plan_qty=Sum("qty", filter=Q(sale__payment=PAY_PLAN)),
            )
            .order_by("-amount_sum")
        )
        for row in rows:
            row["qty"], row["amount"] = row.pop("qty_sum"), row.pop("amount_sum")
        # One row per item even if it was renamed in the range: grouped by the
        # item, named by its most recent name.
        merged = {}
        for row in rows:
            key = row["item_id"] or f"gone:{row['name']}"
            row["plan_qty"] = row["plan_qty"] or 0
            if key in merged:
                merged[key]["qty"] += row["qty"]
                merged[key]["amount"] += row["amount"]
                merged[key]["sales"] += row["sales"]
                merged[key]["plan_qty"] += row["plan_qty"]
            else:
                merged[key] = dict(row)
        out = sorted(merged.values(), key=lambda r: -r["amount"])
        return Response({
            "from": start, "to": end, "rows": out,
            "qty": sum((r["qty"] for r in out), 0),
            "total": sum((r["amount"] for r in out), ZERO),
        })

    # ---------------------------------------------------------------- cashier
    def cashier(self, request, school_id):
        """What each person at the counter or the desk took in, and the cash
        they should be holding: cash sales + cash top-ups − cash refunds."""
        start, end = self._range(request)
        people = defaultdict(lambda: {
            "cash_sales": ZERO, "account_sales": ZERO, "sales": 0, "plan_meals": 0,
            "cash_topups": ZERO, "other_topups": ZERO, "cash_refunds": ZERO,
        })
        for r in (
            CanteenSale.objects.filter(school_id=school_id, is_active=True, date__gte=start, date__lte=end)
            .values("entered_by", "payment")
            .annotate(n=Count("id"), total=Sum("total"))
        ):
            p = people[r["entered_by"] or "—"]
            if r["payment"] == PAY_PLAN:
                p["plan_meals"] += r["n"]
                continue
            p["sales"] += r["n"]
            p["cash_sales" if r["payment"] == PAY_CASH else "account_sales"] += r["total"] or ZERO
        for r in (
            CanteenTransaction.objects.filter(
                school_id=school_id, is_active=True, kind__in=(TXN_TOPUP, TXN_REFUND),
                date__gte=start, date__lte=end,
            )
            .values("entered_by", "kind", "mode")
            .annotate(total=Sum("amount"))
        ):
            p = people[r["entered_by"] or "—"]
            amount = r["total"] or ZERO
            if r["kind"] == TXN_TOPUP:
                p["cash_topups" if r["mode"] == MODE_CASH else "other_topups"] += amount
            elif r["mode"] == MODE_CASH:
                p["cash_refunds"] += -amount
        rows = []
        for name, p in sorted(people.items()):
            rows.append({
                "entered_by": name, **p,
                "cash_in_hand": p["cash_sales"] + p["cash_topups"] - p["cash_refunds"],
            })
        return Response({
            "from": start, "to": end, "rows": rows,
            "cash_in_hand": sum((r["cash_in_hand"] for r in rows), ZERO),
        })

    # --------------------------------------------------------------- postings
    def postings(self, request, school_id):
        """Monthly Posting, student by student: what each was charged, for
        which months, item by item. Withdrawn ones are listed, not counted."""
        start, end = self._range(request)
        txns = list(
            CanteenTransaction.objects.filter(
                school_id=school_id, kind=TXN_POSTING, date__gte=start, date__lte=end,
            ).select_related("account").order_by("date", "id")[:10000]
        )
        people = {
            r["id"]: r for r in Student.objects.filter(id__in={t.account.student_id for t in txns})
            .values("id", "first_name", "middle_name", "last_name", "roll_no", *CLASS_VALUES)
        }
        rows, by_item = [], defaultdict(lambda: ZERO)
        for t in txns:
            s = people.get(t.account.student_id, {})
            names = (t.details or {}).get("__titles") or {}
            lines = list(detail_rows(t.details))
            if t.is_active:
                for key, amount in lines:
                    by_item[names.get(key, "Item")] += amount
            rows.append({
                "id": t.id,
                "date": t.date,
                "months": ", ".join(MONTH_NAMES.get(m, str(m)) for m in (t.months or [])),
                "name": person_name(s),
                "detail": class_label(s),
                "roll_no": s.get("roll_no"),
                "items": ", ".join(f"{names.get(k, 'Item')} {v:,.2f}" for k, v in lines),
                "amount": -t.amount,
                "entered_by": t.entered_by,
                "is_active": t.is_active,
            })
        active = [r for r in rows if r["is_active"]]
        return Response({
            "from": start, "to": end, "rows": rows,
            "total": sum((r["amount"] for r in active), ZERO),
            "students": len({(r["name"], r["detail"]) for r in active}),
            "by_item": [{"name": k, "amount": v} for k, v in sorted(by_item.items())],
        })

    # ------------------------------------------------------------------- dues
    def dues(self, request, school_id):
        """Who owes the canteen what, item by item — the same arithmetic the
        collect screen uses (methods/ledger.py). `class_key` narrows it."""
        accounts = list(CanteenAccount.objects.filter(school_id=school_id, is_active=True))
        books = statements(school_id, [a.id for a in accounts])
        people = {
            r["id"]: r for r in Student.objects.filter(id__in={a.student_id for a in accounts if a.student_id})
            .values("id", "first_name", "middle_name", "last_name", "roll_no", *CLASS_VALUES, *KEY_VALUES)
        }
        wanted = (request.query_params.get("class_key") or "").strip()
        with_app = set(reachable([a.student_id for a in accounts if a.student_id]))
        rows, by_item = [], defaultdict(lambda: ZERO)
        for a in accounts:
            book = books[a.id]
            if not book["items"] and not book["advance"]:
                continue
            if a.student_id:
                s = people.get(a.student_id, {})
                if wanted and class_key(s) != wanted:
                    continue
                name, detail, roll = person_name(s), class_label(s), s.get("roll_no")
            else:
                if wanted:
                    continue
                _, _, name, detail = account_owner(a)
                roll = None
            for r in book["items"]:
                by_item[r["name"]] += r["due"]
            rows.append({
                "account": a.id,
                "student": a.student_id,
                "name": name,
                "detail": detail,
                "roll_no": roll,
                # for the printed bill: every item, charged / paid / due
                "lines": [{"name": r["name"], "charged": r["charged"], "paid": r["paid"], "due": r["due"]}
                          for r in book["items"] if r["charged"] or r["due"]],
                "has_app": a.student_id in with_app,
                "last_reminded": a.last_reminded,
                "items": ", ".join(f"{r['name']} {r['due']:,.2f}" for r in book["items"] if r["due"]),
                "charged": sum((r["charged"] for r in book["items"]), ZERO),
                "paid": sum((r["paid"] for r in book["items"]), ZERO),
                "due": book["due"],
                "advance": book["advance"],
            })
        rows.sort(key=lambda r: (r["detail"], r["name"].lower()))
        return Response({
            "rows": rows,
            "with_app": len([r for r in rows if r["due"] > 0 and r["has_app"]]),
            "today": self.today(),
            "due": sum((r["due"] for r in rows), ZERO),
            "advance": sum((r["advance"] for r in rows), ZERO),
            "students": len([r for r in rows if r["due"] > 0]),
            "by_item": [{"name": k, "due": v} for k, v in sorted(by_item.items()) if v],
        })

    # ------------------------------------------------------------------ meals
    def meals(self, request, school_id):
        """The kitchen's count for one day, class by class: how many are on a
        monthly use type that includes counter meals (expected), how many were
        served on it, and how many monthly items (Tiffin) were bought for cash
        or on due."""
        day = self.bs_date(request.query_params.get("date"))
        expected = defaultdict(lambda: defaultdict(int))
        labels, order = {}, {}
        enrolled = list(
            CanteenEnrollment.objects.filter(
                open_on(day), school_id=school_id, plan__kind=PLAN_MONTHLY, plan__counter_meals=True,
            ).select_related("plan")
        )
        people = {
            r["id"]: r for r in Student.objects.filter(
                id__in={e.student_id for e in enrolled}, is_active=True, status=1
            ).values("id", *KEY_VALUES)
        }
        for e in enrolled:
            s = people.get(e.student_id)
            if not s:
                continue
            key = class_key(s)
            labels[key], order[key] = key_label(s), sort_key(s)
            expected[key][e.plan.name] += 1
        served, bought = defaultdict(int), defaultdict(int)
        sales = list(
            CanteenSale.objects.filter(school_id=school_id, date=day, is_active=True)
            .values("id", "payment", "student_id", "buyer_type")
        )
        buyers = {
            r["id"]: r for r in Student.objects.filter(id__in={x["student_id"] for x in sales if x["student_id"]})
            .values("id", *KEY_VALUES)
        }
        monthly_qty = dict(
            CanteenSaleLine.objects.filter(sale_id__in=[x["id"] for x in sales], item__monthly=True)
            .values("sale_id").annotate(n=Sum("qty")).values_list("sale_id", "n")
        )
        for x in sales:
            s = buyers.get(x["student_id"])
            key = class_key(s) if s else "others"
            if s:
                labels[key], order[key] = key_label(s), sort_key(s)
            else:
                labels[key], order[key] = "Staff and walk-ins", (2, 0, "")
            if x["payment"] == PAY_PLAN:
                served[key] += 1
            elif monthly_qty.get(x["id"]):
                bought[key] += monthly_qty[x["id"]]
        rows = []
        for key in sorted(set(expected) | set(served) | set(bought), key=lambda k: order.get(k, (9, 0, ""))):
            on_plan = sum(expected[key].values())
            rows.append({
                "class_key": key,
                "class_label": labels.get(key, key),
                "on_plan": on_plan,
                "plans": ", ".join(f"{name} {n}" for name, n in sorted(expected[key].items())),
                "served": served[key],
                "not_yet": max(on_plan - served[key], 0),
                "bought": bought[key],
            })
        return Response({
            "date": day, "rows": rows,
            "on_plan": sum(r["on_plan"] for r in rows),
            "served": sum(r["served"] for r in rows),
            "bought": sum(r["bought"] for r in rows),
        })

    # --------------------------------------------------------------- receipts
    def receipts(self, request, school_id):
        start, end = self._range(request)
        txns = list(
            CanteenTransaction.objects.filter(
                school_id=school_id, kind__in=(TXN_TOPUP, TXN_REFUND),
                date__gte=start, date__lte=end,
            )
            .select_related("account")
            .order_by("date", "receipt_no")[:5000]
        )
        owners = {}
        rows = []
        for txn in txns:
            if txn.account_id not in owners:
                owners[txn.account_id] = account_owner(txn.account)
            _, _, name, detail = owners[txn.account_id]
            row = txn_json(txn)
            row["name"], row["detail"] = name, detail
            rows.append(row)
        active = [r for r in rows if r["is_active"]]
        return Response({
            "from": start, "to": end, "rows": rows,
            "topups": sum((r["amount"] for r in active if r["kind"] == TXN_TOPUP), ZERO),
            "refunds": -sum((r["amount"] for r in active if r["kind"] == TXN_REFUND), ZERO),
        })


class CanteenDuesReminderView(CanteenBaseView):
    """POST /canteen/dues-reminder {school, class_key?, accounts?: [...]}

    An app message to every family that owes the canteen (in that class, or the
    accounts named), each with their own amount item by item. Families without
    the app, and accounts already reminded today, are left out and counted."""

    pages_for = {"POST": (PAGE_REPORTS,)}

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        today = self.today()
        wanted = (request.data.get("class_key") or "").strip()
        named = [i for i in (self.int_or_none(x) for x in (request.data.get("accounts") or [])) if i]
        accounts = CanteenAccount.objects.filter(school_id=school_id, is_active=True, student__isnull=False)
        if named:
            accounts = accounts.filter(id__in=named)
        accounts = list(accounts)
        books = statements(school_id, [a.id for a in accounts])
        owing = [a for a in accounts if books[a.id]["due"] > 0]
        if wanted:
            keys = {
                r["id"]: class_key(r) for r in Student.objects.filter(id__in=[a.student_id for a in owing])
                .values("id", *KEY_VALUES)
            }
            owing = [a for a in owing if keys.get(a.student_id) == wanted]
        tokens = reachable([a.student_id for a in owing])
        already = [a for a in owing if a.last_reminded == today]
        messages = [
            (a.id, a.student_id, tokens[a.student_id], body_for(books[a.id]))
            for a in owing if a.student_id in tokens and a.last_reminded != today
        ]
        with transaction.atomic():
            send_reminders(school_id, messages, today)
        no_app = len([a for a in owing if a.student_id not in tokens])
        message = f"Reminder sent to {len(messages)} famil{'y' if len(messages) == 1 else 'ies'} on the app."
        if already:
            message += f" {len(already)} already reminded today."
        if no_app:
            message += f" {no_app} do not have the app — print their bills instead."
        return Response({"sent": len(messages), "already_today": len(already), "no_app": no_app,
                         "owing": len(owing), "message": message})
