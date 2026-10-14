"""The parts an ID card is built from, and the presets that arrange them.

WHY THIS IS ABSOLUTE POSITIONING AND `document_layout` IS A STACK
----------------------------------------------------------------
A printed grade-sheet flows: the masthead sits above the marks table, the table
grows with the number of subjects, and the signatures follow whatever height the
table ended up being. Ordering the elements is therefore the only control that
makes sense there.

An ID card does not flow. It is a fixed rectangle — 300x450 at the screen's
150PPI, 600x900 exported at 300 — and the moment a school supplies its own
background artwork, every field has to land in the space that artwork left for
it. A stack cannot express "the name goes in the white band two thirds down,
the photo sits in the oval on the left". So each element here carries its own
box: `x`, `y`, `w`, `h` as PERCENTAGES of the card.

Percentages, not pixels, because the same layout is rendered at three sizes: the
designer's canvas, the 300x450 preview, and the 600x900 export. A pixel geometry
would be correct at exactly one of them.

A template is DATA. A designer adding a preset here gives every school a new
starting point with no frontend release, and a school that has dragged its own
layout keeps it, because its own rows live in IDCardTemplate.
"""

# --- what can be placed on a card -------------------------------------------
# `kind` says how an element is DRAWN; `source` says where its text comes from.
# Splitting them is what lets a school put the same student field on the card
# twice (once as a heading, once small in a corner) and style each separately.
KIND_TEXT = "text"          # a label and/or a field's value
KIND_IMAGE = "image"        # the holder's photo, the school logo, a signature
KIND_QR = "qr"              # links to the public profile page
KIND_BARCODE = "barcode"    # CODE128 of the holder's id
KIND_SHAPE = "shape"        # a filled/outlined box — bands, panels, rules
KINDS = [KIND_TEXT, KIND_IMAGE, KIND_QR, KIND_BARCODE, KIND_SHAPE]

# The fields a TEXT element can read. `static` is the escape hatch: any fixed
# wording the school wants on the card ("Property of the school. If found,
# please return."), which no data field could ever supply.
STUDENT_FIELDS = [
    ("name", "Full name"),
    ("classname", "Class"),
    ("section", "Section"),
    ("roll_no", "Roll number"),
    ("symbol_no", "Symbol number"),
    ("guardian_name", "Guardian name"),
    ("birth_date", "Date of birth"),
    ("blood_group", "Blood group"),
    ("address", "Address"),
    ("contact", "Phone"),
    ("emis", "EMIS number"),
    ("bus_station", "Bus station"),
    ("admission_no", "Admission number"),
    ("validity", "Validity"),
    ("school_name", "School name"),
    ("school_address", "School address"),
    ("school_contact", "School phone"),
    ("static", "Fixed text"),
]
STAFF_FIELDS = [
    ("name", "Full name"),
    ("designation", "Designation"),
    ("staff_role", "Role"),
    ("citizenship_no", "Citizenship number"),
    ("birth_date", "Date of birth"),
    ("blood_group", "Blood group"),
    ("address", "Address"),
    ("contact", "Phone"),
    ("email", "Email"),
    ("joined_date", "Joined date"),
    ("validity", "Validity"),
    ("school_name", "School name"),
    ("school_address", "School address"),
    ("school_contact", "School phone"),
    ("static", "Fixed text"),
]
# The union is what the sanitizer validates against: a template may be switched
# between card types in the designer, and a field that is momentarily wrong for
# the type should be kept (and simply render empty) rather than silently deleted
# out of someone's layout.
FIELD_KEYS = sorted({k for k, _ in STUDENT_FIELDS} | {k for k, _ in STAFF_FIELDS})

IMAGE_SOURCES = [
    ("photo", "Holder's photo"),
    ("logo", "School logo"),
    ("sign", "Authorised signature"),
    ("award_logo", "Award / affiliation logo"),
]
IMAGE_KEYS = [k for k, _ in IMAGE_SOURCES]

# Web-safe / bundled families only. A card is exported as an image from the
# browser that drew it, so anything the browser has to substitute silently
# changes what a thousand printed cards look like.
FONT_CHOICES = [
    ("sans", "Sans — clean and modern"),
    ("serif", "Serif — traditional"),
    ("display", "Display — bold headings"),
    ("condensed", "Condensed — narrow, fits more"),
    ("mono", "Monospace — aligned figures"),
    ("script", "Script — flowing"),
]
FONT_KEYS = [k for k, _ in FONT_CHOICES]

