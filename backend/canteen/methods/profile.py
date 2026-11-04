"""One person's canteen page: who they are, what was billed, what was paid, what
is due, and every transaction.

THE CANTEEN'S OWN BILLING, NOTHING ELSE. Everything here reads the canteen's own
tables. The school's fee ledger, invoices and fee receipts are never read, so a
fee can never show up here and a canteen bill can never show up there.

Dues come from ledger.statement, the same arithmetic the Dues report, Collect &
Receipt and the printed bill use, so this page cannot disagree with them:

    billed + refunded - paid - discount = due - advance = -(account balance)

Viewing writes nothing. A person who has never used the canteen gets an empty
page, and no account is opened for them.

A cash sale or a meal on a monthly plan is on the history but not on the bill: the
first was settled on the spot, the second is paid through the monthly posting.
"""

from django.db.models import F, Q

from main.methods.nepaliDatetime import npt
from main.models.Staff import Staff
from main.models.Student import Student

from ..constants import (
    BUYER_CHOICES,
    BUYER_STAFF,
    BUYER_STUDENT,
    CHARGE_KINDS,
    MODES,
    MONTH_NAMES,
    PAY_CASH,
    PAY_PLAN,
    PLAN_KIND_CHOICES,
    TXN_DISCOUNT,
    TXN_POSTING,
    TXN_PURCHASE,
    TXN_REFUND,
    TXN_TOPUP,
    label,
)
from ..models import CanteenClassRate, CanteenItem, CanteenSale
from .balances import balances
from .classes import KEY_VALUES, class_key, student_class_keys
from .buyers import (
    CLASS_VALUES,
    STAFF_EMPLOYED,
    STUDENT_RUNNING,
    account_facts,
    accounts_by_buyer,
    class_label,
    describe_buyers,
    find_staff,
    find_students,
    former_staff,
    former_students,
    full_name_expr,
)
from .ledger import TITLES, detail_rows, statement
from .money import exact
from .plans import due_allowance, enrollments_by_student

ZERO = exact(0)

# Which part of the page a row belongs to.
BILL, PAYMENT, DISCOUNT, COUNTER = "bill", "payment", "discount", "counter"

WHAT = {
    TXN_POSTING: "Monthly bill",
    TXN_PURCHASE: "Counter purchase on account",
    TXN_TOPUP: "Payment",
    TXN_REFUND: "Refund",
    TXN_DISCOUNT: "Discount",
}


def _without_contact(buyers):
    """Finding someone needs who they are, not how to reach their family."""
    return [{k: v for k, v in b.items() if k != "contact"} for b in buyers]


def _in_class(school_id, settings, today, wanted, q):
    """Every running student of one class, narrowed by a name or roll if typed."""
    rows = Student.objects.filter(class_info__school_id=school_id, is_active=True, status=STUDENT_RUNNING).values(
        "id", *KEY_VALUES
    )
    ids = [r["id"] for r in rows if class_key(r) == wanted]
    students = find_students(school_id, ids=ids, limit=len(ids) + 1)
    if q:
        needle = q.lower()
        students = [s for s in students if needle in (s["name"] or "").lower() or (s.get("roll_no") or "").lower() == needle]
    return _without_contact(describe_buyers(school_id, settings, today, students))


def find_people(school_id, settings, today, q="", card="", wanted_class=""):
    """The search box: a card on the reader, a roll number or part of a name, or
    a whole class. Finds people who have left too, while they still have a canteen
    account."""
    if wanted_class:
        return _in_class(school_id, settings, today, wanted_class, q)
    if card:
        students = find_students(school_id, card=card, limit=2)
        staff = [] if students else find_staff(school_id, card=card, limit=2)
        return _without_contact(describe_buyers(school_id, settings, today, students, staff))
    if not q:
        return []
    people = _without_contact(
        describe_buyers(school_id, settings, today, find_students(school_id, q=q), find_staff(school_id, q=q))
    )
    gone_students, gone_staff = former_students(school_id, q), former_staff(school_id, q)
    by_student, by_staff = accounts_by_buyer(
        school_id, [s["id"] for s in gone_students], [s["id"] for s in gone_staff]
    )
    held = balances([a.id for a in (*by_student.values(), *by_staff.values())])
    for row in gone_students:
        account = by_student.get(row["id"])
        people.append({
            "buyer_type": BUYER_STUDENT, "id": row["id"], "name": row["name"], "detail": class_label(row),
            "roll_no": row.get("roll_no"), "left": True,
            "account": account.id if account else None, "balance": held.get(account.id, ZERO) if account else ZERO,
        })
    for row in gone_staff:
        account = by_staff.get(row["id"])
        people.append({
            "buyer_type": BUYER_STAFF, "id": row["id"], "name": row["name"],
            "detail": row.get("designation") or "Staff", "roll_no": None, "left": True,
            "account": account.id if account else None, "balance": held.get(account.id, ZERO) if account else ZERO,
        })
    return people


