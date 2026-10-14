// What the accessibility panel remembers, and how the page is told about it.
//
// Each choice is an attribute on the website's root element, which the
// stylesheet reads (site.module.css, "what the accessibility panel changes").
// The choices are kept in this browser only, and only the website reads them:
// nothing here reaches the portal behind the sign-in.

export const STORAGE_KEY = "centeducation-site-access"

export const TEXT_STEPS = ["100%", "110%", "120%", "130%"]

export const DEFAULTS = {
    text: 0,
    tone: "standard",
    font: "standard",
    space: "off",
    links: "off",
    colour: "full",
    motion: "on",
}

// The values each choice may hold. Anything else in storage is ignored.
const ALLOWED = {
    text: [0, 1, 2, 3],
    tone: ["standard", "high", "dark"],
    font: ["standard", "plain"],
    space: ["off", "on"],
    links: ["off", "on"],
    colour: ["full", "none"],
    motion: ["on", "off"],
}

export function cleanPrefs(raw) {
    const prefs = { ...DEFAULTS }
    if (!raw || typeof raw !== "object") return prefs
    for (const key of Object.keys(ALLOWED)) {
        if (ALLOWED[key].includes(raw[key])) prefs[key] = raw[key]
    }
    return prefs
}

export function readPrefs() {
    try {
        return cleanPrefs(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}"))
    } catch (_) {
        return { ...DEFAULTS }
    }
}

export function savePrefs(prefs) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
    } catch (_) {
        /* private window or storage blocked: the choice lasts for this page */
    }
}

export function isDefault(prefs) {
    return Object.keys(DEFAULTS).every((key) => prefs[key] === DEFAULTS[key])
}

/** The root element's attributes for a set of choices. */
export function prefAttributes(prefs) {
    return {
        "data-text": String(prefs.text),
        "data-tone": prefs.tone,
        "data-font": prefs.font,
        "data-space": prefs.space,
        "data-links": prefs.links,
        "data-colour": prefs.colour,
        "data-motion": prefs.motion,
    }
}

/**
 * Runs before the first paint, from a script tag at the top of the page.
 *
 * The pages are built ahead of time, so the HTML that arrives knows nothing
 * about this visitor. Without this, someone who asked for large text or high
 * contrast would watch every page open the ordinary way and then change. It
 * also marks the page as one that can run script (`data-js`), which is what
 * lets sections wait below the fold to arrive on scroll.
 */
export const BOOT_SCRIPT = `(function(){var r=document.currentScript&&document.currentScript.parentNode;if(!r)return;try{var a=${JSON.stringify(
    ALLOWED
)},p=JSON.parse(localStorage.getItem(${JSON.stringify(STORAGE_KEY)})||"{}");for(var k in a){if(a[k].indexOf(p[k])>-1)r.setAttribute("data-"+k,String(p[k]))}if(p.colour==="none")document.documentElement.style.filter="grayscale(1)"}catch(e){}r.setAttribute("data-js","")})()`
