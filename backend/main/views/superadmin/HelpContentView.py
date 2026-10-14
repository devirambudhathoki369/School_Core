"""Support & Guides content — read by everyone, written by the superadmin.

  GET    /api/help/support        support details        (public)
  PUT    /api/help/support        update details         (superadmin)

  GET    /api/help/guides         categories + guides    (any logged-in user)
  POST   /api/help/guides         create a guide         (superadmin)
  PUT    /api/help/guides         update a guide         (superadmin)
  DELETE /api/help/guides?id=     delete a guide         (superadmin)

  GET    /api/help/categories     categories             (superadmin)
  POST   /api/help/categories     create                 (superadmin)
  PUT    /api/help/categories     update                 (superadmin)
  DELETE /api/help/categories?id= delete                 (superadmin)

Reading support details needs no token at all: `/support` is a route you can
reach without signing in, and a company's own phone number and office address
are already public on it. Everything else needs a login, and every write needs
the superadmin — which is what makes this content editable without a deploy.
"""

from django.db import IntegrityError
from django.utils.text import slugify
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)
from ..BaseViews import SecuredAPIView
from ...models.superadmin.HelpContent import SupportInfo, GuideCategory, Guide


ANY_ROLE = (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)


def _truthy(v, default=True):
    if v is None:
        return default
    return str(v).lower() in ("1", "true", "yes", "on")


def _string_list(value):
    """Accept either a JSON array or a newline-separated block of text.

    The console edits steps and tips in a textarea, one per line, so both shapes
    arrive at this endpoint. Blank lines are dropped rather than stored, or the
    page renders numbered steps with nothing in them.
    """
    if value is None:
        return None
    if isinstance(value, str):
        value = value.splitlines()
    if not isinstance(value, (list, tuple)):
        return None
    return [str(v).strip() for v in value if str(v).strip()]


def _int_list(value):
    items = _string_list(value)
    if items is None:
        return None
    out = []
    for item in items:
        try:
            out.append(int(item))
        except (TypeError, ValueError):
            continue
    return out


def _support(info):
    return {
        "name": info.name,
        "product": info.product,
        "address": info.address,
        "open_days": info.open_days,
        "open_time": info.open_time,
        "open_from_hour": info.open_from_hour,
        "open_to_hour": info.open_to_hour,
        "closed_weekdays": info.closed_weekdays or [],
        "contact": info.contact,
        "email": info.email,
        "website": info.website,
        "whatsapp_contact": info.whatsapp_contact,
        "fb_page_id": info.fb_page_id,
        "checklist": info.checklist or [],
    }


def _category(category):
    return {
        "id": category.id,
        "key": category.key,
        "name": category.name,
        "order": category.order,
        "is_active": category.is_active,
    }


def _guide(guide):
    return {
        "id": guide.id,
        "slug": guide.slug,
        "category": guide.category.key if guide.category else "",
        "category_id": guide.category_id,
        "title": guide.title,
        "summary": guide.summary,
        "where": guide.where,
        "view": guide.view,
        "steps": guide.steps or [],
        "tips": guide.tips or [],
        "order": guide.order,
        "is_active": guide.is_active,
    }


class PublicSupportInfoView(APIView):
    """Read-only support details, for the signed-out `/support` route.

    `SecuredAPIView.perform_authentication` raises as soon as more than one
    authenticator is configured and none of them matches, so a public endpoint
    cannot be built by relaxing that class — it gets its own plain `APIView`
    with no authenticators at all.
    """

    permission_classes = (permissions.AllowAny,)
    authentication_classes = ()
    swagger_schema = None

    def get(self, request):
        return Response(_support(SupportInfo.load()))


class SupportInfoView(SecuredAPIView):
    """Superadmin editing of the help desk's own details."""

    authentication_classes = (SuperAdminTokenAuthentication,)

    # Plain text fields, copied straight across when present in the payload.
    TEXT_FIELDS = (
        "name",
        "product",
        "address",
        "open_days",
        "open_time",
        "contact",
        "email",
        "website",
        "whatsapp_contact",
        "fb_page_id",
    )

    def get(self, request):
        return Response(_support(SupportInfo.load()))

    def put(self, request):
        info = SupportInfo.load()
        for field in self.TEXT_FIELDS:
            if field in request.data:
                setattr(info, field, (request.data.get(field) or "").strip())

        for field in ("open_from_hour", "open_to_hour"):
            if field in request.data:
                try:
                    hour = int(request.data.get(field))
                except (TypeError, ValueError):
                    return self.RESPONSE__INVALID_REQUEST
                if not 0 <= hour <= 24:
                    return self.RESPONSE__INVALID_REQUEST
                setattr(info, field, hour)

        if "closed_weekdays" in request.data:
            days = _int_list(request.data.get("closed_weekdays"))
            if days is None:
                return self.RESPONSE__INVALID_REQUEST
            info.closed_weekdays = [d for d in days if 0 <= d <= 6]

        if "checklist" in request.data:
            checklist = _string_list(request.data.get("checklist"))
            if checklist is None:
                return self.RESPONSE__INVALID_REQUEST
            info.checklist = checklist

        info.save()
        return Response({"message": "Support details updated!", "support": _support(info)})