def search_people(school_id, settings, today, student_q, staff_q=None):
    """The Payment page's search: students matching `student_q`, and staff matching
    `staff_q` when the search could mean them, each with their account facts. A
    student of any status can be found, so `left` says who is not running."""
    students = list(
        Student.objects.filter(student_q)
        .annotate(
            name=full_name_expr(),
            guardian_contact=F("guardian_info__guardian_contact"),
            father_name=F("guardian_info__father_name"),
        )
        .order_by("first_name", "last_name", "id")
        .values("id", "name", "roll_no", "rfid_card", "image", "status", "guardian_contact", "father_name", *CLASS_VALUES)
    )
    staff = []
    if staff_q is not None:
        staff = list(
            Staff.objects.filter(staff_q, school_id=school_id, is_active=True, status=STAFF_EMPLOYED)
            .annotate(name=full_name_expr(), designation=F("role__role"))
            .order_by("first_name", "last_name", "id")
            .values("id", "name", "designation", "rfid_card", "image", "primary_contact")
        )
    people = describe_buyers(school_id, settings, today, students, staff)
    extra = {s["id"]: s for s in students}
    for person in people:
        row = extra.get(person["id"]) if person["buyer_type"] == BUYER_STUDENT else None
        person["classname"] = person["detail"]
        person["guardian_contact"] = person.get("contact")
        person["father_name"] = row["father_name"] if row else None
        person["left"] = bool(row) and row["status"] != STUDENT_RUNNING
    return people


def _student(school_id, student_id):
    """A student on this school's books, or one holding a canteen account with it.
    Nobody else: this query is the tenant boundary for the page."""
    row = (
        Student.objects.filter(
            Q(class_info__school_id=school_id)
            | Q(canteen_accounts__school_id=school_id, canteen_accounts__is_active=True),
            id=student_id,
        )
        .annotate(
            name=full_name_expr(),
            guardian_named=F("guardian_info__guardian_name"),
            father_named=F("guardian_info__father_name"),
            guardian_phone=F("guardian_info__guardian_contact"),
        )
        .values("id", "name", "roll_no", "image", "rfid_card", "status", "is_active",
                "guardian_named", "father_named", "guardian_phone", *CLASS_VALUES)
        .first()
    )
    if not row:
        return None
    return {
        "buyer_type": BUYER_STUDENT,
        "id": row["id"],
        "name": row["name"],
        "detail": class_label(row),
        "roll_no": row["roll_no"],
        "image": row["image"] or None,
        "guardian": row["guardian_named"] or row["father_named"],
        "contact": row["guardian_phone"],
        "has_card": bool(row["rfid_card"]),
        "left": not (row["is_active"] and row["status"] == STUDENT_RUNNING),
    }


def _staff(school_id, staff_id):
    row = (
        Staff.objects.filter(school_id=school_id, id=staff_id)
        .annotate(name=full_name_expr(), designation=F("role__role"))
        .values("id", "name", "designation", "image", "rfid_card", "status", "is_active", "primary_contact")
        .first()
    )
    if not row:
        return None
    return {
        "buyer_type": BUYER_STAFF,
        "id": row["id"],
        "name": row["name"],
        "detail": row["designation"] or "Staff",
        "roll_no": None,
        "image": row["image"] or None,
        "guardian": None,
        "contact": row["primary_contact"],
        "has_card": bool(row["rfid_card"]),
        "left": not (row["is_active"] and row["status"] == STAFF_EMPLOYED),
    }


