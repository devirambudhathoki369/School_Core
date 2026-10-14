"""The parts a printed document is built from, and the presets that arrange them.

A theme is DATA, not code. A designer changing a preset here changes what every
school can pick without a frontend release, and a school that has customised its
layout keeps that customisation because its own rows live in DocumentStyle.

Every element is addressable on its own — that is what lets one school set the
school name in a display serif while the address stays small and grey, and what
lets an element be removed from a sheet entirely without a code change.
"""

# --- the addressable parts of a document's identity block -------------------
# Order here is the DEFAULT reading order; a school can reorder them freely.
ELEMENTS = [
    ("logo", "School logo"),
    ("motto", "Motto / tagline"),
    ("school_name", "School name"),
    ("address", "Address"),
    ("estd", "Established year"),
    ("contact", "Phone & email"),
    ("document_title", "Document title"),
    ("student_info", "Student details block"),
    ("marks_table", "Marks table"),
    ("grading_guide", "Grading guide"),
    ("remarks", "Remarks line"),
    ("signatures", "Signatures"),
]
ELEMENT_KEYS = [key for key, _ in ELEMENTS]

# Elements a document cannot be printed without. They can be restyled and
# reordered, but not deleted — a grade-sheet with no marks table is not a
# document, it is a mistake waiting to be printed a thousand times.
REQUIRED_ELEMENTS = {"school_name", "document_title", "marks_table"}

FONT_CHOICES = [
    ("inherit", "Same as the document"),
    ("serif", "Serif — traditional"),
    ("sans", "Sans — clean"),
    ("display", "Display — formal headings"),
    ("slab", "Slab serif — bold & sturdy"),
    ("condensed", "Condensed — narrow, fits more"),
    ("script", "Script — flowing, for names"),
    ("mono", "Monospace"),
]
FONT_KEYS = [k for k, _ in FONT_CHOICES]

WEIGHTS = ["normal", "semibold", "bold", "black"]
ALIGNMENTS = ["left", "center", "right"]
TRANSFORMS = ["none", "uppercase", "capitalize"]
# Letter-spacing (tracking). Widely-spaced small caps are the single most
# effective "certificate" typographic move, so it earns its own control.
TRACKINGS = ["tight", "normal", "wide", "wider", "widest"]

# The frame around the whole sheet, and the lines inside the marks table. Both
# are their own choice so a school can pair, say, an ornate frame with a quiet
# table — the two rarely want the same weight.
BORDER_CHOICES = [
    ("theme", "Match the theme"),
    ("none", "No border"),
    ("simple", "Thin line"),
    ("bold", "Bold line"),
    ("double", "Double line"),
    ("dashed", "Dashed"),
    ("dotted", "Dotted"),
    ("groove", "Groove (engraved)"),
    ("ridge", "Ridge (raised)"),
    ("shadow", "Soft shadow frame"),
    ("ornate", "Ornate frame"),
    ("ornate-corners", "Ornate + corner marks"),
    ("rounded", "Rounded"),
]
BORDER_KEYS = [k for k, _ in BORDER_CHOICES]

TABLE_BORDER_CHOICES = [
    ("all", "Full grid"),
    ("rows", "Rows only"),
    ("minimal", "Header underline"),
    ("none", "No lines"),
]
TABLE_BORDER_KEYS = [k for k, _ in TABLE_BORDER_CHOICES]

# A divider drawn between the masthead and the body.
HEADER_RULE_CHOICES = [
    ("none", "None"),
    ("line", "Thin line"),
    ("thick", "Thick accent bar"),
    ("double", "Double line"),
    ("dashed", "Dashed"),
]
HEADER_RULE_KEYS = [k for k, _ in HEADER_RULE_CHOICES]

# Per-element defaults. `size` is a MULTIPLIER of the element's natural size for
# the same reason the document scale is: these sheets carry a tuned hierarchy and
# an absolute point size per element would flatten it.
ELEMENT_DEFAULT = {
    "visible": True,
    "font": "inherit",
    "size": 100,
    "weight": "normal",
    "align": "center",
    "color": "",          # empty = inherit the document's colour
    "transform": "none",
    "tracking": "normal",
    "italic": False,
    "underline": False,
}


def _el(key, **overrides):
    return {"key": key, **ELEMENT_DEFAULT, **overrides}


def _layout(*elements):
    """A full layout: the given elements in order, then every element not
    mentioned appended at its default. New elements added to ELEMENTS in a later
    release therefore appear on existing presets instead of vanishing."""
    named = {e["key"] for e in elements}
    return list(elements) + [_el(k) for k in ELEMENT_KEYS if k not in named]


