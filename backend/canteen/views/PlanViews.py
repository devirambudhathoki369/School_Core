"""Use types, their regular users, and the month's canteen posting.

  GET/POST/PUT/DELETE  /canteen/plans        use types (POST {standard: true} adds the usual three)
  GET   /canteen/enrollments   ?plan=                    a type's regular users
  GET   /canteen/enrollments   ?plan=&class_key=         a class's students, marked if already on it
                               (?class_info= takes one section instead)
  POST  /canteen/enrollments   {plan, students: [...], rate?, start_date?}
  PUT   /canteen/enrollments   {id, rate?, start_date?, remarks?}       rate "" = back to the class rate
  DELETE /canteen/enrollments  ?id=&ended_on=            stop (or take off, if never posted)
  GET   /canteen/monthly-posting  ?bs_year=&months=7,8[&plans=][&class_key=]   preview
  POST  /canteen/monthly-posting  {bs_year, months, plans?, class_key?, students?, date?}
  DELETE /canteen/monthly-posting ?txn=                  withdraw one student's posting

MONTHLY POSTING works like the fee ledger posting, inside the canteen: pick the
months (and the class, and the use types); every regular user is charged their
type's ITEM at their CLASS's rate (Items & Prices > class rates) for each month,
onto their canteen account, item by item. A month already posted for an
enrolment is skipped — posted means the canteen ledger entry is still active, so
a withdrawn posting can be posted again, never twice. A student's own rate (a
concession) replaces the class rate for them alone.
"""

from collections import defaultdict
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q
from rest_framework.response import Response

from main.methods.nepaliDatetime import ndt_today
from main.models.Student import Student

from ..constants import (
    BUYER_STUDENT,
    MONTH_NAMES,
    PAGE_MONTHLY_POSTING,
    PAGE_USE_TYPES,
    PLAN_KIND_CHOICES,
    PLAN_MONTHLY,
    PLAN_PER_USE,
    TXN_POSTING,
    TXN_TOPUP,
    label,
)
from ..methods.buyers import CLASS_VALUES, class_label, find_students, get_or_open_account, person_name
from ..methods.classes import KEY_VALUES, class_key, key_label
from ..methods.ledger import detail_rows, details_blob
from ..methods.money import exact
from ..methods.plans import month_key
from ..methods.settings import settings_for
from ..models import (
    CanteenAccount,
    CanteenClassRate,
    CanteenEnrollment,
    CanteenItem,
    CanteenPlan,
    CanteenPlanCharge,
    CanteenPosting,
    CanteenTransaction,
)
from .BaseViews import CanteenBaseView

# The usual three. The two monthly ones post an item of the same name, created
# (billed monthly, not sold over the counter) if the school has none.
STANDARD_TYPES = (
    {"name": "Day care", "kind": PLAN_MONTHLY, "item": "Day care", "order": 1},
    {"name": "Tiffin monthly", "kind": PLAN_MONTHLY, "item": "Tiffin", "order": 2},
    {"name": "Tiffin cash or due", "kind": PLAN_PER_USE, "item": None, "order": 3},
)
NEPALI_MONTHS = {
    1: "बैशाख", 2: "जेठ", 3: "असार", 4: "साउन", 5: "भदौ", 6: "असोज",
    7: "कार्तिक", 8: "मंसिर", 9: "पुष", 10: "माघ", 11: "फागुन", 12: "चैत",
}


class _Skip(Exception):
    """This student cannot be posted; carries the reason the office reads."""


def plan_json(plan, counts=None):
    return {
        "id": plan.id,
        "name": plan.name,
        "kind": plan.kind,
        "kind_name": label(PLAN_KIND_CHOICES, plan.kind),
        "item": plan.item_id,
        "item_name": plan.item.name if plan.item_id else None,
        "counter_meals": plan.counter_meals,
        "due_limit": plan.due_limit,
        "order": plan.order,
        "remarks": plan.remarks,
        "enrolled": (counts or {}).get(plan.id, 0),
    }