def person_of(school_id, buyer_type, buyer_id):
    return _student(school_id, buyer_id) if buyer_type == BUYER_STUDENT else _staff(school_id, buyer_id)


def _rates(school_id, buyer_id, plans):
    """{item id: the rate that applies}: a facility's amount for this student, or
    a product's price. What the Rate column of the payment screen shows."""
    rates = {str(i): p for i, p in CanteenItem.objects.filter(school_id=school_id, price__gt=0).values_list("id", "price")}
    keys = student_class_keys(school_id, [buyer_id]).get(buyer_id)
    if keys:
        for item_id, amount in CanteenClassRate.objects.filter(
            school_id=school_id, is_active=True, class_key=keys[0], item_id__in=[p["item"] for p in plans if p["item"]],
        ).values_list("item_id", "monthly_rate"):
            rates[str(item_id)] = amount
    for p in plans:
        if p["item"] and p["own_rate"] is not None:
            rates[str(p["item"])] = p["own_rate"]
    return rates


def _time_of(row):
    return npt(row.entered_at).strftime("%I:%M %p") if row.entered_at else None


def _txn_row(txn, running, sale):
    charge = txn.kind in CHARGE_KINDS
    extra = txn.extra_info or {}
    if txn.kind == TXN_PURCHASE and sale:
        lines = [{"name": l.name, "qty": l.qty, "amount": l.amount} for l in sale.lines.all()]
    else:
        titles = (txn.details or {}).get(TITLES) or {}
        lines = [
            {"name": titles.get(key, "Item"), "qty": None, "amount": amount}
            for key, amount in detail_rows(txn.details)
        ]
    named = sum((line["amount"] for line in lines), ZERO)
    reference = ""
    if txn.receipt_no:
        reference = f"C-{txn.receipt_no}"
    elif extra.get("receipt_no"):
        reference = f"C-{extra['receipt_no']}"
    elif sale:
        reference = f"Sale {sale.sale_no}"
    return {
        "id": f"t{txn.id}",
        "group": BILL if charge else DISCOUNT if txn.kind == TXN_DISCOUNT else PAYMENT,
        "kind": txn.kind,
        "what": WHAT.get(txn.kind, "Transaction"),
        "reference": reference,
        "date": txn.date,
        "time": _time_of(txn),
        "lines": lines,
        "months": [MONTH_NAMES.get(m, m) for m in (txn.months or [])],
        "bs_year": txn.posting.bs_year if txn.posting_id else None,
        "mode_name": label(MODES, txn.mode) if txn.kind in (TXN_TOPUP, TXN_REFUND) else None,
        "discount": (extra.get("discount") or {}).get("amount"),
        # A payment that named no item, or more than it named, keeps the rest
        # on the account.
        "advance": txn.amount - named if txn.kind == TXN_TOPUP else None,
        "charged": -txn.amount if charge else None,
        "paid": None if charge else txn.amount,
        "cash": None,
        "running": running,
        "entered_by": txn.entered_by,
        "remarks": txn.remarks,
        "is_active": txn.is_active,
        "void_reason": extra.get("void_reason"),
        "receipt": txn.id if txn.kind in (TXN_TOPUP, TXN_REFUND) else None,
    }


def _sale_row(sale, running):
    plan = sale.payment == PAY_PLAN
    return {
        "id": f"s{sale.id}",
        "group": COUNTER,
        "kind": None,
        "what": "Meal on monthly plan" if plan else "Cash purchase",
        "reference": f"Sale {sale.sale_no}",
        "date": sale.date,
        "time": _time_of(sale),
        "lines": [{"name": l.name, "qty": l.qty, "amount": l.amount} for l in sale.lines.all()],
        "months": [],
        "bs_year": None,
        "mode_name": None if plan else "cash",
        "discount": None,
        "advance": None,
        "charged": None,
        "paid": None,
        "cash": None if plan else sale.total,
        "running": running,
        "entered_by": sale.entered_by,
        "remarks": sale.remarks,
        "is_active": sale.is_active,
        "void_reason": (sale.extra_info or {}).get("void_reason"),
        "receipt": None,
    }


