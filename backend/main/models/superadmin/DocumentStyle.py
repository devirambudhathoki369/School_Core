from django.db.models import (
    Model, OneToOneField, CharField, IntegerField, BooleanField, JSONField,
    DateTimeField, CASCADE,
)

from ...constants.document_layout import (  # noqa: F401
    THEME_CHOICES, THEME_KEYS, default_layout, sanitize_layout,
    BORDER_KEYS, TABLE_BORDER_KEYS, theme_defaults,
)

THEME_CLASSIC = "classic"

# Kept to families that are actually installed or web-safe. A document that
# prints must never depend on a font the print driver has to guess at.
FONT_CHOICES = [
    ("serif", "Serif (Times-like) — traditional certificates"),
    ("sans", "Sans (Helvetica-like) — clean and modern"),
    ("system", "System default — matches the rest of the app"),
    ("mono", "Monospace — aligned figures"),
]

# Every document this styling can be switched on for. The key is what the
# frontend asks for; the label is what the superadmin ticks.
DOCUMENT_CHOICES = [
    ("gradesheet_lgs", "Grade-sheet (Letter Grading)"),
    ("progress_report", "Progress Report"),
    ("gradesheet_ns", "Grade-sheet (Number System)"),
    ("class_result", "Class Result"),
    ("marksheet_combined", "Marksheet (Combined)"),
    ("character_certificate", "Character Certificate"),
    ("entry_card", "Entry / Admit Card"),
]
DOCUMENT_KEYS = [key for key, _ in DOCUMENT_CHOICES]


class DocumentStyle(Model):
    """How one school's printed documents look, chosen by the superadmin.

    NO ROW MEANS THE BUILT-IN DEFAULT. A school that has never been styled must
    keep exactly the look it has today, so absence is meaningful here and the
    defaults below deliberately describe the current design rather than a new one.
    """

    school = OneToOneField(
        "main.SchoolAdmin", on_delete=CASCADE, related_name="document_style"
    )
    theme = CharField(max_length=20, default=THEME_CLASSIC, choices=THEME_CHOICES)
    font_family = CharField(max_length=20, default="serif", choices=FONT_CHOICES)
    # A PERCENTAGE, not a point size. These documents carry a tuned hierarchy —
    # 8pt print tables, 1.1rem subject names, larger headers — and one absolute
    # size would flatten all of it. A scale multiplies what is already there, so
    # the proportions survive.
    font_scale = IntegerField(default=100)
    accent_color = CharField(max_length=9, default="#000000")
    show_watermark = BooleanField(default=True)
    # The frame around the sheet and the lines inside the marks table, each its
    # own choice. "theme" defers to what the theme's CSS draws, so a school that
    # never touches these follows its theme.
    border_style = CharField(max_length=12, default="theme")
    table_border = CharField(max_length=12, default="all")
    # A faint page tint (empty = white paper) and an accent rule under the
    # masthead. Both additive and cosmetic — a school that never sets them prints
    # exactly as before.
    background_tint = CharField(max_length=9, default="", blank=True)
    header_rule = CharField(max_length=12, default="none")
    # Which documents the styling is switched on for. Empty = applied nowhere,
    # so a half-finished setup can be saved without changing what schools print.
    applies_to = JSONField(default=list)
    # The ordered, per-element layout: which parts appear, in what order, and how
    # each is set. Empty means "use the theme's preset", so a school that has
    # never been customised follows the designer's preset and picks up any later
    # improvement to it instead of being frozen at the day it was created.
    layout = JSONField(default=list, blank=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "document style"

    def __str__(self):
        return f"school={self.school_id} theme={self.theme}"

    @property
    def effective_layout(self):
        """The layout to render with: the school's own if it has customised one,
        otherwise the theme's preset. Sanitised either way, so an older frontend
        or a hand-edited row still yields something printable."""
        if self.layout:
            return sanitize_layout(self.layout)
        return default_layout(self.theme)

    @property
    def safe_border(self):
        return self.border_style if self.border_style in BORDER_KEYS else "theme"

    @property
    def safe_table_border(self):
        return self.table_border if self.table_border in TABLE_BORDER_KEYS else "all"

    @property
    def safe_theme(self):
        """An unknown theme (a preset renamed or retired) falls back rather than
        rendering nothing."""
        return self.theme if self.theme in THEME_KEYS else THEME_CLASSIC

    @property
    def safe_font_scale(self):
        """Clamped on read as well as on write: a row edited straight in the
        database can still not produce an unprintable document."""
        try:
            return max(70, min(150, int(self.font_scale)))
        except (TypeError, ValueError):
            return 100
