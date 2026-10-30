"""The canteen's settings, and what it sells.

  GET/PUT              /canteen/settings     ?school=
  GET/POST/PUT/DELETE  /canteen/categories   ?school=
  GET/POST/PUT/DELETE  /canteen/items        ?school=[&available=1][&monthly=1]
  GET/PUT              /canteen/class-rates  ?school=&item=   a monthly item's rate for each class

Removing an item or a category is a soft delete. A sale line keeps the item's
name and price as they were when it was sold, so history never depends on the
item still being on the list.
"""

from django.db import transaction
from django.db.models import Count
from rest_framework.response import Response

from ..constants import FOOD_CHOICES, PAGE_ITEMS, PAGE_SETUP, RUN_BY_CHOICES, label
from ..methods.settings import settings_for
from ..methods.classes import school_classes
from ..models import CanteenCategory, CanteenClassRate, CanteenItem
from .BaseViews import CanteenBaseView

SETTINGS_FIELDS = (
    "run_by", "allow_cash", "allow_account", "credit_limit", "daily_limit",
    "notify_parents", "low_balance", "slip_width", "slip_footer",
)


def settings_json(row):
    data = {field: getattr(row, field) for field in SETTINGS_FIELDS}
    data["run_by_name"] = label(RUN_BY_CHOICES, row.run_by)
    data["saved"] = bool(row.pk)
    return data


class CanteenSettingsView(CanteenBaseView):
    pages_for = {"PUT": (PAGE_SETUP,)}

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        return Response(settings_json(settings_for(self.school_id(request))))

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        data = request.data
        row = settings_for(school_id, create=True)
        run_by = self.int_or_none(data.get("run_by"))
        if run_by in dict(RUN_BY_CHOICES):
            row.run_by = run_by
        row.allow_cash = self.bool_of(data.get("allow_cash"), row.allow_cash)
        row.allow_account = self.bool_of(data.get("allow_account"), row.allow_account)
        if not row.allow_cash and not row.allow_account:
            return Response(
                {"message": "Allow at least one way to pay — cash or the canteen account."},
                status=400,
            )
        for field in ("credit_limit", "daily_limit", "low_balance"):
            if field in data:
                amount = self.money(data.get(field))
                if amount < 0:
                    return Response({"message": "Limits cannot be below zero."}, status=400)
                setattr(row, field, amount)
        row.notify_parents = self.bool_of(data.get("notify_parents"), row.notify_parents)
        width = self.int_or_none(data.get("slip_width"))
        if width in (0, 58, 80):
            row.slip_width = width
        if "slip_footer" in data:
            row.slip_footer = self.text(data.get("slip_footer"), 120)
        row.save()
        return Response({**settings_json(row), "message": "Canteen settings saved!"})


class CanteenCategoryView(CanteenBaseView):
    pages_for = {method: (PAGE_ITEMS,) for method in ("POST", "PUT", "DELETE")}

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        rows = list(
            CanteenCategory.objects.filter(school_id=school_id, is_active=True)
            .order_by("order", "name")
            .values("id", "name", "order")
        )
        counts = {
            r["category_id"]: r["n"]
            for r in CanteenItem.objects.filter(school_id=school_id, is_active=True)
            .values("category_id")
            .annotate(n=Count("id"))
        }
        for row in rows:
            row["items"] = counts.get(row["id"], 0)
        return Response(rows)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        return self._save(request, None)

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        row_id = self.int_or_none(request.data.get("id"))
        if not row_id:
            return self.RESPONSE__INVALID_REQUEST
        return self._save(request, row_id)

    def _save(self, request, row_id):
        school_id = self.school_id(request)
        name = (request.data.get("name") or "").strip()
        if len(name) < 2 or len(name) > 40:
            return Response({"message": "A category name is 2 to 40 characters."}, status=400)
        order = self.int_or_none(request.data.get("order")) or 0
        twin = CanteenCategory.objects.filter(school_id=school_id, is_active=True, name__iexact=name)
        if row_id:
            twin = twin.exclude(id=row_id)
        if twin.exists():
            return Response({"message": f"There is already a category called '{name}'."}, status=409)
        if row_id:
            row = CanteenCategory.objects.filter(id=row_id, school_id=school_id, is_active=True).first()
            if not row:
                return self.RESPONSE__NOT_FOUND
            row.name, row.order = name, order
            row.save()
            return Response({"id": row.id, "message": "Category updated!"})
        row = CanteenCategory.objects.create(school_id=school_id, name=name, order=order)
        return Response({"id": row.id, "message": "Category added!"})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        row = CanteenCategory.objects.filter(
            id=self.int_or_none(request.query_params.get("id")), school_id=school_id, is_active=True
        ).first()
        if not row:
            return self.RESPONSE__NOT_FOUND
        in_use = CanteenItem.objects.filter(category=row, is_active=True).count()
        if in_use:
            return Response(
                {"message": f"'{row.name}' still has {in_use} item(s). Move or remove them first."},
                status=400,
            )
        row.is_active = False
        row.save(update_fields=["is_active", "updated_at"])
        return Response({"message": "Category removed!"})


