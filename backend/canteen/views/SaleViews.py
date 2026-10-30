"""The counter: finding the buyer, ringing up a sale, voiding one.

  GET     /canteen/buyers   ?school=&card=          the student/staff on that card
  GET     /canteen/buyers   ?school=&q=[&type=]     by roll number or name
  GET     /canteen/sales    ?school=&id=            one sale, for the slip
  GET     /canteen/sales    ?school=[&date=]        a day's sales at the counter
  POST    /canteen/sales    ring up
  DELETE  /canteen/sales    ?school=&id=&remarks=   void

THE PRICE COMES FROM HERE, NEVER FROM THE CLIENT. The counter sends item ids
and quantities; what each costs is read from the item as it stands, and copied
onto the sale line. A browser tab left open since yesterday's price change
cannot sell at yesterday's price.

PAYING FROM AN ACCOUNT locks that account's row for the length of the sale, then
checks, in this order: blocked card; daily limit; balance plus credit limit.
Two counters charging the same child at the same instant therefore queue, and
the second sees what the first spent.
"""

import uuid

from django.db import IntegrityError, transaction
from django.db.models import F
from rest_framework.response import Response

from main.methods.nepaliDatetime import npt
from main.models.Staff import Staff
from main.models.Student import Student

from ..constants import (
    BUYER_CHOICES,
    BUYER_STAFF,
    BUYER_STUDENT,
    BUYER_WALKIN,
    MAX_LINES,
    MAX_QTY,
    PAGE_COUNTER,
    PAY_ACCOUNT,
    PAY_CASH,
    PAY_PLAN,
    PAYMENT_CHOICES,
    TXN_PURCHASE,
    label,
)
from ..methods.balances import balance, effective_limits, spent_on
from ..methods.buyers import (
    CLASS_VALUES,
    class_label,
    full_name_expr,
    describe_buyers,
    find_staff,
    find_students,
    get_or_open_account,
)
from ..methods.ledger import details_blob
from ..methods.money import exact
from ..methods.notify import tell_family
from ..methods.plans import counter_plan, due_allowance, enrollments_by_student
from ..methods.numbering import next_sale_no
from ..methods.settings import settings_for
from ..models import CanteenAccount, CanteenItem, CanteenSale, CanteenSaleLine, CanteenTransaction
from .BaseViews import CanteenBaseView

MAX_MINT_ATTEMPTS = 5


