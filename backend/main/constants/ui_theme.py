"""The interface themes a school's screens can be drawn in.

This is PRESENTATION ONLY, exactly like the printed-document styling next door:
a theme decides colour and surface, never what a page shows, filters or totals.

`classic` is the default. The first five keys predate the current palettes,
which repainted them without renaming any -- so no stored value had to move:
`classic` draws Ocean, `vivid` Violet, `daylight` Graphite, `evergreen`
Emerald and `laliguras` Berry. The five after them are the dark-menu themes. Anything other than the default is chosen per school by the
superadmin.

The palettes themselves live in the frontend (one CSS variable block per key);
the backend only owns the list of valid keys and how they are described, so the
picker and the validator can never drift apart.
"""

UI_THEME_CLASSIC = "classic"

UI_THEME_CHOICES = [
    # Light menus: the menu and the page take a soft tint of the brand.
    (UI_THEME_CLASSIC, "Ocean — soft aqua menu, blue-green brand"),
    ("vivid", "Violet — soft lavender menu, deep violet brand"),
    ("evergreen", "Emerald — soft mint menu, emerald brand"),
    ("laliguras", "Berry — soft rose menu, deep berry brand"),
    # Dark menus: a deep shade of the brand for the menu, light pages.
    ("daylight", "Graphite — near-black menu, near-black brand"),
    ("deep_ocean", "Deep Ocean — deep-sea menu, blue-green brand"),
    ("forest", "Forest — deep green menu, emerald brand"),
    ("midnight", "Midnight — deep indigo menu, violet brand"),
    ("wine", "Wine — deep wine menu, berry brand"),
    ("terracotta", "Terracotta — dark brown menu, copper brand"),
]

UI_THEME_KEYS = [key for key, _ in UI_THEME_CHOICES]


def safe_theme(value):
    """Whatever is stored, answer with a theme the frontend actually has.

    A key that was removed (or typed by hand) must fall back to the look every
    school already has rather than leaving a screen unstyled.
    """
    return value if value in UI_THEME_KEYS else UI_THEME_CLASSIC
