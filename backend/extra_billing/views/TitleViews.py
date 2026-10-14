"""The charge heads a school raises on its extra billing.

  GET/POST/PUT/DELETE  /extra-billing/titles   ?school=

One row per school, shared by every party — every report groups money by title,
so a per-party title would scatter the same rupees across rows nobody can add.
A title that has ever been billed cannot be deleted; it can be renamed, and the
old receipts keep the name they were printed with (that snapshot lives in each
row's `details.__titles`).
"""

from django.db.models import Count
from rest_framework.response import Response

from ..methods.balances import detail_rows
from ..models.Billing import ExtraInvoice, ExtraLedger
from ..models.Party import BillingTitle, PartyCharge
from .BaseViews import ExtraBillingBaseView


def title_in_use(school_id, title_id):
    """Has this title ever carried money? (Rate cards do not count — those are
    editable settings, not history.)"""
    key = str(title_id)
    for model in (ExtraLedger, ExtraInvoice):
        for details in model.objects.filter(
            school_id=school_id, is_active=True
        ).values_list("details", flat=True):
            for detail_key, amount in detail_rows(details):
                if detail_key == key and amount:
                    return True
    return False


class BillingTitleView(ExtraBillingBaseView):
    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        as_options = self.getBooleanValue(request.query_params.get("as_options"))
        titles = list(
            BillingTitle.objects.filter(school_id=school_id, is_active=True)
            .order_by("order", "title")
            .values("id", "title", "order", "remarks")
        )
        if as_options:
            return Response([{"value": t["id"], "name": t["title"]} for t in titles])
        used = {
            row["title_id"]: row["n"]
            for row in PartyCharge.objects.filter(
                title_id__in=[t["id"] for t in titles], is_active=True
            )
            .values("title_id")
            .annotate(n=Count("id"))
        }
        for t in titles:
            t["parties"] = used.get(t["id"], 0)
        return Response(titles)

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        return self._save(request, None)

    def put(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        title_id = self.int_or_none(request.data.get("id"))
        if not title_id:
            return self.RESPONSE__INVALID_REQUEST
        return self._save(request, title_id)

    def _save(self, request, title_id):
        school_id = self.school_id(request)
        title = (request.data.get("title") or "").strip()
        if len(title) < 2:
            return Response({"message": "A title is required."}, status=400)
        order = self.int_or_none(request.data.get("order")) or 0
        remarks = (request.data.get("remarks") or "").strip() or None

        twin = BillingTitle.objects.filter(
            school_id=school_id, is_active=True, title__iexact=title
        )
        if title_id:
            twin = twin.exclude(id=title_id)
        if twin.exists():
            return self.RESPONSE__ALREADY_EXISTS

        if title_id:
            row = BillingTitle.objects.filter(
                id=title_id, school_id=school_id, is_active=True
            ).first()
            if not row:
                return self.RESPONSE__NOT_FOUND
            row.title, row.order, row.remarks = title, order, remarks
            row.save()
            return Response({"id": row.id, "message": "Title updated!"})
        row = BillingTitle.objects.create(
            school_id=school_id, title=title, order=order, remarks=remarks
        )
        return Response({"id": row.id, "message": "Title added!"})

    def delete(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        title_id = self.int_or_none(request.query_params.get("id"))
        row = BillingTitle.objects.filter(
            id=title_id, school_id=school_id, is_active=True
        ).first()
        if not row:
            return self.RESPONSE__NOT_FOUND
        if title_in_use(school_id, title_id):
            return Response(
                {
                    "message": (
                        f"'{row.title}' has already been billed, so it has to stay on the record. "
                        "Rename it if it is wrong — old bills keep the name they were printed with."
                    )
                },
                status=400,
            )
        row.is_active = False
        row.save(update_fields=["is_active", "updated_at"])
        PartyCharge.objects.filter(title_id=title_id).update(is_active=False)
        return Response({"message": "Title removed!"})
