"""Facilities, and the students ticked on them.

  GET/POST/PUT/DELETE  /canteen/facilities       ?school=
                       {name, remarks, counter_meals, classes: [{key, label, amount}]}
  GET   /canteen/facility-users  ?school=&plan=  every student of its classes, ticked or not
  POST  /canteen/facility-users  {plan, start_date, students: [{id, rate}]}   the ticks on screen

A FACILITY is whatever the school bills by the month: Day care, Tiffin monthly. It
is a CanteenPlan under the hood, so the posting, the dues and the receipts already
know it, and each one owns a title on the bill (a CanteenItem kept off the counter)
and an amount per class (CanteenClassRate). Changing an amount changes the next
posting only.

User Setup saves the ticks as they stand. A new tick starts the student on the
facility; a tick taken away stops them, or takes them off outright if nothing was
ever posted. Months already posted stay on the canteen account either way.
"""

from django.db import transaction
from django.db.models import Count
from rest_framework.response import Response

from main.models.Student import Student

from ..constants import PAGE_MONTHLY_POSTING, PAGE_USE_TYPES, PAGE_USER_SETUP, PLAN_MONTHLY
from ..methods.buyers import CLASS_VALUES, class_label, person_name
from ..methods.classes import KEY_VALUES, class_key, key_label, school_classes
from ..models import CanteenClassRate, CanteenEnrollment, CanteenItem, CanteenPlan
from .BaseViews import CanteenBaseView
from .PlanViews import class_rates, posted_charges, student_rows

MOST_AMOUNT = 1000000


def monthly_plans(school_id):
    return CanteenPlan.objects.filter(school_id=school_id, is_active=True, kind=PLAN_MONTHLY).select_related("item")


