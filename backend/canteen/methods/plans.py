"""Who is on which use type, and what that means at the counter.

Read by the counter (to serve a monthly-plan meal without charging, and to let a
"cash or due" student take it on due) and by Monthly Posting (who to post).
"""

from decimal import Decimal

from django.db.models import Q

from ..constants import PLAN_MONTHLY, PLAN_PER_USE
from ..models import CanteenEnrollment


def month_key(bs_year, month):
    return f"{int(bs_year):04d}-{int(month):02d}"


def open_on(date):
    """Enrolments running on a BS date: started on or before it, not ended
    before it."""
    return Q(is_active=True, plan__is_active=True, start_date__lte=date) & (
        Q(ended_on__isnull=True) | Q(ended_on__gte=date)
    )


def enrollments_by_student(school_id, student_ids, date):
    """{student id: [enrolment facts]} for the use types each is on that day."""
    out = {}
    ids = [i for i in (student_ids or []) if i]
    if not ids:
        return out
    rows = (
        CanteenEnrollment.objects.filter(open_on(date), school_id=school_id, student_id__in=ids)
        .select_related("plan")
        .order_by("plan__order", "plan__name")
    )
    for e in rows:
        out.setdefault(e.student_id, []).append({
            "enrollment": e.id,
            "plan": e.plan_id,
            "name": e.plan.name,
            "kind": e.plan.kind,
            "item": e.plan.item_id,
            "own_rate": e.rate,
            "counter_meals": e.plan.kind == PLAN_MONTHLY and e.plan.counter_meals,
            "due_limit": e.plan.due_limit if e.plan.kind == PLAN_PER_USE else Decimal("0"),
        })
    return out


def due_allowance(plans):
    """How far below zero a "cash or due" use type lets this student's account go."""
    return max((p["due_limit"] for p in plans or [] if p["kind"] == PLAN_PER_USE), default=Decimal("0"))


def counter_plan(plans):
    """The monthly use type that covers this student's counter meals, if any."""
    return next((p for p in plans or [] if p["counter_meals"]), None)
