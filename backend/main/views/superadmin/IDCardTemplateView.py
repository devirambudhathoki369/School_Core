"""Per-school ID-card designs, drawn by the superadmin.

  GET    /api/idcard-templates?school=X&card_type=student   (any logged-in user)
         The ACTIVE design for that school and card type, or `template: null`
         when the school has never been designed for. Null is meaningful: the
         card generator falls back to the layout it has always drawn, so a
         school that is never opened in the designer keeps its current card.

  GET    /api/manage/idcard-templates                       (superadmin)
         Every school, every one of its templates, plus the option catalogue
         (fields, fonts, weights, presets) so the designer never keeps its own
         copy of these and drifts out of step with the sanitizer.

  POST   /api/manage/idcard-templates                       (superadmin)
         Create a template. `duplicate` clones an existing one instead.

  PUT    /api/manage/idcard-templates                       (superadmin)
         Save one template. Activating one deactivates its siblings.

  DELETE /api/manage/idcard-templates?id=N                  (superadmin)

  PUT    /api/manage/idcard-templates/background            (superadmin)
         Upload (or clear) the artwork the fields are placed over. Its own
         endpoint because it is multipart and the rest of the editor is JSON —
         mixing the two would force every layout save to be a file upload.
"""

from django.db import transaction
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework import status

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)
from ..BaseViews import SecuredAPIView
from ...models.SchoolAdmin import SchoolAdmin
from ...models.superadmin.IDCardTemplate import IDCardTemplate, CARD_TYPES, CARD_TYPE_CHOICES
from ...constants.idcard_layout import (
    STUDENT_FIELDS, STAFF_FIELDS, IMAGE_SOURCES, FONT_CHOICES, WEIGHTS,
    ALIGNMENTS, TRANSFORMS, FITS, SHAPES, ORIENTATIONS, KINDS,
    PRESET_CHOICES, PRESET_KEYS, ELEMENT_DEFAULT,
    default_layout, sanitize_layout, card_size,
)

# The number of designs one school may hold per card type. Not a licence limit —
# a guard against the "duplicate" button being leaned on until the editor's own
# template list is unusable.
MAX_TEMPLATES_PER_TYPE = 20


def serialize(template):
    if not template:
        return None
    return {
        "id": template.id,
        "school": template.school_id,
        "card_type": template.card_type,
        "name": template.name,
        "is_active": template.is_active,
        "orientation": template.safe_orientation,
        "size": template.size,
        "background": template.background.url if template.background else "",
        "background_back": template.background_back.url if template.background_back else "",
        "background_color": template.background_color or "#ffffff",
        "layout": template.effective_layout,
        "layout_back": template.effective_layout_back,
        "preset": template.preset or "classic",
        "updated_at": template.updated_at,
    }


class IDCardTemplateView(SecuredAPIView):
    """The active design, for whoever is about to print cards."""

    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )

    def get(self, request):
        school_id = request.query_params.get("school")
        card_type = request.query_params.get("card_type") or "student"
        if not school_id or card_type not in CARD_TYPES:
            return self.RESPONSE__INVALID_REQUEST
        template = IDCardTemplate.objects.filter(
            school_id=school_id, card_type=card_type, is_active=True
        ).first()
        # `null`, deliberately — see the module docstring. The frontend reads
        # this as "draw the built-in card".
        return Response({
            "school": int(school_id),
            "card_type": card_type,
            "template": serialize(template),
        })


