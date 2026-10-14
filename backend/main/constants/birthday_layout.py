"""The parts a birthday card is built from, and the presets that arrange them.

THE SAME ENGINE AS THE ID CARD, A DIFFERENT CATALOGUE
-----------------------------------------------------
A birthday card and an ID card are the same drawing problem: a fixed rectangle,
a background artwork, and a handful of data-bound elements that have to land in
the space the artwork left for them. So the geometry, typography, colour and
shape rules — and the clamping that keeps a hand-edited row printable — are
imported from `idcard_layout` rather than restated. Only the FIELDS differ, and
those are the twenty lines below.

What is genuinely different is the OUTPUT. An ID card is printed; a birthday
card is shared. That is why the sizes here are the ones social platforms
actually crop to, rather than a card-stock ratio:

    square    1080x1080  — the feed post; the safe default everywhere
    story     1080x1920  — Instagram / Facebook stories, WhatsApp status
    landscape 1200x630   — the size Facebook unfurls a link preview at

The canvas below is a QUARTER of each (270x270, 270x480, 300x158), for the same
reason the ID card designs at 150PPI and exports at 300: the browser draws the
design at a size a laptop can show, and html2canvas re-renders it at scale for
the file that actually gets shared.
"""

from .idcard_layout import (  # noqa: F401
    KIND_TEXT, KIND_IMAGE, KIND_SHAPE, KINDS,
    FONT_CHOICES, FONT_KEYS, WEIGHTS, ALIGNMENTS, TRANSFORMS, FITS, SHAPES,
    ELEMENT_DEFAULT, sanitize_layout as _sanitize,
)

# --- what a birthday card can say -------------------------------------------
# `wish` is the school's own message and the reason this is a template rather
# than a fixed graphic: it is written once in the designer and reused for every
# birthday, with the name substituted per card.
BIRTHDAY_FIELDS = [
    ("name", "Name"),
    ("first_name", "First name"),
    ("classname", "Class"),
    ("section", "Section"),
    ("age", "Age turning"),
    ("birth_date", "Date of birth"),
    ("birth_day", "Birthday (day & month)"),
    ("wish", "Wish message"),
    ("school_name", "School name"),
    ("school_address", "School address"),
    ("school_contact", "School phone"),
    ("static", "Fixed text"),
]
FIELD_KEYS = [k for k, _ in BIRTHDAY_FIELDS]

IMAGE_SOURCES = [
    ("photo", "Their photo"),
    ("logo", "School logo"),
    ("decoration", "Decoration / sticker"),
]
IMAGE_KEYS = [k for k, _ in IMAGE_SOURCES]

# --- sizes ------------------------------------------------------------------
# (design canvas w, design canvas h, export multiplier)
FORMATS = {
    "square": {"label": "Square — feed post (1080×1080)", "w": 270, "h": 270, "scale": 4},
    "story": {"label": "Story — full screen (1080×1920)", "w": 270, "h": 480, "scale": 4},
    "landscape": {"label": "Landscape — link preview (1200×630)", "w": 300, "h": 158, "scale": 4},
}
FORMAT_KEYS = list(FORMATS.keys())


def card_size(fmt):
    spec = FORMATS.get(fmt) or FORMATS["square"]
    return spec["w"], spec["h"]


def export_scale(fmt):
    spec = FORMATS.get(fmt) or FORMATS["square"]
    return spec["scale"]


# The wording a school starts from. `{name}` is the only placeholder that is
# always safe — every other field can be empty for a given person, and a card
# reading "Happy birthday, , from " is worse than one that never mentions it.
DEFAULT_WISH = (
    "Wishing you a very happy birthday, {name}! "
    "May your year ahead be full of joy, health and success."
)

# Placeholders a wish may contain. Anything else is left as typed, so a stray
# brace in someone's message is printed rather than swallowed.
WISH_PLACEHOLDERS = ["name", "first_name", "classname", "age", "school_name"]


def _el(**overrides):
    el = {**ELEMENT_DEFAULT, **overrides}
    el.setdefault("id", f"{el['kind']}-{el.get('field') or 'el'}")
    return el


