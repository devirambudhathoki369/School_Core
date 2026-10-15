"""Inventory API.

  /api/v1/inventory/categories     CRUD categories
  /api/v1/inventory/items          CRUD items (GET returns derived current stock)
  /api/v1/inventory/transactions   CRUD dated movements (purchase/issue/adjustment)
                                   GET = register, filterable by type/item/
                                   category/academic_year/date range
  /api/v1/inventory/report         summary: investment, stock value, low-stock,
                                   per-category breakdown (academic-year scoped)

Stock is always derived from the transaction ledger (never stored).
"""

from django.db.models import (
    Sum, F, Case, When, DecimalField, Value, Q,
)
from django.db.models.functions import Coalesce
from rest_framework.response import Response

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)

from ...models.inventory.Inventory import (
    InventoryCategory,
    InventoryItem,
    InventoryTransaction,
    TXN_PURCHASE,
    TXN_ISSUE,
    TXN_ADJUSTMENT,
    TXN_WASTAGE,
)
from ...models.FiscalYears import AcademicYear
from ..BaseViews import SecuredAPIView

_AUTH = (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)

# Signed quantity for a running stock balance: issues and wastage subtract, the
# rest add (adjustment quantity is already signed by the user).
_STOCK_EXPR = Sum(
    Case(
        When(txn_type__in=[TXN_ISSUE, TXN_WASTAGE], then=-F("quantity")),
        default=F("quantity"),
        output_field=DecimalField(max_digits=14, decimal_places=2),
    )
)


def _stock_map(school_id, item_ids=None):
    """item_id -> current net stock, across all years."""
    q = InventoryTransaction.objects.filter(school_id=school_id, is_active=True)
    if item_ids is not None:
        q = q.filter(item_id__in=item_ids)
    rows = q.values("item_id").annotate(stock=_STOCK_EXPR)
    return {r["item_id"]: float(r["stock"] or 0) for r in rows}


def _last_purchase_price_map(school_id, item_ids):
    """item_id -> unit_price of its most recent purchase (0 if never priced).

    Used to value wastage at the latest known buy price.
    """
    price = {}
    for item_id in set(item_ids):
        lp = (
            InventoryTransaction.objects.filter(
                school_id=school_id,
                is_active=True,
                txn_type=TXN_PURCHASE,
                item_id=item_id,
                unit_price__isnull=False,
            )
            .order_by("-date", "-id")
            .values_list("unit_price", flat=True)
            .first()
        )
        price[item_id] = float(lp) if lp is not None else 0.0
    return price


class InventoryCategoryView(SecuredAPIView):
    authentication_classes = _AUTH

    def get(self, request):
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        rows = list(
            InventoryCategory.objects.filter(school_id=school_id, is_active=True)
            .order_by("name")
            .values("id", "name")
        )
        return Response(rows)

    def post(self, request):
        school_id = request.data.get("school")
        name = request.data.get("name")
        if not school_id or not name:
            return self.RESPONSE__INVALID_REQUEST
        c = InventoryCategory.objects.create(school_id=school_id, name=name)
        return Response({"message": "Category saved!", "id": c.id, "name": c.name})

    def put(self, request):
        cid = request.data.get("id")
        school_id = request.data.get("school")
        name = request.data.get("name")
        if not cid or not school_id or not name:
            return self.RESPONSE__INVALID_REQUEST
        c = InventoryCategory.objects.filter(id=cid, school_id=school_id).first()
        if not c:
            return self.RESPONSE__NOT_FOUND
        c.name = name
        c.save(update_fields=["name"])
        return Response({"message": "Category updated!"})

    def delete(self, request):
        cid = request.query_params.get("id")
        school_id = request.query_params.get("school")
        if not cid or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        # block delete if items reference it
        if InventoryItem.objects.filter(
            category_id=cid, school_id=school_id, is_active=True
        ).exists():
            return Response(
                {"message": "Category is in use by items."}, status=400
            )
        InventoryCategory.objects.filter(id=cid, school_id=school_id).update(
            is_active=False
        )
        return Response({"message": "Category deleted!"})