class GuideCategoryView(SecuredAPIView):
    """Superadmin management of the category chips."""

    authentication_classes = (SuperAdminTokenAuthentication,)

    def get(self, request):
        return Response([_category(c) for c in GuideCategory.objects.all()])

    def post(self, request):
        name = (request.data.get("name") or "").strip()
        if not name:
            return self.RESPONSE__INVALID_REQUEST
        key = (request.data.get("key") or "").strip() or slugify(name)[:40]
        if not key:
            return self.RESPONSE__INVALID_REQUEST
        if GuideCategory.objects.filter(key=key).exists():
            return self.RESPONSE__ALREADY_EXISTS
        category = GuideCategory.objects.create(
            key=key,
            name=name,
            order=request.data.get("order") or 0,
            is_active=_truthy(request.data.get("is_active")),
        )
        return Response({"message": "Category saved!", "category": _category(category)})

    def put(self, request):
        category = GuideCategory.objects.filter(id=request.data.get("id")).first()
        if not category:
            return self.RESPONSE__NOT_FOUND
        if "name" in request.data:
            name = (request.data.get("name") or "").strip()
            if not name:
                return self.RESPONSE__INVALID_REQUEST
            category.name = name
        if "key" in request.data:
            key = (request.data.get("key") or "").strip()
            if not key:
                return self.RESPONSE__INVALID_REQUEST
            if GuideCategory.objects.filter(key=key).exclude(id=category.id).exists():
                return self.RESPONSE__ALREADY_EXISTS
            category.key = key
        if "order" in request.data:
            category.order = request.data.get("order") or 0
        if "is_active" in request.data:
            category.is_active = _truthy(request.data.get("is_active"))
        category.save()
        return Response({"message": "Category updated!", "category": _category(category)})

    def delete(self, request):
        category = GuideCategory.objects.filter(id=request.query_params.get("id")).first()
        if not category:
            return self.RESPONSE__NOT_FOUND
        # Deleting a category would cascade its guides away with it. Refuse, and
        # let the superadmin move or delete those guides deliberately.
        used = category.guides.count()
        if used:
            return Response(
                {
                    "message": (
                        f"{category.name} still has {used} guide"
                        f"{'' if used == 1 else 's'}. Move or delete them first."
                    )
                },
                status=409,
            )
        category.delete()
        return Response({"message": "Category deleted!"})


class GuideView(SecuredAPIView):
    """The guides themselves."""

    authentication_classes = ANY_ROLE

    def get(self, request):
        # A superadmin is editing, so they need the inactive rows too; everyone
        # else is reading the page and should only see what is published.
        manage = getattr(request, "user_role", None) == "superadmin" and _truthy(
            request.query_params.get("manage"), False
        )

        categories = GuideCategory.objects.all()
        guides = Guide.objects.select_related("category")
        if not manage:
            categories = categories.filter(is_active=True)
            guides = guides.filter(is_active=True, category__is_active=True)

        return Response(
            {
                "categories": [_category(c) for c in categories],
                "guides": [_guide(g) for g in guides],
            }
        )

    def _apply(self, guide, data):
        """Copy a payload onto a guide. Returns an error response, or None."""
        if "category" in data or "category_id" in data:
            key = data.get("category")
            category = (
                GuideCategory.objects.filter(id=data.get("category_id")).first()
                if data.get("category_id")
                else GuideCategory.objects.filter(key=key).first()
            )
            if not category:
                return self.RESPONSE__NOT_FOUND
            guide.category = category

        for field in ("title", "summary", "where", "view"):
            if field in data:
                setattr(guide, field, (data.get(field) or "").strip())

        for field in ("steps", "tips"):
            if field in data:
                items = _string_list(data.get(field))
                if items is None:
                    return self.RESPONSE__INVALID_REQUEST
                setattr(guide, field, items)

        if "order" in data:
            guide.order = data.get("order") or 0
        if "is_active" in data:
            guide.is_active = _truthy(data.get("is_active"))
        return None

    def post(self, request):
        if getattr(request, "user_role", None) != "superadmin":
            return self.RESPONSE__NOT_ALLOWED

        title = (request.data.get("title") or "").strip()
        if not title:
            return self.RESPONSE__INVALID_REQUEST
        slug = (request.data.get("slug") or "").strip() or slugify(title)[:60]
        if not slug or Guide.objects.filter(slug=slug).exists():
            return self.RESPONSE__ALREADY_EXISTS

        guide = Guide(slug=slug, title=title)
        error = self._apply(guide, request.data)
        if error:
            return error
        try:
            guide.save()
        except IntegrityError:
            return self.RESPONSE__ALREADY_EXISTS
        return Response({"message": "Guide saved!", "guide": _guide(guide)})

    def put(self, request):
        if getattr(request, "user_role", None) != "superadmin":
            return self.RESPONSE__NOT_ALLOWED

        guide = Guide.objects.filter(id=request.data.get("id")).first()
        if not guide:
            return self.RESPONSE__NOT_FOUND
        if "slug" in request.data:
            slug = (request.data.get("slug") or "").strip()
            if not slug:
                return self.RESPONSE__INVALID_REQUEST
            if Guide.objects.filter(slug=slug).exclude(id=guide.id).exists():
                return self.RESPONSE__ALREADY_EXISTS
            guide.slug = slug
        error = self._apply(guide, request.data)
        if error:
            return error
        guide.save()
        return Response({"message": "Guide updated!", "guide": _guide(guide)})

    def delete(self, request):
        if getattr(request, "user_role", None) != "superadmin":
            return self.RESPONSE__NOT_ALLOWED
        guide = Guide.objects.filter(id=request.query_params.get("id")).first()
        if not guide:
            return self.RESPONSE__NOT_FOUND
        guide.delete()
        return Response({"message": "Guide deleted!"})