class Refused(Exception):
    """A sale the rules do not allow; carries the sentence the counter shows."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message, self.status = message, status


class CanteenBuyerView(CanteenBaseView):
    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        params = request.query_params
        settings = settings_for(school_id)
        today = self.today()
        card = (params.get("card") or "").strip()
        q = (params.get("q") or "").strip()
        kind = self.int_or_none(params.get("type"))
        if card:
            students = find_students(school_id, card=card, limit=2)
            staff = [] if students else find_staff(school_id, card=card, limit=2)
            buyers = describe_buyers(school_id, settings, today, students, staff)
            return Response({"buyers": buyers, "by_card": True})
        if len(q) < 1:
            return Response({"buyers": [], "by_card": False})
        students = find_students(school_id, q=q) if kind in (None, BUYER_STUDENT) else []
        staff = find_staff(school_id, q=q) if kind in (None, BUYER_STAFF) else []
        return Response(
            {"buyers": describe_buyers(school_id, settings, today, students, staff), "by_card": False}
        )


def sale_json(sale, with_lines=True):
    data = {
        "id": sale.id,
        "sale_no": sale.sale_no,
        "date": sale.date,
        "time": npt(sale.entered_at).strftime("%I:%M %p") if sale.entered_at else None,
        "buyer_type": sale.buyer_type,
        "buyer_type_name": label(BUYER_CHOICES, sale.buyer_type),
        "student": sale.student_id,
        "staff": sale.staff_id,
        "buyer_name": sale.buyer_name,
        "payment": sale.payment,
        "payment_name": (
            f"Plan · {(sale.extra_info or {}).get('plan_name', '')}".strip(" ·")
            if sale.payment == PAY_PLAN
            else label(PAYMENT_CHOICES, sale.payment)
        ),
        "plan_value": (sale.extra_info or {}).get("value") if sale.payment == PAY_PLAN else None,
        "total": sale.total,
        "entered_by": sale.entered_by,
        "remarks": sale.remarks,
        "is_active": sale.is_active,
        "void_reason": (sale.extra_info or {}).get("void_reason"),
        "economic_year": sale.economic_year_id,
    }
    if with_lines:
        data["lines"] = list(
            sale.lines.order_by("id").values("item", "name", "price", "qty", "amount")
        )
    return data


def buyer_names(sales):
    """{sale id: (name, detail)} for a page of sales, without a query per row."""
    full = full_name_expr()
    student_ids = {s.student_id for s in sales if s.student_id}
    staff_ids = {s.staff_id for s in sales if s.staff_id}
    students = {
        r["id"]: (r["name"], class_label(r))
        for r in Student.objects.filter(id__in=student_ids)
        .annotate(name=full)
        .values("id", "name", *CLASS_VALUES)
    }
    staff = {
        r["id"]: (r["name"], r["designation"] or "Staff")
        for r in Staff.objects.filter(id__in=staff_ids)
        .annotate(name=full, designation=F("role__role"))
        .values("id", "name", "designation")
    }
    out = {}
    for s in sales:
        if s.student_id:
            out[s.id] = students.get(s.student_id, ("—", ""))
        elif s.staff_id:
            out[s.id] = staff.get(s.staff_id, ("—", ""))
        else:
            out[s.id] = (s.buyer_name or "Walk-in", "")
    return out


class CanteenSaleView(CanteenBaseView):
    pages_for = {"POST": (PAGE_COUNTER,), "DELETE": (PAGE_COUNTER,)}

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        params = request.query_params
        sale_id = self.int_or_none(params.get("id"))
        if sale_id:
            sale = CanteenSale.objects.filter(id=sale_id, school_id=school_id).first()
            if not sale:
                return self.RESPONSE__NOT_FOUND
            data = sale_json(sale)
            name, detail = buyer_names([sale])[sale.id]
            data["name"], data["detail"] = name, detail
            purchase = sale.transactions.first()
            data["balance_after"] = (
                (purchase.extra_info or {}).get("balance_after") if purchase else None
            )
            return Response(data)

        date = self.bs_date(params.get("date"))
        sales = list(
            CanteenSale.objects.filter(school_id=school_id, date=date).order_by("-id")[:500]
        )
        names = buyer_names(sales)
        rows = []
        for sale in sales:
            row = sale_json(sale, with_lines=False)
            row["name"], row["detail"] = names[sale.id]
            rows.append(row)
        return Response({"date": date, "sales": rows})

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        data = request.data
        economic_year_id = self.economic_year(request, school_id)
        if not economic_year_id:
            return Response({"message": "This school has no economic year set."}, status=400)

        client_key = self.text(data.get("client_key"), 64)
        if client_key and len(client_key) < 8:
            client_key = None
        if client_key:
            existing = CanteenSale.objects.filter(school_id=school_id, client_key=client_key).first()
            if existing:
                # The same ring-up sent again (a retry, a double click that got
                # past the button). Hand back the sale it already made.
                return Response({**sale_json(existing), "duplicate": True,
                                 "message": f"Sale {existing.sale_no} was already saved."})

        settings = settings_for(school_id)
        buyer_type = self.int_or_none(data.get("buyer_type")) or BUYER_WALKIN
        if buyer_type not in dict(BUYER_CHOICES):
            return self.RESPONSE__INVALID_REQUEST
        payment = self.int_or_none(data.get("payment")) or PAY_CASH
        if payment not in dict(PAYMENT_CHOICES):
            return self.RESPONSE__INVALID_REQUEST
        buyer_id = self.int_or_none(data.get("buyer"))
        date = self.bs_date(data.get("date"))

        extra_info = {}
        try:
            lines, total = self._price_lines(school_id, data.get("lines"))
            self._check_payment(settings, buyer_type, payment, buyer_id)
            if buyer_type == BUYER_STUDENT and not find_students(school_id, ids=[buyer_id], limit=1):
                raise Refused("That student is not on this school's running list.", 404)
            if buyer_type == BUYER_STAFF and not find_staff(school_id, ids=[buyer_id], limit=1):
                raise Refused("That member of staff is not on this school's list.", 404)
            if payment == PAY_PLAN:
                # Covered by the month's canteen posting: served and counted, nothing
                # charged here. The line keeps the item's price so the register
                # shows what was given out; the money is 0.
                covered = counter_plan(
                    enrollments_by_student(school_id, [buyer_id], date).get(buyer_id, [])
                )
                if not covered:
                    raise Refused(
                        "This student is not on a monthly use type that covers counter meals. "
                        "Take cash or charge the account."
                    )
                extra_info = {"plan": covered["plan"], "plan_name": covered["name"], "value": str(total)}
                for line in lines:
                    line["amount"] = self.money(0)
                total = self.money(0)
        except Refused as refused:
            return Response({"message": refused.message}, status=refused.status)

        values = {
            "school_id": school_id,
            "economic_year_id": economic_year_id,
            "date": date,
            "buyer_type": buyer_type,
            "student_id": buyer_id if buyer_type == BUYER_STUDENT else None,
            "staff_id": buyer_id if buyer_type == BUYER_STAFF else None,
            "buyer_name": self.text(data.get("buyer_name"), 60) if buyer_type == BUYER_WALKIN else None,
            "payment": payment,
            "total": total,
            "entered_by": self.entered_by(request),
            "client_key": client_key or uuid.uuid4().hex,
            "remarks": self.text(data.get("remarks"), 120),
            "extra_info": extra_info,
        }

        sale, balance_after, account = None, None, None
        for _ in range(MAX_MINT_ATTEMPTS):
            try:
                with transaction.atomic():
                    if payment == PAY_ACCOUNT:
                        account = get_or_open_account(school_id, buyer_type, buyer_id)
                        # Lock FIRST (before the number), always in this order
                        # account -> settings, as every other writer here does.
                        account = CanteenAccount.objects.select_for_update().get(id=account.id)
                        balance_after = self._charge_check(account, settings, total, date)
                    number = next_sale_no(school_id, economic_year_id)
                    sale = CanteenSale.objects.create(sale_no=number, **values)
                    CanteenSaleLine.objects.bulk_create(
                        [CanteenSaleLine(sale=sale, **line) for line in lines]
                    )
                    if payment == PAY_ACCOUNT:
                        # Item-wise, like every charge on the canteen ledger:
                        # the dues then say "Samosa 50", not "a purchase".
                        by_item = {}
                        for line in lines:
                            by_item[line["item_id"]] = by_item.get(line["item_id"], exact(0)) + line["amount"]
                        CanteenTransaction.objects.create(
                            school_id=school_id,
                            economic_year_id=economic_year_id,
                            account=account,
                            kind=TXN_PURCHASE,
                            amount=-total,
                            date=date,
                            sale=sale,
                            details=details_blob(by_item, {str(l["item_id"]): l["name"] for l in lines}),
                            entered_by=values["entered_by"],
                            extra_info={"balance_after": str(balance_after)},
                        )
                        tell_family(settings, account, TXN_PURCHASE, total, balance_after)
                break
            except Refused as refused:
                return Response({"message": refused.message}, status=refused.status)
            except IntegrityError:
                sale = None
                twin = CanteenSale.objects.filter(
                    school_id=school_id, client_key=values["client_key"]
                ).first()
                if twin:
                    return Response({**sale_json(twin), "duplicate": True,
                                     "message": f"Sale {twin.sale_no} was already saved."})
                # Another counter took the number; try the next one.
        if not sale:
            return Response({"message": "Could not issue a sale number, please retry."}, status=409)

        out = sale_json(sale)
        out["balance_after"] = balance_after
        out["message"] = (
            f"Sale {sale.sale_no} — served on {extra_info.get('plan_name')}, nothing charged."
            if payment == PAY_PLAN
            else f"Sale {sale.sale_no} saved — Rs. {total:,.2f}."
        )
        return Response(out)

    # --- the rules -----------------------------------------------------------

    def _price_lines(self, school_id, raw_lines):
        if not isinstance(raw_lines, list) or not raw_lines:
            raise Refused("Add at least one item.")
        if len(raw_lines) > MAX_LINES:
            raise Refused(f"A sale holds at most {MAX_LINES} different items.")
        wanted = {}
        for raw in raw_lines:
            if not isinstance(raw, dict):
                raise Refused("A line was not understood.")
            item_id = self.int_or_none(raw.get("item"))
            qty = self.int_or_none(raw.get("qty"))
            if not item_id or not qty or qty < 1:
                raise Refused("Each item needs a quantity of at least 1.")
            wanted[item_id] = wanted.get(item_id, 0) + qty
        items = {
            i.id: i
            for i in CanteenItem.objects.filter(
                id__in=list(wanted), school_id=school_id, is_active=True
            )
        }
        lines, total = [], self.money(0)
        for item_id, qty in wanted.items():
            item = items.get(item_id)
            if not item:
                raise Refused("An item on this sale is no longer on the list. Refresh the counter.")
            if not item.sold_at_counter:
                raise Refused(f"{item.name} is billed monthly, not sold at the counter.")
            if not item.is_available:
                raise Refused(f"{item.name} is marked sold out.")
            if qty > MAX_QTY:
                raise Refused(f"{qty} × {item.name}? At most {MAX_QTY} of one item on a sale.")
            amount = exact(item.price * qty)
            lines.append({"item_id": item.id, "name": item.name, "price": item.price,
                          "qty": qty, "amount": amount})
            total += amount
        return lines, total

    def _check_payment(self, settings, buyer_type, payment, buyer_id):
        if payment == PAY_CASH and not settings.allow_cash:
            raise Refused("This canteen takes payment from the canteen account only.")
        if payment == PAY_ACCOUNT:
            if not settings.allow_account:
                raise Refused("This canteen takes cash only.")
            if buyer_type == BUYER_WALKIN:
                raise Refused("A walk-in has no canteen account. Take cash.")
        if payment == PAY_PLAN and buyer_type != BUYER_STUDENT:
            raise Refused("Only a student on a monthly use type is served on the plan.")
        if buyer_type in (BUYER_STUDENT, BUYER_STAFF) and not buyer_id:
            raise Refused("Pick the buyer first.")

    def _charge_check(self, account, settings, total, date):
        """With the account row locked. Returns the balance after the sale."""
        if account.is_blocked:
            raise Refused(
                "This card is blocked"
                + (f" ({account.block_reason})" if account.block_reason else "")
                + ". Take cash, or unblock it in Canteen > Accounts.",
                403,
            )
        due = 0
        if account.student_id:
            due = due_allowance(
                enrollments_by_student(account.school_id, [account.student_id], date).get(account.student_id, [])
            )
        daily, credit = effective_limits(account, settings, due)
        if daily > 0:
            spent = spent_on([account.id], date).get(account.id, 0)
            if spent + total > daily:
                left = max(daily - spent, 0)
                raise Refused(
                    f"Daily limit reached: Rs. {daily:,.2f} a day, Rs. {spent:,.2f} already spent today"
                    f" — Rs. {left:,.2f} left."
                )
        before = balance(account.id)
        after = before - total
        if after < -credit:
            if credit > 0:
                raise Refused(
                    f"Not enough on the account: balance Rs. {before:,.2f}, due allowed up to "
                    f"Rs. {credit:,.2f}. Top up or take cash."
                )
            raise Refused(
                f"Not enough on the account: balance Rs. {before:,.2f}. Top up or take cash."
            )
        return after

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        sale = CanteenSale.objects.filter(
            id=self.int_or_none(request.query_params.get("id")), school_id=school_id, is_active=True
        ).first()
        if not sale:
            return self.RESPONSE__NOT_FOUND
        reason = self.text(request.query_params.get("remarks"), 100) or "voided"
        with transaction.atomic():
            purchase = (
                CanteenTransaction.objects.select_for_update()
                .filter(sale=sale, is_active=True)
                .first()
            )
            if purchase:
                CanteenAccount.objects.select_for_update().filter(id=purchase.account_id).first()
                purchase.is_active = False
                purchase.extra_info = {**(purchase.extra_info or {}), "void_reason": reason}
                purchase.save(update_fields=["is_active", "extra_info", "updated_at"])
            sale.is_active = False
            sale.extra_info = {**(sale.extra_info or {}), "void_reason": reason}
            sale.save(update_fields=["is_active", "extra_info", "updated_at"])
        message = f"Sale {sale.sale_no} voided. It stays on the record and its number is not reused."
        if purchase:
            message += f" Rs. {sale.total:,.2f} is back on the account."
        return Response({"message": message})