def open_today(today):
    return Q(ended_on__isnull=True) | Q(ended_on__gte=today)


def posted_charges():
    """Months on the canteen ledger: the charge and its ledger entry both active."""
    return CanteenPlanCharge.objects.filter(is_active=True, txn__is_active=True)


def class_rates(school_id, item_ids):
    """{(item id, class key): monthly rate} for the rates actually set."""
    return {
        (r["item_id"], r["class_key"]): r["monthly_rate"]
        for r in CanteenClassRate.objects.filter(
            school_id=school_id, item_id__in=list(item_ids), is_active=True
        ).values("item_id", "class_key", "monthly_rate")
    }


def student_rows(ids):
    return {
        r["id"]: r for r in Student.objects.filter(id__in=list(ids)).values(
            "id", "first_name", "middle_name", "last_name", "roll_no", "status", *CLASS_VALUES, *KEY_VALUES
        )
    }


class CanteenPlanView(CanteenBaseView):
    pages_for = {
        "GET": (PAGE_USE_TYPES, PAGE_MONTHLY_POSTING),
        **{method: (PAGE_USE_TYPES,) for method in ("POST", "PUT", "DELETE")},
    }

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        plans = list(
            CanteenPlan.objects.filter(school_id=school_id, is_active=True)
            .select_related("item").order_by("order", "name")
        )
        counts = {
            r["plan_id"]: r["n"]
            for r in CanteenEnrollment.objects.filter(open_today(self.today()), school_id=school_id, is_active=True)
            .values("plan_id").annotate(n=Count("id"))
        }
        return Response([plan_json(p, counts) for p in plans])

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        if self.bool_of(request.data.get("standard")):
            return self._standard(school_id)
        return self._save(request, None)

    def _standard(self, school_id):
        have = {n.lower() for n in CanteenPlan.objects.filter(school_id=school_id, is_active=True)
                .values_list("name", flat=True)}
        added = []
        with transaction.atomic():
            for spec in STANDARD_TYPES:
                if spec["name"].lower() in have:
                    continue
                item = None
                if spec["item"]:
                    item = CanteenItem.objects.filter(
                        school_id=school_id, is_active=True, name__iexact=spec["item"]
                    ).first()
                    if item and not item.monthly:
                        item.monthly = True
                        item.save(update_fields=["monthly", "updated_at"])
                    if not item:
                        item = CanteenItem.objects.create(
                            school_id=school_id, name=spec["item"], price=0, monthly=True,
                            sold_at_counter=False, order=spec["order"],
                        )
                CanteenPlan.objects.create(
                    school_id=school_id, name=spec["name"], kind=spec["kind"], item=item, order=spec["order"],
                )
                added.append(spec["name"])
        return Response({
            "added": added,
            "message": (f"Added {', '.join(added)}. Set the class rates of Day care and Tiffin in "
                        "Items & Prices before posting." if added else "The usual use types are already there."),
        })

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        plan_id = self.int_or_none(request.data.get("id"))
        if not plan_id:
            return self.RESPONSE__INVALID_REQUEST
        return self._save(request, plan_id)

    def _save(self, request, plan_id):
        school_id = self.school_id(request)
        data = request.data
        name = (data.get("name") or "").strip()
        if len(name) < 2 or len(name) > 60:
            return Response({"message": "A use type's name is 2 to 60 characters."}, status=400)
        kind = self.int_or_none(data.get("kind")) or PLAN_MONTHLY
        if kind not in dict(PLAN_KIND_CHOICES):
            return self.RESPONSE__INVALID_REQUEST
        item = None
        if kind == PLAN_MONTHLY:
            item = CanteenItem.objects.filter(
                id=self.int_or_none(data.get("item")), school_id=school_id, is_active=True
            ).first()
            if not item:
                return Response({"message": "Pick the item it posts every month (e.g. Tiffin, Day care)."}, status=400)
        due = self.money(data.get("due_limit"))
        if due < 0 or due >= 1000000:
            return Response({"message": "A due limit is from 0 to 999,999."}, status=400)
        values = {
            "name": name, "kind": kind, "item": item,
            "counter_meals": self.bool_of(data.get("counter_meals"), True) if kind == PLAN_MONTHLY else False,
            "due_limit": due if kind == PLAN_PER_USE else Decimal("0.00"),
            "order": self.int_or_none(data.get("order")) or 0,
            "remarks": self.text(data.get("remarks"), 120),
        }
        twin = CanteenPlan.objects.filter(school_id=school_id, is_active=True, name__iexact=name)
        if plan_id:
            twin = twin.exclude(id=plan_id)
        if twin.exists():
            return Response({"message": f"There is already a use type called '{name}'."}, status=409)
        plan = None
        if plan_id:
            plan = CanteenPlan.objects.filter(id=plan_id, school_id=school_id, is_active=True).first()
            if not plan:
                return self.RESPONSE__NOT_FOUND
            if plan.kind != kind and CanteenEnrollment.objects.filter(plan=plan, is_active=True).exists():
                return Response(
                    {"message": "Students are on this type, so it cannot change between monthly and "
                                "cash-or-due. Add a new type instead."},
                    status=400,
                )
        with transaction.atomic():
            if item and not item.monthly:
                item.monthly = True
                item.save(update_fields=["monthly", "updated_at"])
            if plan:
                for key, value in values.items():
                    setattr(plan, key, value)
                plan.save()
                return Response({"id": plan.id, "message": "Use type updated."})
            plan = CanteenPlan.objects.create(school_id=school_id, **values)
        return Response({"id": plan.id, "message": "Use type added!"})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        plan = CanteenPlan.objects.filter(
            id=self.int_or_none(request.query_params.get("id")), school_id=school_id, is_active=True
        ).first()
        if not plan:
            return self.RESPONSE__NOT_FOUND
        on_it = CanteenEnrollment.objects.filter(open_today(self.today()), plan=plan, is_active=True).count()
        if on_it:
            return Response({"message": f"{on_it} student(s) are still on '{plan.name}'. Stop them first."}, status=400)
        plan.is_active = False
        plan.save(update_fields=["is_active", "updated_at"])
        return Response({"message": f"'{plan.name}' removed. Months already posted stay on the canteen accounts."})


