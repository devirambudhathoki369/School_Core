"""Per-school styling for printed documents.

  GET  /api/document-styles                     (superadmin)
       every school with its style, for the school list.

  GET  /api/document-styles?school=X            (any logged-in user)
       one school's effective style. Always answers — a school with no row
       gets the defaults — so a document never has to handle "not configured".

  PUT  /api/document-styles                     (superadmin)
       upsert one school's style.
"""

from rest_framework.response import Response
from rest_framework import status

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)
from ..BaseViews import SecuredAPIView
from ...models.SchoolAdmin import SchoolAdmin
from ...models.superadmin.DocumentStyle import (
    DocumentStyle, DOCUMENT_CHOICES, DOCUMENT_KEYS, FONT_CHOICES, THEME_CLASSIC,
)
from ...constants.document_layout import (
    THEME_PRESETS, THEME_KEYS, ELEMENTS, REQUIRED_ELEMENTS,
    FONT_CHOICES as ELEMENT_FONT_CHOICES, WEIGHTS, ALIGNMENTS, TRANSFORMS, TRACKINGS,
    BORDER_CHOICES, BORDER_KEYS, TABLE_BORDER_CHOICES, TABLE_BORDER_KEYS,
    HEADER_RULE_CHOICES, HEADER_RULE_KEYS,
    default_layout, sanitize_layout, theme_defaults,
)

DEFAULTS = {
    "theme": THEME_CLASSIC,
    "font_family": "serif",
    "font_scale": 100,
    "accent_color": "#000000",
    "show_watermark": True,
    "border_style": "theme",
    "table_border": "all",
    "background_tint": "",
    "header_rule": "none",
    "applies_to": [],
}


def serialize(style):
    """A style row as the frontend wants it — or the defaults when there is no
    row, so the caller never has to special-case an unstyled school."""
    if not style:
        return {
            **DEFAULTS,
            # Always a full layout, never null: a document should render from
            # what it is given without deciding what an absent layout means.
            "layout": default_layout(THEME_CLASSIC),
            "customised": False,
            "configured": False,
        }
    return {
        "theme": style.safe_theme,
        "font_family": style.font_family,
        "font_scale": style.safe_font_scale,
        "accent_color": style.accent_color,
        "show_watermark": style.show_watermark,
        "border_style": style.safe_border,
        "table_border": style.safe_table_border,
        "background_tint": style.background_tint or "",
        "header_rule": style.header_rule if style.header_rule in HEADER_RULE_KEYS else "none",
        "applies_to": [k for k in (style.applies_to or []) if k in DOCUMENT_KEYS],
        "layout": style.effective_layout,
        # Tells the editor whether this school is following the preset or has
        # its own arrangement, so "reset to the theme" can be offered honestly.
        "customised": bool(style.layout),
        "configured": True,
    }


class DocumentStyleView(SecuredAPIView):
    """Read a school's effective document style."""

    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )

    def get(self, request):
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        style = DocumentStyle.objects.filter(school_id=school_id).first()
        return Response({"school": int(school_id), "style": serialize(style)})