WEIGHTS = ["normal", "medium", "semibold", "bold", "black"]
ALIGNMENTS = ["left", "center", "right"]
TRANSFORMS = ["none", "uppercase", "capitalize", "lowercase"]
FITS = ["cover", "contain"]          # how an image fills its box
SHAPES = ["rect", "rounded", "pill", "circle"]

# How the card is oriented and how big it is. Both are per-template because a
# staff card is often landscape where a student card is portrait.
ORIENTATIONS = ["portrait", "landscape"]

# The design canvas, in CSS pixels at 150PPI. The export doubles both.
CARD_W_PORTRAIT, CARD_H_PORTRAIT = 300, 450
CARD_W_LANDSCAPE, CARD_H_LANDSCAPE = 450, 300


def card_size(orientation):
    if orientation == "landscape":
        return CARD_W_LANDSCAPE, CARD_H_LANDSCAPE
    return CARD_W_PORTRAIT, CARD_H_PORTRAIT


# --- per-element defaults ----------------------------------------------------
# Geometry is in PERCENT of the card, so one layout renders correctly on the
# designer's canvas, the preview and the 2x export alike.
ELEMENT_DEFAULT = {
    "kind": KIND_TEXT,
    "field": "name",
    "label": "",              # drawn before the value ("Class : ")
    "text": "",               # the wording, when field == "static"
    "x": 10.0, "y": 10.0, "w": 80.0, "h": 8.0,
    "font": "sans",
    "size": 12,               # px on the 300x450 canvas; scaled with the card
    "weight": "semibold",
    "align": "left",
    "color": "#111827",
    "transform": "none",
    "italic": False,
    "underline": False,
    "letter_spacing": 0,      # in tenths of a px, so it stays an integer
    "line_height": 120,       # percent
    # image / shape only
    "fit": "cover",
    "shape": "rect",
    "radius": 0,              # percent of the shorter side
    "bg": "",                 # empty = transparent
    "border_color": "",
    "border_width": 0,
    "opacity": 100,
    # A value that is empty for a given holder can either leave a gap or let the
    # rest of the card close up. On an absolutely-positioned card nothing can
    # reflow, so "hide" simply removes it — which is what a school means when it
    # asks for the blood group "only if we have it".
    "hide_when_empty": True,
    "z": 1,
}


def _el(**overrides):
    el = {**ELEMENT_DEFAULT, **overrides}
    # An id is what the designer drags and the properties panel edits. Assigned
    # here so a preset's elements are addressable the moment they are loaded.
    el.setdefault("id", f"{el['kind']}-{el.get('field') or el.get('source') or 'el'}-{el['y']:.0f}")
    return el


# --- presets ----------------------------------------------------------------
# These reproduce the card the app has always drawn, so a school that opens the
# designer for the first time sees what it already prints and can move one thing
# rather than build a card from an empty rectangle.
def _classic_student():
    return [
        _el(id="photo", kind=KIND_IMAGE, field="photo", x=33, y=4, w=34, h=27,
            fit="cover", shape="rect"),
        _el(id="name", kind=KIND_TEXT, field="name", x=5, y=32.5, w=90, h=6,
            size=17, weight="bold", align="center", transform="uppercase"),
        _el(id="classname", kind=KIND_TEXT, field="classname", label="Class",
            x=5, y=40, w=90, h=5, size=12),
        _el(id="guardian", kind=KIND_TEXT, field="guardian_name", label="Guardian",
            x=5, y=45.5, w=90, h=5, size=12),
        _el(id="contact", kind=KIND_TEXT, field="contact", label="Phone",
            x=5, y=51, w=90, h=5, size=12),
        _el(id="address", kind=KIND_TEXT, field="address", label="Address",
            x=5, y=56.5, w=90, h=5, size=12),
        _el(id="blood", kind=KIND_TEXT, field="blood_group", label="Blood Group",
            x=5, y=62, w=90, h=5, size=12),
        _el(id="barcode", kind=KIND_BARCODE, field="", x=5, y=69, w=52, h=6),
        _el(id="validity", kind=KIND_TEXT, field="validity", label="Validity",
            x=58, y=69, w=37, h=5, size=11, align="right"),
        _el(id="qr", kind=KIND_QR, field="", x=10, y=78, w=22, h=15),
        _el(id="sign", kind=KIND_IMAGE, field="sign", x=64, y=78, w=26, h=15,
            fit="contain"),
    ]