class CanteenEnrollmentView(CanteenBaseView):
    pages_for = {method: (PAGE_USE_TYPES,) for method in ("GET", "POST", "PUT", "DELETE")}

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        params = request.query_params
        plan = CanteenPlan.objects.filter(
            id=self.int_or_none(params.get("plan")), school_id=school_id, is_active=True
        ).select_related("item").first()
        if not plan:
            return self.RESPONSE__NOT_FOUND
        today = self.today()
        class_info = self.int_or_none(params.get("class_info"))
        key = (params.get("class_key") or "").strip()
        if class_info or key:
            on = set(CanteenEnrollment.objects.filter(open_today(today), plan=plan, is_active=True)
                     .values_list("student_id", flat=True))
            students = Student.objects.filter(class_info__school_id=school_id, is_active=True, status=1)
            if class_info:
                students = students.filter(class_info_id=class_info)
            elif key.startswith("g") and key[1:].isdigit():
                students = students.filter(class_info__grade=int(key[1:]))
            students = [
                s for s in students.order_by("first_name", "last_name").values(
                    "id", "first_name", "middle_name", "last_name", "roll_no", *CLASS_VALUES, *KEY_VALUES
                )
                # The class as the canteen keys it (methods/classes.py): the
                # grade with every section and stream of it, or the course and
                # its year — the same classes the rates and the posting use.
                if class_info or class_key(s) == key
            ]
            return Response([
                {"id": s["id"], "name": person_name(s), "detail": class_label(s), "roll_no": s["roll_no"],
                 "enrolled": s["id"] in on}
                for s in students
            ])
        rows = list(CanteenEnrollment.objects.filter(open_today(today), plan=plan, is_active=True).order_by("-id"))
        people = student_rows({e.student_id for e in rows})
        rates = class_rates(school_id, [plan.item_id]) if plan.item_id else {}
        posted = {
            r["enrollment_id"]: r["n"]
            for r in posted_charges().filter(enrollment__in=rows).values("enrollment_id").annotate(n=Count("id"))
        }
        out = []
        for e in rows:
            s = people.get(e.student_id, {})
            class_rate = rates.get((plan.item_id, class_key(s))) if s else None
            out.append({
                "id": e.id,
                "student": e.student_id,
                "name": person_name(s),
                "detail": class_label(s),
                "class_label": key_label(s) if s else "",
                "roll_no": s.get("roll_no"),
                "running": s.get("status") == 1,
                "own_rate": e.rate,
                "class_rate": class_rate,
                "rate": e.rate if e.rate is not None else class_rate,
                "start_date": e.start_date,
                "remarks": e.remarks,
                "months_posted": posted.get(e.id, 0),
            })
        out.sort(key=lambda r: (r["detail"], r["name"].lower()))
        return Response({"plan": plan_json(plan), "rows": out})

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        data = request.data
        plan = CanteenPlan.objects.filter(
            id=self.int_or_none(data.get("plan")), school_id=school_id, is_active=True
        ).first()
        if not plan:
            return self.RESPONSE__NOT_FOUND
        ids = data.get("students")
        if not isinstance(ids, list) or not ids:
            return Response({"message": "Tick the students to put on it."}, status=400)
        ids = list(dict.fromkeys(i for i in (self.int_or_none(x) for x in ids) if i))
        rate = None if data.get("rate") in (None, "") else self.money(data.get("rate"))
        if rate is not None and rate < 0:
            return Response({"message": "A rate cannot be below zero."}, status=400)
        start = self.bs_date(data.get("start_date"))
        running = {s["id"] for s in find_students(school_id, ids=ids, limit=len(ids) + 1)}
        added = skipped = 0
        with transaction.atomic():
            already = set(
                CanteenEnrollment.objects.select_for_update().filter(
                    plan=plan, is_active=True, ended_on__isnull=True, student_id__in=ids
                ).values_list("student_id", flat=True)
            )
            for student_id in ids:
                if student_id in already or student_id not in running:
                    skipped += 1
                    continue
                CanteenEnrollment.objects.create(
                    school_id=school_id, plan=plan, student_id=student_id, rate=rate, start_date=start,
                    remarks=self.text(data.get("remarks"), 120),
                )
                added += 1
        message = f"{added} student(s) put on {plan.name} from {start}"
        if plan.kind == PLAN_MONTHLY:
            message += " at their class rate" if rate is None else f" at their own rate of Rs. {rate:,.2f}"
        message += "." + (f" {skipped} skipped (already on it, or not running)." if skipped else "")
        return Response({"added": added, "skipped": skipped, "message": message})

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        data = request.data
        e = CanteenEnrollment.objects.filter(
            id=self.int_or_none(data.get("id")), school_id=school_id, is_active=True
        ).first()
        if not e:
            return self.RESPONSE__NOT_FOUND
        if "rate" in data:
            if data.get("rate") in (None, ""):
                e.rate = None            # back to the class rate
            else:
                rate = self.money(data.get("rate"))
                if rate < 0:
                    return Response({"message": "A rate cannot be below zero."}, status=400)
                e.rate = rate
        if data.get("start_date"):
            e.start_date = self.bs_date(data.get("start_date"))
        if "remarks" in data:
            e.remarks = self.text(data.get("remarks"), 120)
        e.save()
        return Response({"id": e.id, "message": "Saved. It applies from the next month posted."})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        e = CanteenEnrollment.objects.filter(
            id=self.int_or_none(request.query_params.get("id")), school_id=school_id, is_active=True
        ).first()
        if not e:
            return self.RESPONSE__NOT_FOUND
        if not posted_charges().filter(enrollment=e).exists():
            e.is_active = False
            e.save(update_fields=["is_active", "updated_at"])
            return Response({"message": "Taken off. Nothing had been posted for it."})
        ended = max(self.bs_date(request.query_params.get("ended_on")), e.start_date)
        e.ended_on = ended
        e.save(update_fields=["ended_on", "updated_at"])
        return Response({"message": f"Stopped on {ended}. Months already posted stay on the canteen account."})


