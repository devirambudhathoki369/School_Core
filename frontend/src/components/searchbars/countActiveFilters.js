/**
 * How many filters are actually narrowing a search.
 *
 * Shown on the collapsed search panel, so someone who scrolled past it can see
 * that results are filtered without having to open it back up. `school` is the
 * account's own id rather than a choice the user made, and a status that is
 * still on its default is not a narrowing either — neither is counted.
 */
const IGNORED = new Set(["school", "sms", "strict", "include_station"]);

function isActive(key, value, ignore, defaults) {
    if (IGNORED.has(key) || ignore.includes(key)) return false;
    if (value === null || value === undefined || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (key in defaults && String(defaults[key]) === String(value)) return false;
    return true;
}

export default function countActiveFilters(form, { ignore = [], defaults = {} } = {}) {
    if (!form) return 0;
    return Object.entries(form).reduce(
        (n, [key, value]) => (isActive(key, value, ignore, defaults) ? n + 1 : n), 0);
}

/**
 * The same filters, named rather than counted.
 *
 * A count tells you that results are narrowed but not HOW, so the only way to
 * find out was to reopen the panel and read every field — and the only way to
 * drop one filter was to clear it by hand or Reset the lot. Returning the
 * active entries lets the panel show them as chips you can remove one at a time.
 *
 * `labels` maps a field name to what the user should read ("class_info" is not
 * a word anyone typed). `format` renders a value that is an id into the name it
 * was chosen by; without it the chip would show a primary key.
 */
export function activeFilters(form, { ignore = [], defaults = {}, labels = {}, format } = {}) {
    if (!form) return [];
    return Object.entries(form)
        .filter(([key, value]) => isActive(key, value, ignore, defaults))
        .map(([key, value]) => ({
            key,
            label: labels[key] || key.replace(/_/g, " "),
            value: format ? format(key, value) : (Array.isArray(value) ? value.join(", ") : String(value)),
        }));
}
