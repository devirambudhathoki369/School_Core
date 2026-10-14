// The interface themes a school's screens can be drawn in.
//
// The palettes themselves are CSS rules in globals.css, scoped to
// `[data-ui-theme="…"]`. This file only names them for the picker and carries a
// few swatches so a preview can be drawn without duplicating the palette.
//
// Keys must match main/constants/ui_theme.py on the backend.

export const UI_THEME_CLASSIC = 'classic';

/**
 * The superadmin console's palette.
 *
 * Deliberately NOT a member of `UI_THEMES`: it is the console's permanent look,
 * not a choice, and a school must never be able to land on it. It is excluded
 * from `UI_THEME_KEYS` for the same reason, so `safeTheme` — which guards the
 * value coming back from a school's profile — still rejects it.
 */
export const UI_THEME_CONSOLE = 'console';

export const UI_THEMES = [
    {
        value: UI_THEME_CLASSIC,
        name: 'Classic',
        blurb: 'The teal look the system has always had. Every school starts here.',
        swatches: ['#ccfbf1', '#bae6fd', '#dbeafe', '#14b8a6'],
        rail: '#ffffff',
        railInk: '#334155',
    },
    {
        value: 'vivid',
        name: 'CentIT Colour',
        blurb: 'Deep teal rail, saturated summary cards, gradient panel headers. Changes the layout, not just the palette.',
        swatches: ['#0d9488', '#06b6d4', '#4f46e5', '#f59e0b'],
        rail: '#0f766e',
        railInk: '#c3e4e0',
    },
    {
        value: 'daylight',
        name: 'Daylight Blue',
        blurb: 'Light blue page with a solid blue sidebar.',
        swatches: ['#dbeafe', '#bfdbfe', '#e0e7ff', '#2272c9'],
        rail: '#17518c',
        railInk: '#eef4fb',
    },
    {
        value: 'evergreen',
        name: 'Evergreen',
        blurb: 'Soft green page with a deep green sidebar.',
        swatches: ['#d1fae5', '#99f6e4', '#d1fae5', '#0a8a6a'],
        rail: '#0f3d3a',
        railInk: '#eef4fb',
    },
];

export const UI_THEME_KEYS = UI_THEMES.map((t) => t.value);

// Anything unrecognised falls back to the look every school already has, so a
// stale or hand-edited value can never leave a screen unstyled.
export function safeTheme(value) {
    return UI_THEME_KEYS.includes(value) ? value : UI_THEME_CLASSIC;
}

export function themeMeta(value) {
    return UI_THEMES.find((t) => t.value === safeTheme(value)) || UI_THEMES[0];
}

/**
 * Paint a theme onto a root element.
 *
 * `classic` is the absence of a theme rather than a theme of its own — the
 * plain stylesheet already is classic — so it removes the attribute instead of
 * setting it. That keeps the guarantee visible in the DOM: a classic school has
 * no `data-ui-theme` at all, and therefore cannot match a single themed rule.
 *
 * `console` is passed straight through: it is the one value that is a real
 * theme without being a selectable one, so it must skip `safeTheme` (which
 * would send it back to classic) while every school value still goes through it.
 *
 * Takes an element rather than assuming the document so the superadmin can
 * preview a theme without having to live in it.
 */
export function applyTheme(el, value) {
    if (!el) return;
    const theme = value === UI_THEME_CONSOLE ? UI_THEME_CONSOLE : safeTheme(value);
    if (theme === UI_THEME_CLASSIC) el.removeAttribute('data-ui-theme');
    else el.setAttribute('data-ui-theme', theme);
}
