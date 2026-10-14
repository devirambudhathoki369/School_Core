// Turns a saved DocumentStyle into something a document can render with.
//
// Kept in one place on purpose: every document asks for its props the same way,
// so switching a school's theme can never style half of them.

const FONT_STACKS = {
    // Only families a print driver is certain to have. A certificate that
    // prints must never depend on a font the driver has to substitute.
    serif: '"Times New Roman", Times, Georgia, serif',
    sans: 'Helvetica, Arial, "Liberation Sans", sans-serif',
    system: 'inherit',
    mono: '"Courier New", Courier, monospace',
    slab: '"Rockwell", "Roboto Slab", Georgia, serif',
    condensed: '"Arial Narrow", "Roboto Condensed", sans-serif',
    script: '"Segoe Script", "Brush Script MT", cursive',
    display: 'Georgia, "Times New Roman", serif',
};

// Each theme is a class the stylesheet owns, so a redesign is a CSS change and
// never a data migration.
const FONT_CLASSES = {
    serif: "doc-font-serif",
    sans: "doc-font-sans",
    mono: "doc-font-mono",
    display: "doc-font-display",
    slab: "doc-font-slab",
    condensed: "doc-font-condensed",
    script: "doc-font-script",
    system: "",          // "system" means leave the app's own font alone
};

const THEME_CLASSES = {
    classic: "doc-theme-classic",
    modern: "doc-theme-modern",
    elegant: "doc-theme-elegant",
    minimal: "doc-theme-minimal",
    formal: "doc-theme-elegant",   // presets added later reuse a drawn theme
    compact: "doc-theme-modern",
    royal: "doc-theme-royal",
    vintage: "doc-theme-vintage",
};

/**
 * Props to spread on a document's root element.
 *
 * Returns nothing when the school has no style, or has one that is not switched
 * on for THIS document — so an unconfigured school keeps exactly the look it
 * has today. That default matters more than the feature.
 *
 * @param style       the object from getDocumentStyle()
 * @param documentKey e.g. "gradesheet_lgs" — must match the backend's keys
 */
export function documentStyleProps(style, documentKey) {
    const applies = Array.isArray(style?.applies_to) && style.applies_to.includes(documentKey);
    if (!style || !applies) return { className: "", style: undefined };

    const scale = Math.max(70, Math.min(150, Number(style.font_scale) || 100));
    // The family is a CLASS, not an inline style: globals.css sets font-family
    // on every element through the universal selector, so an inline family on
    // the root is overridden by each descendant and nothing changes. The class
    // targets descendants too, which is what makes the choice take effect.
    const css = { "--doc-accent": style.accent_color || "#000000" };
    if (style.background_tint) {
        css.backgroundColor = style.background_tint;
        css["--doc-bg"] = style.background_tint;
    }
    // NOTE: the documents size themselves in rem and pt, both of which ignore a
    // parent's font-size — so a percentage here would do nothing. `zoom` scales
    // the rendered box instead, which is what actually makes a sheet fit the
    // paper. It is honoured by Chromium (including when printing), and browsers
    // that ignore it simply render at 100% rather than breaking the layout.
    if (scale !== 100) css.zoom = scale / 100;

    const fontClass = FONT_CLASSES[style.font_family] || FONT_CLASSES.serif;
    const themeClass = THEME_CLASSES[style.theme] || THEME_CLASSES.classic;
    // "theme" (or missing) leaves the theme's own border/table untouched.
    const borderClass = (style.border_style && style.border_style !== "theme")
        ? `doc-border-${style.border_style}` : "";
    const tableClass = style.table_border ? `doc-table-${style.table_border}` : "doc-table-all";
    const ruleClass = (style.header_rule && style.header_rule !== "none")
        ? `doc-rule-${style.header_rule}` : "";
    return {
        className: `${themeClass} ${fontClass} ${borderClass} ${tableClass} ${ruleClass}`.replace(/\s+/g, " ").trim(),
        style: css,
    };
}

/** Whether the watermark should be drawn — on unless a style turns it off. */
export function documentShowsWatermark(style, documentKey) {
    const applies = Array.isArray(style?.applies_to) && style.applies_to.includes(documentKey);
    if (!style || !applies) return true;
    return style.show_watermark !== false;
}

export { FONT_STACKS, THEME_CLASSES, FONT_CLASSES };
