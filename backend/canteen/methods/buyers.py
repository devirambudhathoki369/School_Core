"""Who is buying: finding a student or member of staff, and describing them.

The counter finds a buyer three ways — a card tapped on a USB reader (which
types the card number and Enter), a roll number, or part of a name. The card is
the same `rfid_card` already on the student or staff record for attendance;
nothing here talks to the attendance readers themselves.
"""

from django.db.models import CharField, F, Func, Q, Value
from django.db.models.functions import NullIf

from main.choices.Education import GRADE_CHOICES, SEMESTER_CHOICES, YEAR_CHOICES
from main.models.Staff import Staff
from main.models.Student import Student

from ..constants import BUYER_STAFF, BUYER_STUDENT
from ..models import CanteenAccount
from .balances import balances, effective_limits, spent_on
from .plans import counter_plan, due_allowance, enrollments_by_student

GRADES = dict(GRADE_CHOICES)
YEARS = dict(YEAR_CHOICES)
SEMESTERS = dict(SEMESTER_CHOICES)

STUDENT_RUNNING = 1
STAFF_EMPLOYED = 1

CLASS_VALUES = (
    "class_info__grade",
    "class_info__section__section",
    "class_info__course__course",
    "class_info__year",
    "class_info__semester",
    "class_info__name",
)


def class_label(row, prefix="class_info__"):
    """'Five A', 'BBS Second year', ... from the joined class columns."""
    grade = row.get(f"{prefix}grade")
    section = row.get(f"{prefix}section__section")
    if grade:
        name = str(GRADES.get(grade, "")).strip()
        name = name[:1].upper() + name[1:]
        return f"{name} {section}".strip() if section else name
    course = row.get(f"{prefix}course__course") or row.get(f"{prefix}name") or ""
    if row.get(f"{prefix}year"):
        course = f"{course} {YEARS.get(row[f'{prefix}year'], '')} year"
    elif row.get(f"{prefix}semester"):
        course = f"{course} {SEMESTERS.get(row[f'{prefix}semester'], '')} semester"
    if section:
        course = f"{course} {section}"
    return course.strip()


def full_name_expr():
    """The name as entered — first, middle (when there is one), last — the way
    every other screen in the product shows a student. CONCAT_WS skips the
    NULL a blank middle name becomes, so there is never a double space."""
    return Func(
        Value(" "), F("first_name"), NullIf(F("middle_name"), Value("")), F("last_name"),
        function="CONCAT_WS", output_field=CharField(),
    )


def person_name(row):
    """The same name, from a row that carries the three parts."""
    parts = (row.get("first_name"), row.get("middle_name"), row.get("last_name"))
    return " ".join(p.strip() for p in parts if p and p.strip()) or "—"


def find_students(school_id, q=None, card=None, ids=None, limit=20):
    qs = Student.objects.filter(
        class_info__school_id=school_id, is_active=True, status=STUDENT_RUNNING
    )
    if card:
        qs = qs.filter(rfid_card=card)
    elif ids is not None:
        qs = qs.filter(id__in=ids)
    elif q:
        words = q.split()
        cond = Q(roll_no__iexact=q)
        name_q = Q()
        for word in words:
            name_q &= (
                Q(first_name__icontains=word)
                | Q(middle_name__icontains=word)
                | Q(last_name__icontains=word)
            )
        qs = qs.filter(cond | name_q)
    else:
        return []
    return list(
        qs.annotate(name=full_name_expr(), guardian_contact=F("guardian_info__guardian_contact"))
        .order_by("first_name", "last_name")
        .values("id", "name", "roll_no", "rfid_card", "guardian_contact", *CLASS_VALUES)[:limit]
    )


def find_staff(school_id, q=None, card=None, ids=None, limit=10):
    qs = Staff.objects.filter(school_id=school_id, is_active=True, status=STAFF_EMPLOYED)
    if card:
        qs = qs.filter(rfid_card=card)
    elif ids is not None:
        qs = qs.filter(id__in=ids)
    elif q:
        name_q = Q()
        for word in q.split():
            name_q &= (
                Q(first_name__icontains=word)
                | Q(middle_name__icontains=word)
                | Q(last_name__icontains=word)
            )
        qs = qs.filter(name_q)
    else:
        return []
    return list(
        qs.annotate(name=full_name_expr(), designation=F("role__role"))
        .order_by("first_name", "last_name")
        .values("id", "name", "designation", "rfid_card", "primary_contact")[:limit]
    )


def accounts_by_buyer(school_id, student_ids=(), staff_ids=()):
    """({student id: account}, {staff id: account}) for the active accounts."""
    by_student, by_staff = {}, {}
    if student_ids:
        for acc in CanteenAccount.objects.filter(
            school_id=school_id, is_active=True, student_id__in=list(student_ids)
        ):
            by_student[acc.student_id] = acc
    if staff_ids:
        for acc in CanteenAccount.objects.filter(
            school_id=school_id, is_active=True, staff_id__in=list(staff_ids)
        ):
            by_staff[acc.staff_id] = acc
    return by_student, by_staff