class CanteenFacilityView(CanteenBaseView):
    # Read by Facility Setup, User Setup (which facility to tick students on)
    # and Monthly Posting (which facilities to post).
    pages_for = {
        "GET": (PAGE_USE_TYPES, PAGE_USER_SETUP, PAGE_MONTHLY_POSTING),
        **{method: (PAGE_USE_TYPES,) for method in ("POST", "PUT", "DELETE")},
    }

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        plans = list(monthly_plans(school_id).order_by("order", "name"))
        students = {c["key"]: c["students"] for c in school_classes(school_id)}
        rates = {}
        for r in CanteenClassRate.objects.filter(
            school_id=school_id, is_active=True, monthly_rate__gt=0, item__in=[p.item_id for p in plans if p.item_id],
        ).order_by("id"):
            rates.setdefault(r.item_id, []).append(
                {"key": r.class_key, "label": r.class_label, "amount": r.monthly_rate, "students": students.get(r.class_key, 0)}
            )
        ticked = {
            r["plan_id"]: r["n"]
            for r in CanteenEnrollment.objects.filter(school_id=school_id, is_active=True, ended_on__isnull=True)
            .values("plan_id").annotate(n=Count("id"))
        }
        return Response([
            {
                "id": p.id,
                "name": p.name,
                "remarks": p.remarks,
                "counter_meals": p.counter_meals,
                "item": p.item_id,
                "classes": rates.get(p.item_id, []),
                "class_names": ", ".join(c["label"] for c in rates.get(p.item_id, [])),
                "users": ticked.get(p.id, 0),
            }
            for p in plans
        ])

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        return self._save(request, None)

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        plan_id = self.int_or_none(request.data.get("id"))
        if not plan_id:
            return self.RESPONSE__INVALID_REQUEST
        return self._save(request, plan_id)

    def _clean_classes(self, rows):
        clean = {}
        for row in rows if isinstance(rows, list) else []:
            if not isinstance(row, dict):
                continue
            key = (row.get("key") or "").strip()[:40]
            if key:
                clean[key] = (self.money(row.get("amount")), (row.get("label") or key).strip()[:80])
        return clean

    def _save(self, request, plan_id):
        school_id = self.school_id(request)
        data = request.data
        name = (data.get("name") or "").strip()
        if len(name) < 2 or len(name) > 60:
            return Response({"message": "A facility's name is 2 to 60 characters."}, status=400)
        classes = self._clean_classes(data.get("classes"))
        if not classes:
            return Response({"message": "Pick at least one class and its amount."}, status=400)
        for amount, label in classes.values():
            if amount <= 0 or amount >= MOST_AMOUNT:
                return Response({"message": f"{label}: enter an amount from 1 to 999,999."}, status=400)
        twin = CanteenPlan.objects.filter(school_id=school_id, is_active=True, name__iexact=name)
        plan = None
        if plan_id:
            twin = twin.exclude(id=plan_id)
            plan = monthly_plans(school_id).filter(id=plan_id).first()
            if not plan:
                return self.RESPONSE__NOT_FOUND
        if twin.exists():
            return Response({"message": f"There is already a facility called '{name}'."}, status=409)

        with transaction.atomic():
            item, refused = self._title_for(school_id, plan, name)
            if refused:
                return refused
            current = {r.class_key: r for r in CanteenClassRate.objects.select_for_update().filter(item=item, is_active=True)}
            if plan:
                refused = self._refuse_removing_classes(plan, set(current) - set(classes), current)
                if refused:
                    return refused
            values = {
                "name": name, "item": item, "kind": PLAN_MONTHLY,
                "remarks": self.text(data.get("remarks"), 120),
                "counter_meals": self.bool_of(data.get("counter_meals"), plan.counter_meals if plan else False),
            }
            if plan:
                for key, value in values.items():
                    setattr(plan, key, value)
                plan.save()
            else:
                plan = CanteenPlan.objects.create(school_id=school_id, **values)
            for key, (amount, label) in classes.items():
                row = current.get(key)
                if row:
                    if row.monthly_rate != amount or row.class_label != label:
                        row.monthly_rate, row.class_label = amount, label
                        row.save()
                else:
                    CanteenClassRate.objects.create(
                        school_id=school_id, item=item, class_key=key, class_label=label, monthly_rate=amount
                    )
            for key, row in current.items():
                if key not in classes:
                    row.is_active = False
                    row.save(update_fields=["is_active", "updated_at"])
        return Response({"id": plan.id, "message": f"{name} saved for {len(classes)} class(es)."})

    def _title_for(self, school_id, plan, name):
        """(the item this facility bills under, a refusal). A facility owns its
        title on the bill, so it follows the facility's name; one shared with the
        counter (an older Tiffin) keeps the name it is sold under."""
        same_name = CanteenItem.objects.filter(school_id=school_id, is_active=True, name__iexact=name)
        taken = CanteenPlan.objects.filter(school_id=school_id, is_active=True, item__in=same_name)
        if plan and plan.item_id and plan.item.is_active:
            item = plan.item
            if item.name != name and not item.sold_at_counter:
                if same_name.exclude(id=item.id).exists():
                    return None, Response({"message": f"A product is already called '{name}'. Pick another name."}, status=409)
                item.name = name
                item.save(update_fields=["name", "updated_at"])
            return item, None
        if taken.exclude(id=plan.id if plan else None).exists():
            return None, Response({"message": f"'{name}' is already billed by another facility. Pick another name."}, status=409)
        item = same_name.first()
        if item:
            if not item.monthly:
                item.monthly = True
                item.save(update_fields=["monthly", "updated_at"])
            return item, None
        return CanteenItem.objects.create(
            school_id=school_id, name=name, price=0, monthly=True, sold_at_counter=False, is_available=False
        ), None

    def _refuse_removing_classes(self, plan, removed, current):
        """A class cannot leave a facility while its students are ticked on it:
        they would silently stop being posted."""
        if not removed:
            return None
        ids = CanteenEnrollment.objects.filter(plan=plan, is_active=True, ended_on__isnull=True).values_list("student_id", flat=True)
        for s in student_rows(ids).values():
            key = class_key(s)
            if key in removed:
                return Response(
                    {"message": f"{current[key].class_label} still has students ticked on {plan.name}. "
                                "Untick them in User Setup first."},
                    status=400,
                )
        return None

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        plan = monthly_plans(school_id).filter(id=self.int_or_none(request.query_params.get("id"))).first()
        if not plan:
            return self.RESPONSE__NOT_FOUND
        on_it = CanteenEnrollment.objects.filter(plan=plan, is_active=True, ended_on__isnull=True).count()
        if on_it:
            return Response({"message": f"{on_it} student(s) are ticked on '{plan.name}'. Untick them in User Setup first."}, status=400)
        with transaction.atomic():
            plan.is_active = False
            plan.save(update_fields=["is_active", "updated_at"])
            item = plan.item
            if item and not item.sold_at_counter and not CanteenPlan.objects.filter(item=item, is_active=True).exists():
                item.is_active = False
                item.save(update_fields=["is_active", "updated_at"])
        return Response({"message": f"'{plan.name}' removed. Months already posted stay on the canteen accounts."})


