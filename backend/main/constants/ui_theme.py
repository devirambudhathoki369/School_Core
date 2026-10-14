"""The interface themes a school's screens can be drawn in.

This is PRESENTATION ONLY, exactly like the printed-document styling next door:
a theme decides colour and surface, never what a page shows, filters or totals.

`classic` is the look every school has today and is the default, so a school
that is never touched keeps precisely the interface it already knows. Anything
else is opt-in, chosen per school by the superadmin.

The palettes themselves live in the frontend (one CSS variable block per key);
the backend only owns the list of valid keys and how they are described, so the
picker and the validator can never drift apart.
"""

UI_THEME_CLASSIC = "classic"

UI_THEME_CHOICES = [
    (
        UI_THEME_CLASSIC,
        "Classic — the teal look the system has always had",
    ),
    (
        "vivid",
        "CentIT Colour — deep teal rail, saturated cards, gradient headers",
    ),
    (
        "daylight",
        "Daylight Blue — light blue page, solid blue sidebar, tinted summary cards",
    ),
    (
        "evergreen",
        "Evergreen — deep green sidebar with white cards and green accents",
    ),
]

UI_THEME_KEYS = [key for key, _ in UI_THEME_CHOICES]


def safe_theme(value):
    """Whatever is stored, answer with a theme the frontend actually has.

    A key that was removed (or typed by hand) must fall back to the look every
    school already has rather than leaving a screen unstyled.
    """
    return value if value in UI_THEME_KEYS else UI_THEME_CLASSIC