class CanteenMonthlyPostingView(CanteenBaseView):
    pages_for = {method: (PAGE_MONTHLY_POSTING,) for method in ("GET", "POST", "DELETE")}

    def _months(self, raw):
        if isinstance(raw, str):
            raw = raw.split(",")
        return sorted({m for m in (self.int_or_none(x) for x in (raw or [])) if m and 1 <= m <= 12})

    def _period(self, source):
        today = ndt_today()
        year = self.int_or_none(source.get("bs_year")) or int(today[:4])
        months = self._months(source.get("months")) or [int(today[5:7])]
        if year < 2000 or year > 2200:
            return None
        return year, months

    def _candidates(self, school_id, year, months, plan_ids=None, key=None, students=None):
        """Every regular user on a monthly type in any of the months, with the
        months still to post, the rate and the amount."""
        qs = CanteenEnrollment.objects.filter(
            school_id=school_id, is_active=True, plan__is_active=True, plan__kind=PLAN_MONTHLY,
            plan__item__isnull=False,
        ).select_related("plan", "plan__item")
        if plan_ids:
            qs = qs.filter(plan_id__in=plan_ids)
        if students:
            qs = qs.filter(student_id__in=students)
        enrollments = list(qs)
        people = student_rows({e.student_id for e in enrollments})
        if key:
            enrollments = [e for e in enrollments if e.student_id in people and class_key(people[e.student_id]) == key]
        rates = class_rates(school_id, {e.plan.item_id for e in enrollments})
        posted = defaultdict(set)
        for c in posted_charges().filter(enrollment__in=enrollments, bs_year=year, month__in=months).values(
            "enrollment_id", "month"
        ):
            posted[c["enrollment_id"]].add(c["month"])
        out = []
        for e in enrollments:
            s = people.get(e.student_id, {})
            in_range = [m for m in months if e.start_date[:7] <= month_key(year, m)
                        and (not e.ended_on or e.ended_on[:7] >= month_key(year, m))]
            if not in_range:
                continue
            done = sorted(posted[e.id] & set(in_range))
            todo = [m for m in in_range if m not in done]
            ckey = class_key(s) if s else ""
            rate = e.rate if e.rate is not None else rates.get((e.plan.item_id, ckey))
            if s.get("status") != 1:
                state, why = "skip", "not a running student"
            elif not todo:
                state, why = "posted", ""
            elif not rate or rate <= 0:
                state, why = "skip", f"no {e.plan.item.name} rate for {key_label(s) if s else 'their class'}"
            else:
                state, why = "post", ""
            out.append({
                "enrollment": e.id,
                "student": e.student_id,
                "name": person_name(s),
                "detail": class_label(s),
                "class_key": ckey,
                "class_label": key_label(s) if s else "",
                "roll_no": s.get("roll_no"),
                "plan": e.plan_id,
                "plan_name": e.plan.name,
                "item": e.plan.item_id,
                "item_name": e.plan.item.name,
                "rate": exact(rate or 0),
                "own_rate": e.rate is not None,
                "months_todo": todo if state == "post" else [],
                "months_posted": done,
                "amount": exact(rate * len(todo)) if state == "post" else exact(0),
                "state": state,
                "why": why,
            })
        out.sort(key=lambda r: (r["detail"], r["name"].lower(), r["plan_name"]))
        return out

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        period = self._period(request.query_params)
        if not period:
            return Response({"message": "Pick the year and months."}, status=400)
        year, months = period
        plan_ids = [i for i in (self.int_or_none(x) for x in (request.query_params.get("plans") or "").split(",")) if i]
        rows = self._candidates(school_id, year, months, plan_ids, request.query_params.get("class_key") or None)
        to_post = [r for r in rows if r["state"] == "post"]
        # what is already posted for these months, so one can be withdrawn
        postings = list(
            CanteenTransaction.objects.filter(
                school_id=school_id, kind=TXN_POSTING, is_active=True,
                plan_charges__bs_year=year, plan_charges__month__in=months,
            ).distinct().select_related("account").order_by("-id")[:1000]
        )
        people = student_rows({t.account.student_id for t in postings})
        posted = []
        for t in postings:
            s = people.get(t.account.student_id, {})
            names = (t.details or {}).get("__titles") or {}
            posted.append({
                "txn": t.id,
                "name": person_name(s),
                "detail": class_label(s),
                "months": [MONTH_NAMES[m] for m in (t.months or [])],
                "items": ", ".join(f"{names.get(k, 'Item')} {v:,.2f}" for k, v in detail_rows(t.details)),
                "amount": -t.amount,
                "date": t.date,
                "entered_by": t.entered_by,
            })
        return Response({
            "bs_year": year,
            "months": months,
            "month_names": [MONTH_NAMES[m] for m in months],
            "rows": rows,
            "to_post": len({r["student"] for r in to_post}),
            "to_post_total": sum((r["amount"] for r in to_post), exact(0)),
            "posted": posted,
        })

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        data = request.data
        period = self._period(data)
        if not period:
            return Response({"message": "Pick the year and months."}, status=400)
        year, months = period
        economic_year_id = self.economic_year(request, school_id)
        if not economic_year_id:
            return Response({"message": "This school has no economic year set."}, status=400)
        plan_ids = [i for i in (self.int_or_none(x) for x in (data.get("plans") or [])) if i]
        students = [i for i in (self.int_or_none(x) for x in (data.get("students") or [])) if i] or None
        key = data.get("class_key") or None
        date = self.bs_date(data.get("date"))
        entered_by = self.entered_by(request)

        by_student = defaultdict(list)
        for row in self._candidates(school_id, year, months, plan_ids, key, students):
            if row["state"] == "post":
                by_student[row["student"]].append(row)
        label_months = ", ".join(MONTH_NAMES[m] for m in months)
        if not by_student:
            return Response({"posted": [], "skipped": [], "total": exact(0),
                             "message": f"Nothing to post for {label_months} {year} — everyone picked is already posted."})
        first = next(iter(by_student.values()))[0]
        run = CanteenPosting.objects.create(
            school_id=school_id, economic_year_id=economic_year_id, bs_year=year, months=months, date=date,
            class_key=key, class_label=first["class_label"] if key else None, plans=plan_ids, entered_by=entered_by,
        )
        posted, skipped = [], []
        for student_id, rows in by_student.items():
            try:
                posted.append(self._post_one(school_id, student_id, rows, year, date, economic_year_id, entered_by, run))
            except _Skip as skip:
                skipped.append({"student": student_id, "reason": str(skip)})
        if not posted:
            run.is_active = False
            run.save(update_fields=["is_active", "updated_at"])
        total = sum((p["amount"] for p in posted), exact(0))
        if posted and settings_for(school_id).notify_parents:
            self._tell(school_id, [p["student"] for p in posted], months)
        message = f"{len(posted)} student(s) posted for {label_months} {year} — Rs. {total:,.2f} on canteen accounts."
        if skipped:
            message += f" {len(skipped)} skipped."
        return Response({"posted": posted, "skipped": skipped, "total": total, "message": message})

    def _post_one(self, school_id, student_id, rows, year, date, economic_year_id, entered_by, run):
        with transaction.atomic():
            # Lock the enrolments and look again: two office screens posting at
            # once queue here, and the second finds the months posted.
            locked = {e.id: e for e in CanteenEnrollment.objects.select_for_update().filter(
                id__in=[r["enrollment"] for r in rows], is_active=True)}
            already = defaultdict(set)
            for c in posted_charges().filter(enrollment_id__in=list(locked), bs_year=year).values("enrollment_id", "month"):
                already[c["enrollment_id"]].add(c["month"])
            charges, amounts, names, months = [], defaultdict(Decimal), {}, set()
            for r in rows:
                if r["enrollment"] not in locked:
                    continue
                for m in r["months_todo"]:
                    if m in already[r["enrollment"]]:
                        continue
                    amount = exact(r["rate"])
                    charges.append((r, m, amount))
                    amounts[r["item"]] += amount
                    names[str(r["item"])] = r["item_name"]
                    months.add(m)
            if not charges:
                raise _Skip("already posted")
            account = get_or_open_account(school_id, BUYER_STUDENT, student_id)
            if not account:
                raise _Skip("is not a running student of this school")
            total = sum(amounts.values(), exact(0))
            types = ", ".join(dict.fromkeys(r["plan_name"] for r, _, _ in charges))
            txn = CanteenTransaction.objects.create(
                school_id=school_id, economic_year_id=economic_year_id, account=account, kind=TXN_POSTING,
                amount=-total, date=date, details=details_blob(amounts, names), months=sorted(months),
                posting=run, entered_by=entered_by,
                remarks=f"{types} — {', '.join(MONTH_NAMES[m] for m in sorted(months))} {year}"[:120],
            )
            CanteenPlanCharge.objects.bulk_create([
                CanteenPlanCharge(
                    school_id=school_id, enrollment=locked[r["enrollment"]], plan_id=r["plan"], item_id=r["item"],
                    student_id=student_id, txn=txn, bs_year=year, month=m, amount=amount,
                )
                for r, m, amount in charges
            ])
        return {"student": student_id, "amount": total, "txn": txn.id}

    def _tell(self, school_id, student_ids, months):
        def send():
            try:
                from main.methods.push import notify_students

                notify_students(
                    school_id, student_ids, "क्यान्टिन",
                    f"{', '.join(NEPALI_MONTHS[m] for m in months)} महिनाको क्यान्टिन शुल्क तपाईंको "
                    "क्यान्टिन खातामा थपियो।",
                    "canteen",
                )
            except Exception:
                pass

        transaction.on_commit(send)

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        txn = CanteenTransaction.objects.filter(
            id=self.int_or_none(request.query_params.get("txn")), school_id=school_id,
            kind=TXN_POSTING, is_active=True,
        ).first()
        if not txn:
            return self.RESPONSE__NOT_FOUND
        items = {k for k, _ in detail_rows(txn.details)}
        with transaction.atomic():
            CanteenAccount.objects.select_for_update().filter(id=txn.account_id).first()
            # A receipt that paid these items after this posting would be left
            # paying nothing. Void that receipt first, then withdraw.
            for pay in CanteenTransaction.objects.filter(
                account_id=txn.account_id, kind=TXN_TOPUP, is_active=True, id__gt=txn.id
            ):
                if items & {k for k, _ in detail_rows(pay.details)}:
                    return Response(
                        {"message": f"Receipt C-{pay.receipt_no} has paid for this posting. "
                                    "Void that receipt first, then withdraw the posting."},
                        status=400,
                    )
            txn.is_active = False
            txn.extra_info = {**(txn.extra_info or {}),
                              "void_reason": self.text(request.query_params.get("remarks"), 100) or "withdrawn"}
            txn.save(update_fields=["is_active", "extra_info", "updated_at"])
            CanteenPlanCharge.objects.filter(txn=txn).update(is_active=False)
        return Response({"message": f"Withdrawn: Rs. {-txn.amount:,.2f} taken off the canteen account. "
                                    "The months can be posted again."})
