"""Birthday cards a school designs for itself.

  GET    /api/birthday-templates?school=X&audience=student
         Every design the school holds, plus the option catalogue. `active` is
         the one the card screen draws.

  POST   /api/birthday-templates          create, or `duplicate` an existing one
  PUT    /api/birthday-templates          save one design
  DELETE /api/birthday-templates?id=N
  PUT    /api/birthday-templates/background   the artwork (multipart)

WHY ADMIN AND NOT SUPERADMIN
----------------------------
An ID card is a document the school ISSUES — the operator owns its uniformity.
A birthday wish is the school talking to its own families in its own voice, and
routing a change of wording through a support ticket means the wording never
changes. So this whole surface takes an admin token.

THE TENANT BOUNDARY IS THE AUTHENTICATOR'S, NOT THIS VIEW'S.
Every entry point below reads `school` from the request and filters on it
directly. That is safe for exactly one reason: `AdminTokenAuthentication`
already refuses a token whose account does not belong to the `school` it is
asking about (`belongs_to_school`). Do NOT copy this pattern into a view that
takes the school from a body field the authenticator never sees — on a PUT and a
DELETE below the school is re-derived from the row itself and re-checked, which
is why those take the longer route.
"""

from django.db import transaction
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
)
from ..BaseViews import SecuredAPIView
from ...models.SchoolAdmin import SchoolAdmin
from ...models.BirthdayTemplate import BirthdayTemplate, AUDIENCES, AUDIENCE_CHOICES
from ...constants.birthday_layout import (
    BIRTHDAY_FIELDS, IMAGE_SOURCES, FONT_CHOICES, WEIGHTS, ALIGNMENTS,
    TRANSFORMS, FITS, SHAPES, FORMATS, FORMAT_KEYS, PRESET_CHOICES, PRESET_KEYS,
    DEFAULT_WISH, WISH_PLACEHOLDERS, ELEMENT_DEFAULT, KINDS,
    default_layout, sanitize_layout, preset_format,
)

MAX_TEMPLATES_PER_AUDIENCE = 20
MAX_WISH_CHARS = 600


def serialize(template):
    if not template:
        return None
    return {
        "id": template.id,
        "school": template.school_id,
        "audience": template.audience,
        "name": template.name,
        "is_active": template.is_active,
        "card_format": template.safe_format,
        "size": template.size,
        "background": template.background.url if template.background else "",
        "background_color": template.background_color or "#0d9488",
        "wish": template.wish or "",
        "layout": template.effective_layout,
        "preset": template.preset or "celebration",
        "updated_at": template.updated_at,
    }


def options_payload():
    return {
        "audiences": [{"value": v, "label": l} for v, l in AUDIENCE_CHOICES],
        "fields": [{"value": v, "label": l} for v, l in BIRTHDAY_FIELDS],
        "images": [{"value": v, "label": l} for v, l in IMAGE_SOURCES],
        "fonts": [{"value": v, "label": l} for v, l in FONT_CHOICES],
        "kinds": KINDS,
        "weights": WEIGHTS,
        "alignments": ALIGNMENTS,
        "transforms": TRANSFORMS,
        "fits": FITS,
        "shapes": SHAPES,
        "formats": [
            {"value": k, "label": v["label"], "width": v["w"], "height": v["h"],
             "scale": v["scale"]}
            for k, v in FORMATS.items()
        ],
        "presets": [
            {
                "value": key,
                "label": label,
                "format": preset_format(key),
                "layout": default_layout(key),
            }
            for key, label in PRESET_CHOICES
        ],
        "placeholders": WISH_PLACEHOLDERS,
        "default_wish": DEFAULT_WISH,
        "element_default": ELEMENT_DEFAULT,
        "max_wish": MAX_WISH_CHARS,
    }