# --- the presets ------------------------------------------------------------
# Five genuinely different documents, not one document in five colours: they
# differ in weight, case, rhythm and how loudly the school's name is set.
THEME_PRESETS = {
    "classic": {
        "label": "Classic",
        "blurb": "Heavy double border, centred masthead — the traditional Nepali marksheet.",
        "font_family": "serif",
        "accent_color": "#000000",
        "layout": _layout(
            _el("logo"),
            _el("motto", size=85, transform="none"),
            _el("school_name", size=170, weight="bold", transform="uppercase"),
            _el("address", size=90),
            _el("estd", size=85),
            _el("contact", size=85),
            _el("document_title", size=125, weight="bold", transform="uppercase"),
        ),
    },
    "formal": {
        "label": "Formal",
        "blurb": "Display serif name, generous spacing, quiet supporting text — for certificates.",
        "font_family": "serif",
        "accent_color": "#1e3a5f",
        "layout": _layout(
            _el("logo"),
            _el("school_name", font="display", size=200, weight="bold", transform="capitalize"),
            _el("motto", size=90),
            _el("address", size=85, color="#555555"),
            _el("contact", size=80, color="#555555"),
            _el("estd", size=80, color="#555555"),
            _el("document_title", size=135, weight="semibold", transform="uppercase"),
        ),
    },
    "modern": {
        "label": "Modern",
        "blurb": "Sans throughout, left-aligned masthead, single accent rule.",
        "font_family": "sans",
        "accent_color": "#0f766e",
        "layout": _layout(
            _el("logo", align="left"),
            _el("school_name", size=165, weight="bold", align="left"),
            _el("address", size=85, align="left", color="#666666"),
            _el("contact", size=85, align="left", color="#666666"),
            _el("motto", visible=False),
            _el("estd", visible=False),
            _el("document_title", size=120, weight="semibold", align="left", transform="uppercase"),
        ),
    },
    "elegant": {
        "label": "Elegant",
        "blurb": "Letter-spaced small caps, hairline rules, restrained colour.",
        "font_family": "serif",
        "accent_color": "#7c2d12",
        "layout": _layout(
            _el("motto", size=80, transform="uppercase"),
            _el("logo"),
            _el("school_name", font="display", size=180, weight="semibold", transform="uppercase"),
            _el("address", size=85),
            _el("estd", size=80),
            _el("contact", visible=False),
            _el("document_title", size=115, weight="normal", transform="uppercase"),
        ),
    },
    "royal": {
        "label": "Royal",
        "blurb": "Ornate double frame, deep accent, display name — for prize certificates.",
        "font_family": "display",
        "accent_color": "#7c1d3f",
        "border_style": "ornate",
        "table_border": "rows",
        "layout": _layout(
            _el("motto", size=85, transform="uppercase", color="#7c1d3f"),
            _el("logo", size=115),
            _el("school_name", font="display", size=210, weight="bold", transform="uppercase", color="#7c1d3f"),
            _el("address", size=88),
            _el("estd", size=82),
            _el("contact", size=82),
            _el("document_title", size=140, weight="bold", transform="uppercase", color="#7c1d3f"),
        ),
    },
    "vintage": {
        "label": "Vintage",
        "blurb": "Warm serif, hairline double rule, understated — reads like an old testimonial.",
        "font_family": "serif",
        "accent_color": "#5b3a1a",
        "border_style": "double",
        "table_border": "minimal",
        "layout": _layout(
            _el("logo", size=90),
            _el("motto", size=82, transform="capitalize", color="#5b3a1a"),
            _el("school_name", font="serif", size=185, weight="bold", transform="uppercase", color="#5b3a1a"),
            _el("address", size=85),
            _el("estd", size=80),
            _el("contact", size=80),
            _el("document_title", size=120, weight="semibold", transform="uppercase", color="#5b3a1a"),
        ),
    },
    "compact": {
        "label": "Compact",
        "blurb": "Everything smaller and tighter — fits a long marks table on one sheet.",
        "font_family": "sans",
        "accent_color": "#111827",
        "layout": _layout(
            _el("logo", size=70),
            _el("school_name", size=130, weight="bold", transform="uppercase"),
            _el("address", size=75),
            _el("contact", size=75),
            _el("motto", visible=False),
            _el("estd", visible=False),
            _el("document_title", size=105, weight="bold", transform="uppercase"),
        ),
    },
}
THEME_KEYS = list(THEME_PRESETS.keys())
THEME_CHOICES = [(k, v["label"]) for k, v in THEME_PRESETS.items()]


def default_layout(theme="classic"):
    preset = THEME_PRESETS.get(theme) or THEME_PRESETS["classic"]
    # A copy — a caller editing what it gets back must never mutate the preset
    # every other school reads from.
    return [dict(e) for e in preset["layout"]]


def theme_defaults(theme):
    """The border / table-border a preset ships with. Presets that don't name
    them get 'theme' (draw the border the theme's CSS class implies) and 'all'
    (the traditional full grid)."""
    preset = THEME_PRESETS.get(theme) or THEME_PRESETS["classic"]
    return {
        "border_style": preset.get("border_style", "theme"),
        "table_border": preset.get("table_border", "all"),
    }


def sanitize_layout(layout):
    """Coerce whatever arrives into a layout that can be rendered.

    Unknown keys are dropped, missing ones appended, and every field clamped to
    something drawable — a saved layout has to survive an older frontend, a
    hand-edited row, and a half-finished drag.
    """
    if not isinstance(layout, list):
        return default_layout()
    cleaned, seen = [], set()
    for item in layout:
        if not isinstance(item, dict):
            continue
        key = item.get("key")
        if key not in ELEMENT_KEYS or key in seen:
            continue
        seen.add(key)
        size = item.get("size", 100)
        try:
            size = max(50, min(300, int(size)))
        except (TypeError, ValueError):
            size = 100
        visible = bool(item.get("visible", True))
        cleaned.append({
            "key": key,
            # A required element stays on the sheet however it was saved.
            "visible": True if key in REQUIRED_ELEMENTS else visible,
            "font": item.get("font") if item.get("font") in FONT_KEYS else "inherit",
            "size": size,
            "weight": item.get("weight") if item.get("weight") in WEIGHTS else "normal",
            "align": item.get("align") if item.get("align") in ALIGNMENTS else "center",
            "color": (item.get("color") or "")[:9],
            "transform": item.get("transform") if item.get("transform") in TRANSFORMS else "none",
            "tracking": item.get("tracking") if item.get("tracking") in TRACKINGS else "normal",
            "italic": bool(item.get("italic")),
            "underline": bool(item.get("underline")),
        })
    cleaned.extend(_el(k) for k in ELEMENT_KEYS if k not in seen)
    return cleaned
