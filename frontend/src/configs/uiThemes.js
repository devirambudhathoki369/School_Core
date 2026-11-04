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
// stored, so a new look never moves a school's setting, only what each key
// paints: `classic` is Ocean, `vivid` Violet, `daylight` Graphite, `evergreen`
// Emerald, `laliguras` Berry. The `swatches` are, in order, the menu, the
// brand, the page and the accent.
export const UI_THEMES = [
    {
        value: UI_THEME_CLASSIC,
        name: 'Ocean',
        blurb: 'A white menu with a blue-green brand and amber for the small marks. Clear and calm all day. Every school starts here.',
        swatches: ['#FFFFFF', '#037177', '#F5F7F7', '#CD8000'],
        rail: '#FFFFFF',
        railInk: '#495051',
    },
    {
        value: 'vivid',
        name: 'Violet',
        blurb: 'A white menu, deep violet buttons and mint for the small marks. Modern and confident.',
        swatches: ['#221A51', '#7C5CDE', '#F6F7F8', '#22AC81'],
        rail: '#221A51',
        railInk: '#EDEDF0',
    },
    {
        value: 'daylight',
        name: 'Graphite',
        blurb: 'Near-black buttons on a white menu, tangerine for the small marks. Calm and monochrome.',
        swatches: ['#002D25', '#037368', '#F5F7F7', '#E76558'],
        rail: '#002D25',
        railInk: '#EBEEEF',
    },
    {
        value: 'evergreen',
        name: 'Emerald',
        blurb: 'A white menu, emerald buttons and a school-crest gold for the small marks. Fresh and bright.',
        swatches: ['#FFFFFF', '#047744', '#F6F7F6', '#BF8800'],
        rail: '#FFFFFF',
        railInk: '#4A504D',
    },
    {
        value: 'laliguras',
        name: 'Berry',
        blurb: 'A white menu, deep berry buttons and teal for the small marks. Bold and warm.',
        swatches: ['#410F2C', '#C04380', '#F8F6F7', '#1CA9A3'],
        rail: '#410F2C',
        railInk: '#F0EDEE',
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