class InventoryItemView(SecuredAPIView):
    scoped_fields = {"category": (InventoryCategory, "school")}
    authentication_classes = _AUTH

    def get(self, request):
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        items = list(
            InventoryItem.objects.filter(school_id=school_id, is_active=True)
            .order_by("name")
            .values("id", "name", "unit", "reorder_level", "category", "category__name")
        )
        stock = _stock_map(school_id, [i["id"] for i in items])
        for i in items:
            i["category_name"] = i.pop("category__name") or ""
            i["stock"] = stock.get(i["id"], 0)
            rl = i.get("reorder_level")
            i["reorder_level"] = float(rl) if rl is not None else None
            i["low_stock"] = (
                i["reorder_level"] is not None and i["stock"] <= i["reorder_level"]
            )
        return Response(items)

    def post(self, request):
        school_id = request.data.get("school")
        name = request.data.get("name")
        if not school_id or not name:
            return self.RESPONSE__INVALID_REQUEST
        item = InventoryItem.objects.create(
            school_id=school_id,
            name=name,
            unit=request.data.get("unit") or None,
            category_id=request.data.get("category") or None,
            reorder_level=request.data.get("reorder_level") or None,
        )
        return Response({"message": "Item saved!", "id": item.id})

    def put(self, request):
        iid = request.data.get("id")
        school_id = request.data.get("school")
        if not iid or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        item = InventoryItem.objects.filter(id=iid, school_id=school_id).first()
        if not item:
            return self.RESPONSE__NOT_FOUND
        if "name" in request.data and request.data.get("name"):
            item.name = request.data.get("name")
        if "unit" in request.data:
            item.unit = request.data.get("unit") or None
        if "category" in request.data:
            item.category_id = request.data.get("category") or None
        if "reorder_level" in request.data:
            item.reorder_level = request.data.get("reorder_level") or None
        item.save()
        return Response({"message": "Item updated!"})

    def delete(self, request):
        iid = request.query_params.get("id")
        school_id = request.query_params.get("school")
        if not iid or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        # block delete when the item has movement history
        if InventoryTransaction.objects.filter(
            item_id=iid, school_id=school_id, is_active=True
        ).exists():
            return Response(
                {"message": "Item has transactions; cannot delete."}, status=400
            )
        InventoryItem.objects.filter(id=iid, school_id=school_id).update(
            is_active=False
        )
        return Response({"message": "Item deleted!"})


def _txn_total(data):
    """Line total for a purchase: explicit total, else quantity × unit_price."""
    if data.get("total") not in (None, ""):
        return data.get("total")
    try:
        return float(data.get("quantity") or 0) * float(data.get("unit_price") or 0)
    except (TypeError, ValueError):
        return None


class InventoryTransactionView(SecuredAPIView):
    scoped_fields = {
        "item": (InventoryItem, "school"),
        "category": (InventoryCategory, "school"),
        "academic_year": (AcademicYear, "school"),
    }
    authentication_classes = _AUTH

    def get(self, request):
        p = request.query_params
        school_id = p.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        q = Q(school_id=school_id, is_active=True)
        if p.get("txn_type"):
            q &= Q(txn_type=p.get("txn_type"))
        if p.get("item"):
            q &= Q(item_id=p.get("item"))
        if p.get("category"):
            q &= Q(item__category_id=p.get("category"))
        if p.get("academic_year"):
            q &= Q(academic_year_id=p.get("academic_year"))
        if p.get("date_from"):
            q &= Q(date__gte=p.get("date_from"))
        if p.get("date_to"):
            q &= Q(date__lte=p.get("date_to"))
        rows = list(
            InventoryTransaction.objects.filter(q).values(
                "id", "item", "item__name", "txn_type", "quantity", "unit_price",
                "total", "date", "supplier", "party_or_purpose", "remarks",
                "academic_year",
            )
        )
        for r in rows:
            r["item_name"] = r.pop("item__name")
        return Response(rows)

    def post(self, request):
        d = request.data
        school_id = d.get("school")
        if not school_id or not d.get("item") or not d.get("quantity") or not d.get("txn_type"):
            return self.RESPONSE__INVALID_REQUEST
        txn = InventoryTransaction.objects.create(
            school_id=school_id,
            item_id=d.get("item"),
            txn_type=d.get("txn_type"),
            quantity=d.get("quantity"),
            unit_price=d.get("unit_price") or None,
            total=_txn_total(d),
            date=d.get("date") or None,
            academic_year_id=d.get("academic_year"),
            economic_year_id=d.get("economic_year") or None,
            supplier=d.get("supplier") or None,
            party_or_purpose=d.get("party_or_purpose") or None,
            remarks=d.get("remarks") or None,
        )
        return Response({"message": "Transaction saved!", "id": txn.id})

    def put(self, request):
        d = request.data
        tid = d.get("id")
        school_id = d.get("school")
        if not tid or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        txn = InventoryTransaction.objects.filter(id=tid, school_id=school_id).first()
        if not txn:
            return self.RESPONSE__NOT_FOUND
        for f in ("txn_type", "quantity", "date"):
            if f in d and d.get(f) not in (None, ""):
                setattr(txn, f, d.get(f))
        if "unit_price" in d:
            txn.unit_price = d.get("unit_price") or None
        if "supplier" in d:
            txn.supplier = d.get("supplier") or None
        if "party_or_purpose" in d:
            txn.party_or_purpose = d.get("party_or_purpose") or None
        if "remarks" in d:
            txn.remarks = d.get("remarks") or None
        if "quantity" in d or "unit_price" in d or "total" in d:
            txn.total = _txn_total({
                "total": d.get("total"),
                "quantity": d.get("quantity", txn.quantity),
                "unit_price": d.get("unit_price", txn.unit_price),
            })
        txn.save()
        return Response({"message": "Transaction updated!"})

    def delete(self, request):
        tid = request.query_params.get("id")
        school_id = request.query_params.get("school")
        if not tid or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        InventoryTransaction.objects.filter(id=tid, school_id=school_id).update(
            is_active=False
        )
        return Response({"message": "Transaction deleted!"})


