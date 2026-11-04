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

// Ten palettes on one layout: five with a soft tinted menu, five with a
// deep dark one (Graphite and the last five below). The keys are the ones schools already have
// stored, so a new look never moves a school's setting, only what each key
// paints: `classic` is Ocean, `vivid` Violet, `daylight` Graphite, `evergreen`
// Emerald, `laliguras` Berry. The `swatches` are, in order, the menu, the
// brand, the page and the accent.
export const UI_THEMES = [
    {
        value: UI_THEME_CLASSIC,
        name: 'Ocean',
        blurb: 'A soft aqua menu with a blue-green brand and amber for the small marks. Clear and calm all day. Every school starts here.',
        swatches: ['#E3F8FD', '#037177', '#F2F4F7', '#CD8000'],
        rail: '#E3F8FD',
        railInk: '#093138',
    },
    {
        value: 'vivid',
        name: 'Violet',
        blurb: 'A soft lavender menu with deep violet buttons and mint for the small marks. Modern and confident.',
        swatches: ['#F5F1FE', '#644ABE', '#F2F4F7', '#22AC81'],
        rail: '#F5F1FE',
        railInk: '#272355',
    },
    {
        value: 'daylight',
        name: 'Graphite',
        blurb: 'A near-black menu with near-black buttons and tangerine for the small marks. Calm and monochrome.',
        swatches: ['#101828', '#1D2939', '#F2F4F7', '#E9671B'],
        rail: '#101828',
        railInk: '#E4E7EC',
    },
    {
        value: 'evergreen',
        name: 'Emerald',
        blurb: 'A soft mint menu with emerald buttons and a school-crest gold for the small marks. Fresh and bright.',
        swatches: ['#E4FAEF', '#047744', '#F2F4F7', '#BF8800'],
        rail: '#E4FAEF',
        railInk: '#083326',
    },
    {
        value: 'laliguras',
        name: 'Berry',
        blurb: 'A soft rose menu with deep berry buttons and teal for the small marks. Bold and warm.',
        swatches: ['#FEEFF3', '#A1326B', '#F2F4F7', '#1CA9A3'],
        rail: '#FEEFF3',
        railInk: '#3E1A37',
    },
    {
        value: 'deep_ocean',
        name: 'Deep Ocean',
        blurb: 'A deep-sea menu with a blue-green brand and amber for the small marks. Dark, calm and focused.',
        swatches: ['#053537', '#037177', '#EFF7FA', '#CD8000'],
        rail: '#053537',
        railInk: '#F5FCFE',
    },
    {
        value: 'forest',
        name: 'Forest',
        blurb: 'A deep green menu with emerald buttons and gold for the small marks. Rich and grounded.',
        swatches: ['#04381F', '#047744', '#EFF7F5', '#BF8800'],
        rail: '#04381F',
        railInk: '#F6FDF9',
    },
    {
        value: 'midnight',
        name: 'Midnight',
        blurb: 'A deep indigo menu with violet buttons and mint for the small marks. Bold and modern.',
        swatches: ['#2B235B', '#644ABE', '#F5F4FA', '#22AC81'],
        rail: '#2B235B',
        railInk: '#FCFAFE',
    },
    {
        value: 'wine',
        name: 'Wine',
        blurb: 'A deep wine menu with berry buttons and teal for the small marks. Warm and striking.',
        swatches: ['#491836', '#A1326B', '#F7F4F7', '#1CA9A3'],
        rail: '#491836',
        railInk: '#FEFAFA',
    },
    {
        value: 'terracotta',
        name: 'Terracotta',
        blurb: 'A dark brown menu with copper buttons and sage for the small marks. Warm and crafted.',
        swatches: ['#462213', '#99491F', '#F8F4F3', '#71A181'],
        rail: '#462213',
        railInk: '#FFFAF6',
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
