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
// paints: `classic` is Marigold, `vivid` is Himalaya, `daylight` is Rara,
// `evergreen` is Terai. Each is a dark frame and one bright highlight; the
// `swatches` are, in order, the frame, the highlight, the page and the button
// colour.
export const UI_THEMES = [
    {
        value: UI_THEME_CLASSIC,
        name: 'Marigold',
        blurb: 'A chalkboard-green frame and one marigold for what you have chosen. The SchoolCore look, and where every school starts.',
        swatches: ['#0E2B23', '#FFC233', '#F3F6F4', '#17614D'],
        rail: '#0E2B23',
        railInk: '#E4EEE9',
    },
    {
        value: 'vivid',
        name: 'Himalaya',
        blurb: 'A midnight-indigo frame with a saffron highlight. Deep, calm and unmistakable.',
        swatches: ['#171B45', '#FF9F45', '#F4F4FA', '#3B44B0'],
        rail: '#171B45',
        railInk: '#E5E7F7',
    },
    {
        value: 'daylight',
        name: 'Rara',
        blurb: 'A lake-blue frame with a spring-green highlight. Fresh, clear and bright.',
        swatches: ['#04334A', '#4CF0A0', '#F1F6F9', '#0A5F80'],
        rail: '#04334A',
        railInk: '#DCEEF5',
    },
    {
        value: 'evergreen',
        name: 'Terai',
        blurb: 'A deep paddy-green frame with a new-rice lime highlight. Earthy and alive.',
        swatches: ['#1D3510', '#C9F25A', '#F4F7EF', '#3E6B1C'],
        rail: '#1D3510',
        railInk: '#E7F1DD',
    },
    {
        value: 'laliguras',
        name: 'Laliguras',
        blurb: 'An aubergine frame with a rhododendron-pink highlight. Warm and confident.',
        swatches: ['#2A1630', '#FF7096', '#F8F4F6', '#9C2457'],
        rail: '#2A1630',
        railInk: '#F2E6EF',
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