class CanteenItemView(CanteenBaseView):
    pages_for = {method: (PAGE_ITEMS,) for method in ("POST", "PUT", "DELETE")}

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        qs = CanteenItem.objects.filter(school_id=school_id, is_active=True)
        if self.bool_of(request.query_params.get("available")):
            # the counter: on today, and sold over the counter at all
            qs = qs.filter(is_available=True, sold_at_counter=True)
        if self.bool_of(request.query_params.get("monthly")):
            qs = qs.filter(monthly=True)
        rows = list(
            qs.order_by("category__order", "category__name", "order", "name").values(
                "id", "name", "price", "code", "food_type", "is_available", "order",
                "category", "category__name", "sold_at_counter", "monthly",
            )
        )
        rated = {
            r["item_id"]: r["n"]
            for r in CanteenClassRate.objects.filter(
                school_id=school_id, is_active=True, monthly_rate__gt=0
            ).values("item_id").annotate(n=Count("id"))
        }
        for row in rows:
            row["category_name"] = row.pop("category__name") or "Other"
            row["classes_rated"] = rated.get(row["id"], 0)
            row["food_type_name"] = label(FOOD_CHOICES, row["food_type"], "") if row["food_type"] else ""
        return Response(rows)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        return self._save(request, None)

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        row_id = self.int_or_none(request.data.get("id"))
        if not row_id:
            return self.RESPONSE__INVALID_REQUEST
        school_id = self.school_id(request)
        # A bare {"id", "is_available"} is the counter's "sold out" switch —
        # flipping it must not require resending the whole item.
        if set(request.data.keys()) <= {"id", "school", "is_available"}:
            row = CanteenItem.objects.filter(id=row_id, school_id=school_id, is_active=True).first()
            if not row:
                return self.RESPONSE__NOT_FOUND
            row.is_available = self.bool_of(request.data.get("is_available"), row.is_available)
            row.save(update_fields=["is_available", "updated_at"])
            return Response(
                {
                    "id": row.id,
                    "message": f"{row.name} is {'on the counter' if row.is_available else 'marked sold out'}.",
                }
            )
        return self._save(request, row_id)

    def _save(self, request, row_id):
        school_id = self.school_id(request)
        data = request.data
        name = (data.get("name") or "").strip()
        if len(name) < 2 or len(name) > 60:
            return Response({"message": "An item name is 2 to 60 characters."}, status=400)
        existing = (
            CanteenItem.objects.filter(id=row_id, school_id=school_id, is_active=True).first() if row_id else None
        )
        # Absent from the request = keep what the item has.
        sold_at_counter = self.bool_of(data.get("sold_at_counter"), existing.sold_at_counter if existing else True)
        monthly = self.bool_of(data.get("monthly"), existing.monthly if existing else False)
        if not sold_at_counter and not monthly:
            return Response({"message": "An item is sold at the counter, billed monthly, or both."}, status=400)
        price = self.money(data.get("price"))
        if sold_at_counter and price <= 0:
            return Response({"message": "Enter the item's counter price."}, status=400)
        if price < 0:
            return Response({"message": "A price cannot be below zero."}, status=400)
        if price >= 100000:
            return Response({"message": "That price is too large for a canteen item."}, status=400)
        category_id = self.int_or_none(data.get("category"))
        if category_id and not CanteenCategory.objects.filter(
            id=category_id, school_id=school_id, is_active=True
        ).exists():
            return Response({"message": "Pick a category from the list."}, status=400)
        food_type = self.int_or_none(data.get("food_type")) or 0
        if food_type not in dict(FOOD_CHOICES):
            food_type = 0
        code = self.text(data.get("code"), 12)
        values = {
            "name": name,
            "price": price,
            "category_id": category_id,
            "code": code.upper() if code else None,
            "food_type": food_type,
            "is_available": self.bool_of(data.get("is_available"), True),
            "sold_at_counter": sold_at_counter,
            "monthly": monthly,
            "order": self.int_or_none(data.get("order")) or 0,
        }
        twin = CanteenItem.objects.filter(school_id=school_id, is_active=True, name__iexact=name)
        code_twin = (
            CanteenItem.objects.filter(school_id=school_id, is_active=True, code__iexact=code)
            if code
            else CanteenItem.objects.none()
        )
        if row_id:
            twin, code_twin = twin.exclude(id=row_id), code_twin.exclude(id=row_id)
        if twin.exists():
            return Response({"message": f"There is already an item called '{name}'."}, status=409)
        if code_twin.exists():
            return Response({"message": f"The code '{values['code']}' is already used by another item."}, status=409)
        if row_id:
            row = CanteenItem.objects.filter(id=row_id, school_id=school_id, is_active=True).first()
            if not row:
                return self.RESPONSE__NOT_FOUND
            for key, value in values.items():
                setattr(row, key, value)
            row.save()
            return Response({"id": row.id, "message": "Item updated!"})
        row = CanteenItem.objects.create(school_id=school_id, **values)
        return Response({"id": row.id, "message": "Item added!"})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        row = CanteenItem.objects.filter(
            id=self.int_or_none(request.query_params.get("id")), school_id=school_id, is_active=True
        ).first()
        if not row:
            return self.RESPONSE__NOT_FOUND
        row.is_active = False
        row.save(update_fields=["is_active", "updated_at"])
        return Response(
            {"message": f"{row.name} removed. Slips already printed keep its name and price."}
        )


