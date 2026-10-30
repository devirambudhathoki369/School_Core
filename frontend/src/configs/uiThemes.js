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

// Five palettes on one layout. The keys are the ones schools already have
// stored, so moving to the SchoolCore design changed no school's setting, only
// what each key paints: `classic` is Core, `vivid` is Himalaya, `daylight` is
// Phewa, `evergreen` is Terai. `swatches` are, in order, the brand, its tint,
// the page and the second chart colour.
export const UI_THEMES = [
    {
        value: UI_THEME_CLASSIC,
        name: 'Core',
        blurb: 'Indigo on clean white with a light menu. Calm and neutral for a full day at the desk. Every school starts here.',
        swatches: ['#3B5BDB', '#EDF1FD', '#F5F6F8', '#D9730D'],
        rail: '#FFFFFF',
        railInk: '#374151',
    },
    {
        value: 'vivid',
        name: 'Himalaya',
        blurb: 'Night-sky menu, glacier teal and a saffron second colour. Bold without shouting.',
        swatches: ['#0E6F8C', '#E3F2F7', '#F2F5F9', '#E0661B'],
        rail: '#13223F',
        railInk: '#E4EAF5',
    },
    {
        value: 'daylight',
        name: 'Phewa',
        blurb: 'A clear lake-blue menu and accent, with sunset orange for the second colour. Bright and trustworthy.',
        swatches: ['#0B63BD', '#E9F1F9', '#EFF5FB', '#E06A26'],
        rail: '#0B5CAD',
        railInk: '#F1F8FF',
    },
    {
        value: 'evergreen',
        name: 'Terai',
        blurb: 'A fresh field-green menu and accent, with paddy gold for the second colour. Grounded and fresh.',
        swatches: ['#127A46', '#EAF3EE', '#F0F7F2', '#BF8410'],
        rail: '#0F6B45',
        railInk: '#F0FBF5',
    },
    {
        value: 'laliguras',
        name: 'Laliguras',
        blurb: 'Rhododendron crimson on warm white with gold for the second chart colour. Warm and confident.',
        swatches: ['#BE123C', '#FCE9EE', '#FAF7F6', '#B7860B'],
        rail: '#FFFFFF',
        railInk: '#3F3236',
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
 * Every value sets the attribute, `classic` included. Classic used to be the
 * absence of a theme so that a school nobody had touched kept its original
 * look; the SchoolCore design replaced that look everywhere, and Classic is now
 * simply the Core palette, so it needs the attribute like any other.
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
    el.setAttribute('data-ui-theme', theme);
}
