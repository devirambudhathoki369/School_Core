"""The interface themes a school's screens can be drawn in.

This is PRESENTATION ONLY, exactly like the printed-document styling next door:
a theme decides colour and surface, never what a page shows, filters or totals.

`classic` is the default. Its key predates the SchoolCore design, which
repainted every key without renaming it -- so no stored value had to move:
`classic` draws the Core palette, `vivid` Himalaya, `daylight` Phewa and
`evergreen` Terai. Anything other than the default is chosen per school by the
superadmin.

The palettes themselves live in the frontend (one CSS variable block per key);
the backend only owns the list of valid keys and how they are described, so the
picker and the validator can never drift apart.
"""

UI_THEME_CLASSIC = "classic"

UI_THEME_CHOICES = [
    (UI_THEME_CLASSIC, "Core — indigo on clean white, light menu"),
    ("vivid", "Himalaya — night-sky menu, glacier teal, saffron"),
    ("daylight", "Phewa — deep-lake menu, sky blue, sunset orange"),
    ("evergreen", "Terai — forest menu, field green, paddy gold"),
    ("laliguras", "Laliguras — rhododendron crimson and gold, light menu"),
]

UI_THEME_KEYS = [key for key, _ in UI_THEME_CHOICES]


def safe_theme(value):
    """Whatever is stored, answer with a theme the frontend actually has.

    A key that was removed (or typed by hand) must fall back to the look every
    school already has rather than leaving a screen unstyled.
    """
    return value if value in UI_THEME_KEYS else UI_THEME_CLASSIC