def _history(account, sales):
    """Every row, newest first, in the order they were entered: the running balance
    only makes sense in that order (a receipt can be dated a day back)."""
    txns = list(account.transactions.select_related("posting").order_by("id")) if account else []
    sale_by_id = {s.id: s for s in sales}
    dated, running = [], ZERO
    for txn in txns:
        if txn.is_active:
            running += txn.amount
        dated.append((txn.entered_at, 1, txn.id, txn, running))
    for sale in sales:
        if sale.payment in (PAY_CASH, PAY_PLAN):
            dated.append((sale.entered_at, 0, sale.id, sale, None))
    dated.sort(key=lambda d: d[:3])

    rows, running = [], ZERO
    for _, is_txn, _, record, after in dated:
        if is_txn:
            running = after
            rows.append(_txn_row(record, after, sale_by_id.get(record.sale_id)))
        else:
            rows.append(_sale_row(record, running))
    rows.reverse()
    return rows, txns


def profile_of(school_id, settings, today, buyer_type, buyer_id):
    """The whole page, or None when this person is not this school's."""
    person = person_of(school_id, buyer_type, buyer_id)
    if not person:
        return None
    person["buyer_type_name"] = label(BUYER_CHOICES, buyer_type)

    by_student, by_staff = accounts_by_buyer(
        school_id,
        [buyer_id] if buyer_type == BUYER_STUDENT else (),
        [buyer_id] if buyer_type == BUYER_STAFF else (),
    )
    account = by_student.get(buyer_id) or by_staff.get(buyer_id)

    plans = []
    if buyer_type == BUYER_STUDENT:
        plans = enrollments_by_student(school_id, [buyer_id], today).get(buyer_id, [])

    who = {"student_id": buyer_id} if buyer_type == BUYER_STUDENT else {"staff_id": buyer_id}
    sales = list(CanteenSale.objects.filter(school_id=school_id, **who).prefetch_related("lines").order_by("id"))
    history, txns = _history(account, sales)

    ledger = (
        statement(school_id, account.id)
        if account
        else {"items": [], "advance": ZERO, "balance": ZERO, "due": ZERO}
    )
    live_txns = [t for t in txns if t.is_active]
    live_sales = [s for s in sales if s.is_active]
    cash_sales = [s for s in live_sales if s.payment == PAY_CASH]
    rates = _rates(school_id, buyer_id, plans) if buyer_type == BUYER_STUDENT else {}

    return {
        **person,
        **account_facts(account, settings, today, due=due_allowance(plans)),
        "today": today,
        "plans": [{"name": p["name"], "kind": p["kind"], "kind_name": label(PLAN_KIND_CHOICES, p["kind"])} for p in plans],
        "summary": {
            "billed": sum((r["charged"] for r in ledger["items"]), ZERO),
            "paid": sum((t.amount for t in live_txns if t.kind == TXN_TOPUP), ZERO),
            "refunded": -sum((t.amount for t in live_txns if t.kind == TXN_REFUND), ZERO),
            "discount": sum((t.amount for t in live_txns if t.kind == TXN_DISCOUNT), ZERO),
            "due": ledger["due"],
            "advance": ledger["advance"],
            "balance": ledger["balance"],
            "cash_at_counter": sum((s.total for s in cash_sales), ZERO),
            "cash_sales": len(cash_sales),
            "plan_meals": sum(1 for s in live_sales if s.payment == PAY_PLAN),
        },
        # item by item: charged - paid - from_advance = due (`paid` includes a discount)
        "items": [
            {
                "item": r["item"],
                "name": r["name"],
                "charged": r["charged"],
                "paid": r["paid"],
                "discount": r["discount"],
                "from_advance": r["raw_due"] - r["due"],
                "raw_due": r["raw_due"],
                "due": r["due"],
                "rate": rates.get(r["item"]),
            }
            for r in ledger["items"]
        ],
        "history": history,
    }