def _classic_staff():
    return [
        _el(id="photo", kind=KIND_IMAGE, field="photo", x=33, y=4, w=34, h=27,
            fit="cover", shape="rect"),
        _el(id="name", kind=KIND_TEXT, field="name", x=5, y=32.5, w=90, h=6,
            size=17, weight="bold", align="center", transform="uppercase"),
        _el(id="designation", kind=KIND_TEXT, field="designation", label="Designation",
            x=5, y=40, w=90, h=5, size=12),
        _el(id="contact", kind=KIND_TEXT, field="contact", label="Phone",
            x=5, y=45.5, w=90, h=5, size=12),
        _el(id="address", kind=KIND_TEXT, field="address", label="Address",
            x=5, y=51, w=90, h=5, size=12),
        _el(id="blood", kind=KIND_TEXT, field="blood_group", label="Blood Group",
            x=5, y=56.5, w=90, h=5, size=12),
        _el(id="validity", kind=KIND_TEXT, field="validity", label="Validity",
            x=5, y=69, w=90, h=5, size=11),
        _el(id="qr", kind=KIND_QR, field="", x=10, y=78, w=22, h=15),
        _el(id="sign", kind=KIND_IMAGE, field="sign", x=64, y=78, w=26, h=15,
            fit="contain"),
    ]


def _modern_band_student():
    """A coloured band behind the identity block — the commonest school card and
    the one that most needs absolute positioning to build."""
    return [
        _el(id="band", kind=KIND_SHAPE, field="", x=0, y=0, w=100, h=30,
            bg="#0d9488", z=0),
        _el(id="school", kind=KIND_TEXT, field="school_name", x=4, y=3, w=92, h=6,
            size=13, weight="bold", align="center", color="#ffffff",
            transform="uppercase", letter_spacing=5),
        _el(id="photo", kind=KIND_IMAGE, field="photo", x=34, y=15, w=32, h=24,
            fit="cover", shape="circle", border_color="#ffffff", border_width=3, z=2),
        _el(id="name", kind=KIND_TEXT, field="name", x=5, y=41, w=90, h=6,
            size=16, weight="bold", align="center", transform="uppercase"),
        _el(id="classname", kind=KIND_TEXT, field="classname", x=5, y=47.5, w=90, h=5,
            size=12, align="center", color="#64748b"),
        _el(id="roll", kind=KIND_TEXT, field="roll_no", label="Roll No",
            x=8, y=56, w=84, h=5, size=11),
        _el(id="guardian", kind=KIND_TEXT, field="guardian_name", label="Guardian",
            x=8, y=61, w=84, h=5, size=11),
        _el(id="contact", kind=KIND_TEXT, field="contact", label="Phone",
            x=8, y=66, w=84, h=5, size=11),
        _el(id="address", kind=KIND_TEXT, field="address", label="Address",
            x=8, y=71, w=84, h=5, size=11),
        _el(id="qr", kind=KIND_QR, field="", x=8, y=79, w=18, h=12),
        _el(id="validity", kind=KIND_TEXT, field="validity", label="Valid till",
            x=30, y=82, w=34, h=5, size=10, color="#64748b"),
        _el(id="sign", kind=KIND_IMAGE, field="sign", x=68, y=78, w=24, h=13,
            fit="contain"),
    ]


PRESETS = {
    "classic": {
        "label": "Classic — the card this app has always printed",
        "student": _classic_student,
        "staff": _classic_staff,
    },
    "modern_band": {
        "label": "Modern band — coloured masthead, round photo",
        "student": _modern_band_student,
        "staff": _classic_staff,
    },
}
PRESET_KEYS = list(PRESETS.keys())
PRESET_CHOICES = [(k, v["label"]) for k, v in PRESETS.items()]


def default_layout(preset="classic", card_type="student"):
    """A copy, always — a caller editing what it gets back must never mutate the
    preset every other school reads from."""
    spec = PRESETS.get(preset) or PRESETS["classic"]
    build = spec.get(card_type) or spec["student"]
    return [dict(e) for e in build()]