def account_facts(account, settings, today, balance_map=None, spent_map=None, due=0):
    """What the counter needs to know about a buyer's account, as plain JSON.
    `due` is what a "cash or due" use type lets them owe (methods/plans)."""
    daily, credit = effective_limits(account, settings, due)
    if not account:
        return {
            "account": None, "balance": 0, "spent_today": 0, "daily_limit": daily,
            "credit_limit": credit, "available": credit, "is_blocked": False,
            "block_reason": None, "notes": None,
            "own_daily_limit": None, "own_credit_limit": None,
        }
    bal = (balance_map or balances([account.id])).get(account.id, 0)
    spent = (spent_map or spent_on([account.id], today)).get(account.id, 0)
    available = bal + credit
    if daily > 0:
        available = min(available, daily - spent)
    return {
        "account": account.id,
        "balance": bal,
        "spent_today": spent,
        "daily_limit": daily,
        "credit_limit": credit,
        "available": max(available, 0),
        "is_blocked": account.is_blocked,
        "block_reason": account.block_reason,
        "notes": account.notes,
        "own_daily_limit": account.daily_limit,
        "own_credit_limit": account.credit_limit,
    }


def describe_buyers(school_id, settings, today, students=(), staff=()):
    """Student and staff rows (from find_*) as one list of buyers, each with
    their account facts — two queries for all the balances, not one per row."""
    by_student, by_staff = accounts_by_buyer(
        school_id, [s["id"] for s in students], [s["id"] for s in staff]
    )
    ids = [a.id for a in (*by_student.values(), *by_staff.values())]
    bal, spent = balances(ids), spent_on(ids, today)
    plans = enrollments_by_student(school_id, [s["id"] for s in students], today)
    out = []
    for s in students:
        mine = plans.get(s["id"], [])
        covered = counter_plan(mine)
        out.append({
            "buyer_type": BUYER_STUDENT,
            "id": s["id"],
            "name": s["name"],
            "detail": class_label(s),
            "roll_no": s.get("roll_no"),
            "contact": s.get("guardian_contact"),
            "has_card": bool(s.get("rfid_card")),
            "plans": [{"plan": p["plan"], "name": p["name"], "kind": p["kind"]} for p in mine],
            "counter_plan": {"plan": covered["plan"], "name": covered["name"]} if covered else None,
            "due_allowed": due_allowance(mine),
            **account_facts(by_student.get(s["id"]), settings, today, bal, spent, due_allowance(mine)),
        })
    for s in staff:
        out.append({
            "buyer_type": BUYER_STAFF,
            "id": s["id"],
            "name": s["name"],
            "detail": s.get("designation") or "Staff",
            "roll_no": None,
            "contact": s.get("primary_contact"),
            "has_card": bool(s.get("rfid_card")),
            "plans": [],
            "counter_plan": None,
            "due_allowed": 0,
            **account_facts(by_staff.get(s["id"]), settings, today, bal, spent),
        })
    return out


def get_or_open_account(school_id, buyer_type, buyer_id):
    """The buyer's active account, opened on first use. None if the buyer is
    not a running student / employed member of staff of THIS school."""
    if buyer_type == BUYER_STUDENT:
        if not find_students(school_id, ids=[buyer_id], limit=1):
            return None
        acc, _ = CanteenAccount.objects.get_or_create(
            school_id=school_id, student_id=buyer_id, is_active=True
        )
        return acc
    if buyer_type == BUYER_STAFF:
        if not find_staff(school_id, ids=[buyer_id], limit=1):
            return None
        acc, _ = CanteenAccount.objects.get_or_create(
            school_id=school_id, staff_id=buyer_id, is_active=True
        )
        return acc
    return None


def account_owner(account):
    """(buyer_type, id, name, detail) of an account, for reports and slips."""
    if account.student_id:
        row = find_students(account.school_id, ids=[account.student_id], limit=1)
        if not row:
            # a student who has since left still owns their history
            row = list(
                Student.objects.filter(id=account.student_id)
                .annotate(name=full_name_expr())
                .values("id", "name", "roll_no", *CLASS_VALUES)[:1]
            )
        row = row[0] if row else {"name": "—"}
        return BUYER_STUDENT, account.student_id, row.get("name"), class_label(row)
    row = list(
        Staff.objects.filter(id=account.staff_id)
        .annotate(name=full_name_expr(), designation=F("role__role"))
        .values("name", "designation")[:1]
    )
    row = row[0] if row else {"name": "—"}
    return BUYER_STAFF, account.staff_id, row.get("name"), row.get("designation") or "Staff"