class CanteenClassRateView(CanteenBaseView):
    """A monthly item's rate, class by class: "Tiffin — Class 1: 1,500, Class 2:
    2,500". GET lists every class that has running students, with its rate (0
    when none is set). PUT takes the whole table and stores what is on screen."""

    pages_for = {"PUT": (PAGE_ITEMS,)}

    def _item(self, school_id, item_id):
        return CanteenItem.objects.filter(id=item_id, school_id=school_id, is_active=True).first()

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        item = self._item(school_id, self.int_or_none(request.query_params.get("item")))
        if not item:
            return self.RESPONSE__NOT_FOUND
        rates = {
            r.class_key: r for r in CanteenClassRate.objects.filter(item=item, is_active=True)
        }
        rows = []
        for cls in school_classes(school_id):
            rate = rates.pop(cls["key"], None)
            rows.append({**cls, "monthly_rate": rate.monthly_rate if rate else 0})
        # A rate for a class that has no running students now still shows.
        for key, rate in rates.items():
            rows.append({"key": key, "label": rate.class_label, "students": 0, "monthly_rate": rate.monthly_rate})
        return Response({"item": {"id": item.id, "name": item.name, "monthly": item.monthly}, "rows": rows})

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        item = self._item(school_id, self.int_or_none(request.data.get("item")))
        if not item:
            return self.RESPONSE__NOT_FOUND
        rows = request.data.get("rates")
        if not isinstance(rows, list):
            return self.RESPONSE__INVALID_REQUEST
        clean = {}
        for row in rows:
            if not isinstance(row, dict):
                continue
            key = (row.get("key") or "").strip()[:40]
            if not key:
                continue
            rate = self.money(row.get("monthly_rate"))
            if rate < 0 or rate >= 1000000:
                return Response({"message": "A monthly rate is from 0 to 999,999."}, status=400)
            clean[key] = (rate, (row.get("label") or key).strip()[:80])
        with transaction.atomic():
            current = {r.class_key: r for r in CanteenClassRate.objects.select_for_update().filter(item=item, is_active=True)}
            for key, (rate, label) in clean.items():
                row = current.get(key)
                if row:
                    if row.monthly_rate != rate or row.class_label != label:
                        row.monthly_rate, row.class_label = rate, label
                        row.save()
                elif rate > 0:
                    CanteenClassRate.objects.create(
                        school_id=school_id, item=item, class_key=key, class_label=label, monthly_rate=rate
                    )
            if not item.monthly and any(rate > 0 for rate, _ in clean.values()):
                item.monthly = True
                item.save(update_fields=["monthly", "updated_at"])
        set_count = sum(1 for rate, _ in clean.values() if rate > 0)
        return Response({"message": f"{item.name}: monthly rates saved for {set_count} class(es). "
                                    "They apply from the next posting."})


class CanteenClassesView(CanteenBaseView):
    """The school's classes as the canteen keys its rates — the grade, for every
    section and stream of it — with how many running students each has."""

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        return Response(school_classes(self.school_id(request)))
