"""The interface themes a school's screens could be drawn in. RETIRED.

Since 2026-11-24 every school is drawn in one palette, the Himalayan blue of
the mobile app, and the superadmin no longer picks a theme per school: the
picker, its endpoint (/api/manage/ui-themes) and `ui_theme` in the profile are
gone, and the frontend ignores whatever is stored.

`SchoolAdmin.ui_theme` is kept for ONE release so the previous code still finds
its column during the migrate-then-reload window or after a rollback
(expand/contract). The release after this one is deployed drops the column, and
this module with it.
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