# --- sanitising -------------------------------------------------------------
def _num(value, lo, hi, fallback):
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return fallback


def _int(value, lo, hi, fallback):
    try:
        return max(lo, min(hi, int(round(float(value)))))
    except (TypeError, ValueError):
        return fallback


def _colour(value, fallback=""):
    """`#rgb`, `#rrggbb` or `#rrggbbaa` only. Anything else is dropped rather
    than passed through — this string is written straight into a style attribute
    on a page that also renders school data."""
    text = (value or "").strip()
    if not text:
        return fallback
    if not text.startswith("#") or len(text) not in (4, 7, 9):
        return fallback
    if not all(c in "0123456789abcdefABCDEF" for c in text[1:]):
        return fallback
    return text


def sanitize_layout(layout, field_keys=None, image_keys=None):
    """Coerce whatever arrives into a layout that can be drawn.

    A saved layout has to survive an older frontend, a hand-edited row, a
    half-finished drag and a template whose card type was switched underneath
    it. Nothing here rejects: every element is clamped into something drawable,
    because the alternative is a card that renders blank at print time for a
    thousand students.

    `field_keys` / `image_keys` are what makes this the ONE sanitizer for every
    absolutely-positioned card in the app. The geometry, typography, shape and
    colour rules are identical for an ID card and a birthday card — only the
    catalogue of data fields differs — so the birthday designer passes its own
    catalogue here rather than forking three hundred lines of clamping that
    would then drift.
    """
    field_keys = FIELD_KEYS if field_keys is None else field_keys
    image_keys = IMAGE_KEYS if image_keys is None else image_keys
    if not isinstance(layout, list):
        return []
    cleaned, seen_ids = [], set()
    for index, item in enumerate(layout):
        if not isinstance(item, dict):
            continue
        kind = item.get("kind") if item.get("kind") in KINDS else KIND_TEXT
        field = item.get("field") or ""
        if kind == KIND_TEXT and field not in field_keys:
            field = "static"
        if kind == KIND_IMAGE and field not in image_keys:
            field = list(image_keys)[0] if image_keys else "photo"
        # Ids must be unique — they are what the designer selects and drags, and
        # a duplicate would move two elements at once.
        el_id = str(item.get("id") or "")[:60] or f"{kind}-{index}"
        while el_id in seen_ids:
            el_id = f"{el_id}-{index}"
        seen_ids.add(el_id)
        cleaned.append({
            "id": el_id,
            "kind": kind,
            "field": field,
            "label": str(item.get("label") or "")[:40],
            "text": str(item.get("text") or "")[:200],
            # Geometry is clamped to the card but deliberately allows a little
            # bleed (-20%..120%): artwork is often designed to run off the edge.
            "x": _num(item.get("x"), -20, 120, 10),
            "y": _num(item.get("y"), -20, 120, 10),
            "w": _num(item.get("w"), 1, 140, 80),
            "h": _num(item.get("h"), 1, 140, 8),
            "font": item.get("font") if item.get("font") in FONT_KEYS else "sans",
            "size": _int(item.get("size"), 5, 72, 12),
            "weight": item.get("weight") if item.get("weight") in WEIGHTS else "semibold",
            "align": item.get("align") if item.get("align") in ALIGNMENTS else "left",
            "color": _colour(item.get("color"), "#111827"),
            "transform": item.get("transform") if item.get("transform") in TRANSFORMS else "none",
            "italic": bool(item.get("italic")),
            "underline": bool(item.get("underline")),
            "letter_spacing": _int(item.get("letter_spacing"), -20, 100, 0),
            "line_height": _int(item.get("line_height"), 80, 250, 120),
            "fit": item.get("fit") if item.get("fit") in FITS else "cover",
            "shape": item.get("shape") if item.get("shape") in SHAPES else "rect",
            "radius": _int(item.get("radius"), 0, 50, 0),
            "bg": _colour(item.get("bg"), ""),
            "border_color": _colour(item.get("border_color"), ""),
            "border_width": _int(item.get("border_width"), 0, 20, 0),
            "opacity": _int(item.get("opacity"), 0, 100, 100),
            "hide_when_empty": bool(item.get("hide_when_empty", True)),
            "z": _int(item.get("z"), 0, 99, 1),
        })
    return cleaned