class ManageDocumentStylesView(SecuredAPIView):
    """Superadmin: list every school's style, and save one."""

    authentication_classes = (SuperAdminTokenAuthentication,)

    def get(self, request):
        styles = {s.school_id: s for s in DocumentStyle.objects.all()}
        # The real identity fields ride along so the preview shows the school's
        # OWN logo, name and motto — a preview drawn with placeholder text is a
        # weaker preview, and the logo especially has to be seen to be placed.
        schools = SchoolAdmin.objects.filter(is_active=True).values(
            "id", "name", "logo", "slogan", "address", "estd_date", "contact", "email",
        ).order_by("name")
        return Response({
            "schools": [
                {
                    "id": s["id"], "name": s["name"],
                    "profile": {
                        "logo": s["logo"], "motto": s["slogan"], "address": s["address"],
                        "estd": str(s["estd_date"]).split("-")[0] if s["estd_date"] else "",
                        "contact": s["contact"], "email": s["email"],
                    },
                    "style": serialize(styles.get(s["id"])),
                }
                for s in schools
            ],
            # Sent with the list so the UI never hard-codes a copy of these and
            # drifts out of step with the backend.
            "options": {
                # Presets carry their own layout so the editor can preview a
                # theme, and reset to it, without another round trip.
                "themes": [
                    {
                        "value": key,
                        "label": preset["label"],
                        "blurb": preset["blurb"],
                        "font_family": preset["font_family"],
                        "accent_color": preset["accent_color"],
                        **theme_defaults(key),
                        "layout": default_layout(key),
                    }
                    for key, preset in THEME_PRESETS.items()
                ],
                "fonts": [{"value": v, "label": l} for v, l in FONT_CHOICES],
                "documents": [{"value": v, "label": l} for v, l in DOCUMENT_CHOICES],
                "elements": [
                    {"value": k, "label": l, "required": k in REQUIRED_ELEMENTS}
                    for k, l in ELEMENTS
                ],
                "element_fonts": [{"value": v, "label": l} for v, l in ELEMENT_FONT_CHOICES],
                "weights": WEIGHTS,
                "alignments": ALIGNMENTS,
                "transforms": TRANSFORMS,
                "trackings": TRACKINGS,
                "borders": [{"value": v, "label": l} for v, l in BORDER_CHOICES],
                "table_borders": [{"value": v, "label": l} for v, l in TABLE_BORDER_CHOICES],
                "header_rules": [{"value": v, "label": l} for v, l in HEADER_RULE_CHOICES],
            },
        })

    def put(self, request):
        school_id = request.data.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        if not SchoolAdmin.objects.filter(id=school_id).exists():
            return self.RESPONSE__NOT_FOUND

        data = request.data
        valid_themes = set(THEME_KEYS)
        valid_fonts = {v for v, _ in FONT_CHOICES}

        theme = data.get("theme") or THEME_CLASSIC
        font_family = data.get("font_family") or "serif"
        if theme not in valid_themes or font_family not in valid_fonts:
            return self.RESPONSE__INVALID_REQUEST
        try:
            # Clamped rather than rejected: a slider that can be dragged past the
            # limit should still save something printable.
            font_scale = max(70, min(150, int(data.get("font_scale") or 100)))
        except (TypeError, ValueError):
            return self.RESPONSE__INVALID_REQUEST
        # Unknown document keys are dropped, not refused, so a UI that is a
        # version behind cannot fail to save.
        applies_to = [k for k in (data.get("applies_to") or []) if k in DOCUMENT_KEYS]
        border_style = data.get("border_style") if data.get("border_style") in BORDER_KEYS else "theme"
        table_border = data.get("table_border") if data.get("table_border") in TABLE_BORDER_KEYS else "all"
        header_rule = data.get("header_rule") if data.get("header_rule") in HEADER_RULE_KEYS else "none"
        # An empty layout is stored as empty, NOT as the preset expanded out:
        # that is what keeps a school following its theme so a later improvement
        # to the preset reaches it. Only a real customisation is written down.
        raw_layout = data.get("layout")
        layout = sanitize_layout(raw_layout) if raw_layout else []

        style, _ = DocumentStyle.objects.update_or_create(
            school_id=school_id,
            defaults={
                "theme": theme,
                "font_family": font_family,
                "font_scale": font_scale,
                "accent_color": (data.get("accent_color") or "#000000")[:9],
                "show_watermark": bool(data.get("show_watermark", True)),
                "applies_to": applies_to,
                "border_style": border_style,
                "table_border": table_border,
                "background_tint": (data.get("background_tint") or "")[:9],
                "header_rule": header_rule,
                "layout": layout,
            },
        )
        return Response({"message": "Document style saved!", "style": serialize(style)})


class CopyDocumentStyleView(SecuredAPIView):
    """Superadmin: copy one school's whole style onto other schools.

    Everything that defines the look travels — theme, fonts, colours, borders,
    layout, and which documents it applies to — because copying half a style
    would produce a school that looks neither like the source nor like itself.
    The target's own row is replaced (or created); the source is untouched.
    """

    authentication_classes = (SuperAdminTokenAuthentication,)

    COPY_FIELDS = (
        "theme", "font_family", "font_scale", "accent_color", "show_watermark",
        "border_style", "table_border", "background_tint", "header_rule",
        "applies_to", "layout",
    )

    def post(self, request):
        source_id = request.data.get("source")
        targets = request.data.get("targets") or []
        if not source_id or not isinstance(targets, list) or not targets:
            return self.RESPONSE__INVALID_REQUEST
        source = DocumentStyle.objects.filter(school_id=source_id).first()
        if not source:
            # Nothing saved for the source means "the default look" — copying
            # that is just clearing the targets, which we refuse as almost
            # certainly a mistake rather than silently wiping their styles.
            return Response(
                {"message": "The source school has no saved style to copy."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        values = {f: getattr(source, f) for f in self.COPY_FIELDS}
        # never let a school copy onto itself and no-op-thrash its row
        target_ids = [int(t) for t in targets if str(t) != str(source_id)]
        valid_ids = set(
            SchoolAdmin.objects.filter(id__in=target_ids).values_list("id", flat=True)
        )
        copied = 0
        for tid in valid_ids:
            DocumentStyle.objects.update_or_create(school_id=tid, defaults=values)
            copied += 1
        return Response({
            "message": f"Style copied to {copied} school{'' if copied == 1 else 's'}.",
            "copied": copied,
        })
