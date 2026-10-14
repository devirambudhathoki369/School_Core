"""Superadmin management of daily-collection-SMS shareholders.

  GET    /api/shareholders            list all (optionally ?school=<id>)
  POST   /api/shareholders            add {school, contact, name?}
  PUT    /api/shareholders            update {id, contact?, name?, is_active?}
  DELETE /api/shareholders?id=        delete

Shareholders are the recipients of each school's daily "Today's Collection
Point" SMS (sent by the 18:00 cron). Replaces the old shareholders.json.
"""

from rest_framework.response import Response

from account.auth.Authentication import SuperAdminTokenAuthentication
from ..BaseViews import SecuredAPIView
from ...models.superadmin.Shareholder import Shareholder
from ...models.SchoolAdmin import SchoolAdmin


def _truthy(v):
    return str(v).lower() in ("1", "true", "yes", "on")


def _school_name(school):
    return getattr(school, "name", "") or ""


def _serialize(s):
    return {
        "id": s.id,
        "school": s.school_id,
        "school_name": _school_name(s.school),
        "name": s.name or "",
        "contact": s.contact,
        "is_active": s.is_active,
    }


class ShareholderView(SecuredAPIView):
    """Superadmin CRUD for collection-SMS shareholders."""

    authentication_classes = (SuperAdminTokenAuthentication,)

    def get(self, request):
        qs = Shareholder.objects.select_related("school").all()
        school = request.query_params.get("school")
        if school:
            qs = qs.filter(school_id=school)
        return Response([_serialize(s) for s in qs])

    def post(self, request):
        school_id = request.data.get("school")
        contact = (request.data.get("contact") or "").strip()
        name = (request.data.get("name") or "").strip()
        if not school_id or not contact:
            return self.RESPONSE__INVALID_REQUEST
        if not SchoolAdmin.objects.filter(id=school_id).exists():
            return self.RESPONSE__INVALID_REQUEST
        # Avoid duplicate (school, contact) rows.
        existing = Shareholder.objects.filter(
            school_id=school_id, contact=contact
        ).first()
        if existing:
            if not existing.is_active:
                existing.is_active = True
                if name:
                    existing.name = name
                existing.save()
            return Response(
                {"message": "Shareholder added!", "shareholder": _serialize(existing)}
            )
        s = Shareholder.objects.create(
            school_id=school_id, contact=contact, name=name or None
        )
        return Response({"message": "Shareholder added!", "shareholder": _serialize(s)})

    def put(self, request):
        sid = request.data.get("id")
        if not sid:
            return self.RESPONSE__INVALID_REQUEST
        s = Shareholder.objects.filter(id=sid).first()
        if not s:
            return self.RESPONSE__NOT_FOUND
        if "contact" in request.data:
            contact = (request.data.get("contact") or "").strip()
            if contact:
                s.contact = contact
        if "name" in request.data:
            s.name = (request.data.get("name") or "").strip() or None
        if "is_active" in request.data:
            s.is_active = _truthy(request.data.get("is_active"))
        s.save()
        return Response({"message": "Shareholder updated!", "shareholder": _serialize(s)})

    def delete(self, request):
        sid = request.query_params.get("id")
        if not sid:
            return self.RESPONSE__INVALID_REQUEST
        Shareholder.objects.filter(id=sid).delete()
        return Response({"message": "Shareholder deleted!"})