class CanteenFacilityUsersView(CanteenBaseView):
    pages_for = {method: (PAGE_USER_SETUP,) for method in ("GET", "POST")}

    def _plan(self, school_id, plan_id):
        return monthly_plans(school_id).filter(id=self.int_or_none(plan_id), item__isnull=False).first()

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        plan = self._plan(school_id, request.query_params.get("plan"))
        if not plan:
            return self.RESPONSE__NOT_FOUND
        rates = class_rates(school_id, [plan.item_id])
        assigned = {key for (_, key), amount in rates.items() if amount and amount > 0}
        ticked = {
            e.student_id: e
            for e in CanteenEnrollment.objects.filter(plan=plan, is_active=True, ended_on__isnull=True)
        }
        rows = list(
            Student.objects.filter(class_info__school_id=school_id, is_active=True, status=1)
            .order_by("first_name", "last_name")
            .values("id", "first_name", "middle_name", "last_name", "roll_no", "status", *CLASS_VALUES, *KEY_VALUES)
        )
        rows = [r for r in rows if class_key(r) in assigned or r["id"] in ticked]
        # Someone ticked who has since left must still be visible to untick.
        have = {r["id"] for r in rows}
        rows += [r for i, r in student_rows(set(ticked) - have).items()]
        posted = {
            r["student_id"]: r["n"]
            for r in posted_charges().filter(plan=plan, student__in=[r["id"] for r in rows])
            .values("student_id").annotate(n=Count("id"))
        }
        students = []
        for s in rows:
            key = class_key(s)
            e = ticked.get(s["id"])
            students.append({
                "id": s["id"],
                "name": person_name(s),
                "detail": class_label(s),
                "class_key": key,
                "class_label": key_label(s),
                "roll_no": s.get("roll_no"),
                "class_amount": rates.get((plan.item_id, key)),
                "own_rate": e.rate if e else None,
                "ticked": bool(e),
                "since": e.start_date if e else None,
                "months_posted": posted.get(s["id"], 0),
                "outside": key not in assigned or s.get("status") != 1,
            })
        students.sort(key=lambda r: (r["class_label"], r["detail"], r["name"].lower()))
        return Response({"plan": plan.id, "name": plan.name, "students": students})

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        data = request.data
        plan = self._plan(school_id, data.get("plan"))
        if not plan:
            return self.RESPONSE__NOT_FOUND
        raw = data.get("students")
        if not isinstance(raw, list):
            return self.RESPONSE__INVALID_REQUEST
        wanted = {}
        for row in raw:
            student_id = self.int_or_none((row or {}).get("id")) if isinstance(row, dict) else None
            if not student_id:
                continue
            value = row.get("rate")
            rate = None if value in (None, "") else self.money(value)
            if rate is not None and (rate < 0 or rate >= MOST_AMOUNT):
                return Response({"message": "An own amount is from 0 to 999,999."}, status=400)
            wanted[student_id] = rate
        start = self.bs_date(data.get("start_date"))
        today = self.today()
        rates = class_rates(school_id, [plan.item_id])
        assigned = {key for (_, key), amount in rates.items() if amount and amount > 0}
        added = stopped = removed = changed = 0
        with transaction.atomic():
            ticked = {
                e.student_id: e
                for e in CanteenEnrollment.objects.select_for_update().filter(plan=plan, is_active=True, ended_on__isnull=True)
            }
            # Only a running student of a class this facility is set up for, so
            # nobody is put on it at no amount. Whoever is already on it stays.
            new_ids = set(wanted) - set(ticked)
            allowed = set()
            if new_ids:
                for s in Student.objects.filter(
                    id__in=new_ids, class_info__school_id=school_id, is_active=True, status=1
                ).values("id", *KEY_VALUES):
                    if class_key(s) in assigned:
                        allowed.add(s["id"])
            refused = len(new_ids - allowed)
            for student_id in allowed:
                CanteenEnrollment.objects.create(
                    school_id=school_id, plan=plan, student_id=student_id, rate=wanted[student_id], start_date=start,
                )
                added += 1
            for student_id, e in ticked.items():
                if student_id in wanted:
                    if e.rate != wanted[student_id]:
                        e.rate = wanted[student_id]
                        e.save(update_fields=["rate", "updated_at"])
                        changed += 1
                elif posted_charges().filter(plan=plan, student_id=student_id).exists():
                    e.ended_on = max(today, e.start_date)
                    e.save(update_fields=["ended_on", "updated_at"])
                    stopped += 1
                else:
                    e.is_active = False
                    e.save(update_fields=["is_active", "updated_at"])
                    removed += 1
        parts = [f"{n} {word}" for n, word in (
            (added, "added"), (changed, "own amount changed"), (stopped, "stopped"), (removed, "taken off"),
        ) if n]
        message = f"{plan.name}: {', '.join(parts)}." if parts else f"{plan.name}: nothing changed."
        if refused:
            message += f" {refused} skipped: not a running student of a class set up for it."
        return Response({"added": added, "changed": changed, "stopped": stopped, "removed": removed,
                         "skipped": refused, "message": message})