class ManageIDCardTemplatesView(SecuredAPIView):
    """Superadmin: the designer's whole world."""

    authentication_classes = (SuperAdminTokenAuthentication,)

    # ---- the catalogue the designer builds its controls from ----------------
    def options_payload(self):
        return {
            "card_types": [{"value": v, "label": l} for v, l in CARD_TYPE_CHOICES],
            "fields": {
                "student": [{"value": v, "label": l} for v, l in STUDENT_FIELDS],
                "staff": [{"value": v, "label": l} for v, l in STAFF_FIELDS],
            },
            "images": [{"value": v, "label": l} for v, l in IMAGE_SOURCES],
            "fonts": [{"value": v, "label": l} for v, l in FONT_CHOICES],
            "kinds": KINDS,
            "weights": WEIGHTS,
            "alignments": ALIGNMENTS,
            "transforms": TRANSFORMS,
            "fits": FITS,
            "shapes": SHAPES,
            "orientations": ORIENTATIONS,
            "sizes": {o: dict(zip(("width", "height"), card_size(o))) for o in ORIENTATIONS},
            # Presets ship their layout so the designer can preview one, and
            # reset to it, without another round trip.
            "presets": [
                {
                    "value": key,
                    "label": label,
                    "layout": {
                        ct: default_layout(key, ct) for ct in CARD_TYPES
                    },
                }
                for key, label in PRESET_CHOICES
            ],
            # The blank element the "add" button starts from, so the frontend
            # cannot invent a shape the sanitizer would then clamp differently.
            "element_default": ELEMENT_DEFAULT,
        }

    def get(self, request):
        templates = {}
        for t in IDCardTemplate.objects.all().select_related(None):
            templates.setdefault(t.school_id, []).append(serialize(t))
        schools = SchoolAdmin.objects.filter(is_active=True).values(
            "id", "name", "logo", "sign", "address", "contact",
        ).order_by("name")
        return Response({
            "schools": [
                {
                    "id": s["id"],
                    "name": s["name"],
                    # The school's real logo and signature ride along so the
                    # preview places the actual artwork rather than a grey box.
                    "profile": {
                        "logo": s["logo"], "sign": s["sign"],
                        "address": s["address"], "contact": s["contact"],
                    },
                    "templates": templates.get(s["id"], []),
                }
                for s in schools
            ],
            "options": self.options_payload(),
        })

    # ---- create / duplicate -------------------------------------------------
    def post(self, request):
        school_id = request.data.get("school")
        card_type = request.data.get("card_type") or "student"
        if not school_id or card_type not in CARD_TYPES:
            return self.RESPONSE__INVALID_REQUEST
        if not SchoolAdmin.objects.filter(id=school_id).exists():
            return self.RESPONSE__NOT_FOUND
        if IDCardTemplate.objects.filter(
            school_id=school_id, card_type=card_type
        ).count() >= MAX_TEMPLATES_PER_TYPE:
            return Response(
                {"message": f"A school may hold {MAX_TEMPLATES_PER_TYPE} designs per card type."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source_id = request.data.get("duplicate")
        if source_id:
            source = IDCardTemplate.objects.filter(
                id=source_id, school_id=school_id
            ).first()
            if not source:
                return self.RESPONSE__NOT_FOUND
            template = IDCardTemplate.objects.create(
                school_id=school_id,
                card_type=source.card_type,
                name=f"{source.name} (copy)"[:60],
                # A copy is never born active — that would silently swap the
                # design a school is printing the moment someone clicks
                # duplicate.
                is_active=False,
                orientation=source.orientation,
                background=source.background,
                background_back=source.background_back,
                background_color=source.background_color,
                layout=source.layout,
                layout_back=source.layout_back,
                preset=source.preset,
            )
            return Response({"message": "Design duplicated!", "template": serialize(template)})

        preset = request.data.get("preset")
        preset = preset if preset in PRESET_KEYS else "classic"
        template = IDCardTemplate.objects.create(
            school_id=school_id,
            card_type=card_type,
            name=(request.data.get("name") or "New design")[:60],
            is_active=False,
            orientation=request.data.get("orientation") if request.data.get("orientation") in ORIENTATIONS else "portrait",
            layout=default_layout(preset, card_type),
            preset=preset,
        )
        return Response({"message": "Design created!", "template": serialize(template)})

    # ---- save ---------------------------------------------------------------
    def put(self, request):
        template_id = request.data.get("id")
        if not template_id:
            return self.RESPONSE__INVALID_REQUEST
        template = IDCardTemplate.objects.filter(id=template_id).first()
        if not template:
            return self.RESPONSE__NOT_FOUND

        data = request.data
        if "name" in data:
            template.name = (data.get("name") or "Untitled design")[:60]
        if "card_type" in data and data.get("card_type") in CARD_TYPES:
            template.card_type = data["card_type"]
        if "orientation" in data and data.get("orientation") in ORIENTATIONS:
            template.orientation = data["orientation"]
        if "background_color" in data:
            template.background_color = (data.get("background_color") or "#ffffff")[:9]
        if "preset" in data and data.get("preset") in PRESET_KEYS:
            template.preset = data["preset"]
        # Sanitised on the way in as well as on the way out. The designer is a
        # drag surface — a half-finished drag, a browser that rounded a float,
        # or an older tab still posting last release's shape all arrive here.
        if "layout" in data:
            template.layout = sanitize_layout(data.get("layout"))
        if "layout_back" in data:
            template.layout_back = sanitize_layout(data.get("layout_back"))

        activate = data.get("is_active")
        with transaction.atomic():
            if activate is not None and bool(activate) != template.is_active:
                if activate:
                    # The database holds a partial unique constraint, so the
                    # siblings must be stood down in the SAME transaction or the
                    # save fails. Doing it here rather than in a signal keeps the
                    # whole rule readable in one place.
                    IDCardTemplate.objects.filter(
                        school_id=template.school_id, card_type=template.card_type,
                        is_active=True,
                    ).exclude(id=template.id).update(is_active=False)
                template.is_active = bool(activate)
            template.save()
        return Response({"message": "Design saved!", "template": serialize(template)})

    def delete(self, request):
        template_id = request.query_params.get("id") or request.data.get("id")
        if not template_id:
            return self.RESPONSE__INVALID_REQUEST
        template = IDCardTemplate.objects.filter(id=template_id).first()
        if not template:
            return self.RESPONSE__NOT_FOUND
        was_active = template.is_active
        template.delete()
        return Response({
            "message": "Design deleted!",
            # Worth saying out loud: deleting the ACTIVE design silently returns
            # that school to the built-in card, and the operator should know
            # that is what just happened.
            "reverted_to_builtin": was_active,
        })


class IDCardTemplateBackgroundView(SecuredAPIView):
    """Superadmin: the artwork a design is drawn over."""

    authentication_classes = (SuperAdminTokenAuthentication,)
    parser_classes = (MultiPartParser, FormParser)

    # A card background is a single image at print resolution — 600x900 for a
    # portrait card. Anything much past this is a photo somebody dragged in by
    # mistake, and it would be embedded in every one of a thousand exported
    # cards.
    MAX_BYTES = 6 * 1024 * 1024

    def put(self, request):
        template_id = request.data.get("id")
        side = request.data.get("side") or "front"
        if not template_id or side not in ("front", "back"):
            return self.RESPONSE__INVALID_REQUEST
        template = IDCardTemplate.objects.filter(id=template_id).first()
        if not template:
            return self.RESPONSE__NOT_FOUND

        field = "background" if side == "front" else "background_back"
        image = request.FILES.get("background")
        if image is None:
            # No file on a PUT means "remove the artwork", which is the only way
            # back to a plain card once one has been set.
            setattr(template, field, None)
            template.save(update_fields=[field, "updated_at"])
            return Response({"message": "Background removed!", "template": serialize(template)})

        if image.size > self.MAX_BYTES:
            return Response(
                {"message": "That image is larger than 6MB. Please use a smaller file."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        setattr(template, field, image)
        template.save(update_fields=[field, "updated_at"])
        return Response({"message": "Background saved!", "template": serialize(template)})