class BirthdayTemplateView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
    )

    def _owned(self, request, template_id):
        """A row the caller is allowed to touch.

        The authenticator only checks the `school` it can SEE — a query
        parameter. On a PUT the id arrives in the body, so the school is taken
        from the row and checked here instead. Without this an admin could edit
        another school's card by guessing an integer.
        """
        template = BirthdayTemplate.objects.filter(id=template_id).first()
        if not template:
            return None, self.RESPONSE__NOT_FOUND
        role = getattr(request, "user_role", None)
        if role == "superadmin":
            return template, None
        authenticator = self.get_authenticators()[0]
        for auth in self.get_authenticators():
            if getattr(auth, "role", None) == role:
                authenticator = auth
                break
        if not authenticator.belongs_to_school(request.user, template.school_id):
            return None, self.RESPONSE__NOT_FOUND
        return template, None

    def get(self, request):
        school_id = request.query_params.get("school")
        audience = request.query_params.get("audience") or "student"
        if not school_id or audience not in AUDIENCES:
            return self.RESPONSE__INVALID_REQUEST
        rows = BirthdayTemplate.objects.filter(school_id=school_id, audience=audience)
        templates = [serialize(t) for t in rows]
        return Response({
            "school": int(school_id),
            "audience": audience,
            "templates": templates,
            "active": next((t for t in templates if t["is_active"]), None),
            "options": options_payload(),
        })

    def post(self, request):
        school_id = request.data.get("school")
        audience = request.data.get("audience") or "student"
        if not school_id or audience not in AUDIENCES:
            return self.RESPONSE__INVALID_REQUEST
        # The school arrives in the BODY here, which the authenticator never
        # inspected — so it is checked explicitly.
        role = getattr(request, "user_role", None)
        if role != "superadmin":
            authenticator = next(
                (a for a in self.get_authenticators() if getattr(a, "role", None) == role),
                self.get_authenticators()[0],
            )
            if not authenticator.belongs_to_school(request.user, school_id):
                return self.RESPONSE__NOT_FOUND
        if not SchoolAdmin.objects.filter(id=school_id).exists():
            return self.RESPONSE__NOT_FOUND
        if BirthdayTemplate.objects.filter(
            school_id=school_id, audience=audience
        ).count() >= MAX_TEMPLATES_PER_AUDIENCE:
            return Response(
                {"message": f"You can keep {MAX_TEMPLATES_PER_AUDIENCE} designs per audience."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source_id = request.data.get("duplicate")
        if source_id:
            source = BirthdayTemplate.objects.filter(
                id=source_id, school_id=school_id
            ).first()
            if not source:
                return self.RESPONSE__NOT_FOUND
            template = BirthdayTemplate.objects.create(
                school_id=school_id, audience=source.audience,
                name=f"{source.name} (copy)"[:60], is_active=False,
                card_format=source.card_format, background=source.background,
                background_color=source.background_color, wish=source.wish,
                layout=source.layout, preset=source.preset,
            )
            return Response({"message": "Card duplicated!", "template": serialize(template)})

        preset = request.data.get("preset")
        preset = preset if preset in PRESET_KEYS else "celebration"
        template = BirthdayTemplate.objects.create(
            school_id=school_id, audience=audience,
            name=(request.data.get("name") or "New card")[:60],
            is_active=False,
            card_format=preset_format(preset),
            wish=DEFAULT_WISH,
            layout=default_layout(preset),
            preset=preset,
        )
        return Response({"message": "Card created!", "template": serialize(template)})

    def put(self, request):
        template_id = request.data.get("id")
        if not template_id:
            return self.RESPONSE__INVALID_REQUEST
        template, refusal = self._owned(request, template_id)
        if refusal:
            return refusal

        data = request.data
        if "name" in data:
            template.name = (data.get("name") or "Untitled card")[:60]
        if "audience" in data and data.get("audience") in AUDIENCES:
            template.audience = data["audience"]
        if "card_format" in data and data.get("card_format") in FORMAT_KEYS:
            template.card_format = data["card_format"]
        if "background_color" in data:
            template.background_color = (data.get("background_color") or "#0d9488")[:9]
        if "wish" in data:
            template.wish = (data.get("wish") or "")[:MAX_WISH_CHARS]
        if "preset" in data and data.get("preset") in PRESET_KEYS:
            template.preset = data["preset"]
        if "layout" in data:
            template.layout = sanitize_layout(data.get("layout"))

        activate = data.get("is_active")
        with transaction.atomic():
            if activate is not None and bool(activate) != template.is_active:
                if activate:
                    BirthdayTemplate.objects.filter(
                        school_id=template.school_id, audience=template.audience,
                        is_active=True,
                    ).exclude(id=template.id).update(is_active=False)
                template.is_active = bool(activate)
            template.save()
        return Response({"message": "Card saved!", "template": serialize(template)})

    def delete(self, request):
        template_id = request.query_params.get("id") or request.data.get("id")
        if not template_id:
            return self.RESPONSE__INVALID_REQUEST
        template, refusal = self._owned(request, template_id)
        if refusal:
            return refusal
        template.delete()
        return Response({"message": "Card deleted!"})


class BirthdayTemplateBackgroundView(BirthdayTemplateView):
    """The artwork a birthday card is drawn over.

    Its own endpoint, and its own parser, for the same reason as the ID card's:
    the rest of the editor is JSON, and folding a file into it would make every
    layout save a multipart upload.
    """

    parser_classes = (MultiPartParser, FormParser)
    MAX_BYTES = 6 * 1024 * 1024

    def get(self, request):
        return self.RESPONSE__NOT_ALLOWED

    def post(self, request):
        return self.RESPONSE__NOT_ALLOWED

    def delete(self, request):
        return self.RESPONSE__NOT_ALLOWED

    def put(self, request):
        template_id = request.data.get("id")
        if not template_id:
            return self.RESPONSE__INVALID_REQUEST
        template, refusal = self._owned(request, template_id)
        if refusal:
            return refusal

        image = request.FILES.get("background")
        if image is None:
            template.background = None
            template.save(update_fields=["background", "updated_at"])
            return Response({"message": "Background removed!", "template": serialize(template)})
        if image.size > self.MAX_BYTES:
            return Response(
                {"message": "That image is larger than 6MB. Please use a smaller file."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        template.background = image
        template.save(update_fields=["background", "updated_at"])
        return Response({"message": "Background saved!", "template": serialize(template)})
