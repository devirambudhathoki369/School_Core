// The interface theme every screen is drawn in.
//
// SchoolCore has ONE palette: the Himalayan blue of the mobile app (navy menu,
// blue brand, marigold marks). Schools used to be painted one of ten palettes
// picked by the superadmin; that choice is gone (2026-11-24), so every school
// is drawn as `classic` whatever its stored `ui_theme` says. The palette itself
// is the `:root, [data-ui-theme="classic"]` block in globals.css.

export const UI_THEME_CLASSIC = 'classic';

/**
 * The superadmin console's palette: the same blue on a deeper navy menu, so
 * the one screen that acts across schools is told apart from any school.
 */
export const UI_THEME_CONSOLE = 'console';

/**
 * Paint the theme onto a root element: `console` for the superadmin's console,
 * `classic` for anything else. Takes an element rather than assuming the
 * document so a preview page can paint itself.
 */
export function applyTheme(el, value) {
    if (!el) return;
    el.setAttribute('data-ui-theme', value === UI_THEME_CONSOLE ? UI_THEME_CONSOLE : UI_THEME_CLASSIC);
}