class InventoryReportView(SecuredAPIView):
    authentication_classes = _AUTH

    def get(self, request):
        p = request.query_params
        school_id = p.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST

        # --- investment (purchase value), academic-year / date scoped ---------
        inv_q = Q(school_id=school_id, is_active=True, txn_type=TXN_PURCHASE)
        if p.get("academic_year"):
            inv_q &= Q(academic_year_id=p.get("academic_year"))
        if p.get("date_from"):
            inv_q &= Q(date__gte=p.get("date_from"))
        if p.get("date_to"):
            inv_q &= Q(date__lte=p.get("date_to"))
        purchases = InventoryTransaction.objects.filter(inv_q)
        total_investment = purchases.aggregate(
            s=Coalesce(Sum("total"), Value(0), output_field=DecimalField())
        )["s"]
        purchase_count = purchases.count()

        issue_q = Q(school_id=school_id, is_active=True, txn_type=TXN_ISSUE)
        if p.get("academic_year"):
            issue_q &= Q(academic_year_id=p.get("academic_year"))
        if p.get("date_from"):
            issue_q &= Q(date__gte=p.get("date_from"))
        if p.get("date_to"):
            issue_q &= Q(date__lte=p.get("date_to"))
        issue_count = InventoryTransaction.objects.filter(issue_q).count()

        # --- wastage (stock-out written off), valued at last purchase price ----
        waste_q = Q(school_id=school_id, is_active=True, txn_type=TXN_WASTAGE)
        if p.get("academic_year"):
            waste_q &= Q(academic_year_id=p.get("academic_year"))
        if p.get("date_from"):
            waste_q &= Q(date__gte=p.get("date_from"))
        if p.get("date_to"):
            waste_q &= Q(date__lte=p.get("date_to"))
        waste_by_item = list(
            InventoryTransaction.objects.filter(waste_q)
            .values("item_id", "item__name", "item__category__name")
            .annotate(qty=Coalesce(Sum("quantity"), Value(0), output_field=DecimalField()))
            .order_by("-qty")
        )
        wastage_count = InventoryTransaction.objects.filter(waste_q).count()
        last_price = _last_purchase_price_map(
            school_id, [r["item_id"] for r in waste_by_item]
        )
        wastage_items = []
        total_wastage_value = 0.0
        for r in waste_by_item:
            price = last_price.get(r["item_id"], 0)
            qty = float(r["qty"] or 0)
            value = qty * price
            total_wastage_value += value
            wastage_items.append(
                {
                    "id": r["item_id"],
                    "name": r["item__name"],
                    "category": r["item__category__name"] or "Uncategorized",
                    "quantity": qty,
                    "unit_price": price,
                    "value": value,
                }
            )

        # --- current stock + low-stock count (all-time) -----------------------
        items = list(
            InventoryItem.objects.filter(school_id=school_id, is_active=True)
            .values("id", "name", "reorder_level", "category__name")
        )
        stock = _stock_map(school_id, [i["id"] for i in items])
        low_stock = []
        total_units = 0.0
        for i in items:
            s = stock.get(i["id"], 0)
            total_units += s
            rl = i["reorder_level"]
            if rl is not None and s <= float(rl):
                low_stock.append({"id": i["id"], "name": i["name"], "stock": s})

        # --- investment per category (scoped) ---------------------------------
        by_cat = (
            purchases.values("item__category__name")
            .annotate(total=Coalesce(Sum("total"), Value(0), output_field=DecimalField()))
            .order_by("-total")
        )
        category_investment = [
            {"category": (r["item__category__name"] or "Uncategorized"), "total": r["total"]}
            for r in by_cat
        ]

        return Response(
            {
                "total_investment": total_investment,
                "purchase_count": purchase_count,
                "issue_count": issue_count,
                "wastage_count": wastage_count,
                "total_wastage_value": total_wastage_value,
                "wastage_items": wastage_items,
                "total_items": len(items),
                "total_units_in_stock": total_units,
                "low_stock_count": len(low_stock),
                "low_stock_items": low_stock,
                "category_investment": category_investment,
            }
        )