def _celebration_square():
    """A photo the card is built around, the greeting over it. The commonest
    shape a school actually posts."""
    return [
        _el(id="bg", kind=KIND_SHAPE, field="", x=0, y=0, w=100, h=100,
            bg="#0d9488", z=0),
        _el(id="logo", kind=KIND_IMAGE, field="logo", x=4, y=4, w=12, h=12,
            fit="contain", z=3),
        _el(id="school", kind=KIND_TEXT, field="school_name", x=18, y=6, w=60, h=7,
            size=10, weight="bold", color="#ffffff", transform="uppercase",
            letter_spacing=8, z=3),
        _el(id="photo", kind=KIND_IMAGE, field="photo", x=34, y=19, w=32, h=32,
            fit="cover", shape="circle", border_color="#ffffff", border_width=4, z=2),
        _el(id="greeting", kind=KIND_TEXT, field="static", text="Happy Birthday",
            x=6, y=54, w=88, h=10, size=26, weight="black", align="center",
            color="#ffffff", font="display", z=3),
        _el(id="name", kind=KIND_TEXT, field="name", x=6, y=65, w=88, h=8,
            size=18, weight="bold", align="center", color="#fde68a",
            transform="capitalize", z=3),
        _el(id="classname", kind=KIND_TEXT, field="classname", x=6, y=73, w=88, h=5,
            size=10, align="center", color="#ccfbf1", z=3),
        _el(id="wish", kind=KIND_TEXT, field="wish", x=10, y=80, w=80, h=14,
            size=9, weight="normal", align="center", color="#e2f6f3",
            line_height=145, z=3),
    ]


def _photo_frame_story():
    return [
        _el(id="bg", kind=KIND_SHAPE, field="", x=0, y=0, w=100, h=100,
            bg="#4f46e5", z=0),
        _el(id="photo", kind=KIND_IMAGE, field="photo", x=0, y=0, w=100, h=58,
            fit="cover", z=1),
        _el(id="greeting", kind=KIND_TEXT, field="static", text="Happy Birthday!",
            x=6, y=62, w=88, h=8, size=24, weight="black", align="center",
            color="#ffffff", font="display", z=3),
        _el(id="name", kind=KIND_TEXT, field="name", x=6, y=71, w=88, h=6,
            size=16, weight="bold", align="center", color="#fcd34d",
            transform="capitalize", z=3),
        _el(id="wish", kind=KIND_TEXT, field="wish", x=10, y=78, w=80, h=12,
            size=9, align="center", color="#e0e7ff", line_height=150, z=3),
        _el(id="school", kind=KIND_TEXT, field="school_name", x=6, y=93, w=88, h=5,
            size=8, weight="bold", align="center", color="#c7d2fe",
            transform="uppercase", letter_spacing=6, z=3),
    ]


def _simple_landscape():
    return [
        _el(id="bg", kind=KIND_SHAPE, field="", x=0, y=0, w=100, h=100,
            bg="#ffffff", z=0),
        _el(id="accent", kind=KIND_SHAPE, field="", x=0, y=0, w=4, h=100,
            bg="#f59e0b", z=1),
        _el(id="photo", kind=KIND_IMAGE, field="photo", x=8, y=18, w=22, h=64,
            fit="cover", shape="rounded", radius=12, z=2),
        _el(id="greeting", kind=KIND_TEXT, field="static", text="Happy Birthday",
            x=35, y=22, w=58, h=14, size=22, weight="black", align="left",
            color="#0f172a", font="display", z=3),
        _el(id="name", kind=KIND_TEXT, field="name", x=35, y=40, w=58, h=9,
            size=15, weight="bold", color="#0d9488", transform="capitalize", z=3),
        _el(id="wish", kind=KIND_TEXT, field="wish", x=35, y=52, w=58, h=22,
            size=8, color="#475569", line_height=150, z=3),
        _el(id="school", kind=KIND_TEXT, field="school_name", x=35, y=78, w=58, h=6,
            size=8, weight="bold", color="#94a3b8", transform="uppercase",
            letter_spacing=6, z=3),
    ]


PRESETS = {
    "celebration": {
        "label": "Celebration — round photo on a colour ground",
        "format": "square",
        "build": _celebration_square,
    },
    "photo_frame": {
        "label": "Photo frame — big photo, story sized",
        "format": "story",
        "build": _photo_frame_story,
    },
    "simple": {
        "label": "Simple — light, for a link preview",
        "format": "landscape",
        "build": _simple_landscape,
    },
}
PRESET_KEYS = list(PRESETS.keys())
PRESET_CHOICES = [(k, v["label"]) for k, v in PRESETS.items()]


def default_layout(preset="celebration"):
    spec = PRESETS.get(preset) or PRESETS["celebration"]
    return [dict(e) for e in spec["build"]()]


def preset_format(preset):
    spec = PRESETS.get(preset) or PRESETS["celebration"]
    return spec["format"]


def sanitize_layout(layout):
    """The shared clamping, with this card's own field catalogue."""
    return _sanitize(layout, field_keys=FIELD_KEYS, image_keys=IMAGE_KEYS)
