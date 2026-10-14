// The fields that identify the CLASS itself, as opposed to which section of it
// a student sits in. If every one of these matches and only the section differs,
// the move is a section change within one class — and results must then be
// carried across internally instead of being treated as a promotion.
const CLASS_IDENTITY_KEYS = [
    "education_level", "grade", "faculty", "course", "year", "semester",
];

// Compared as strings because a class id arrives as a number from the API but as
// a string out of a <select>, and 10 !== "10" would silently read as a promotion.
const same = (a, b) => `${a ?? ""}` === `${b ?? ""}`;

/**
 * True when `from` and `to` are the same class and differ only by section.
 */
function isSectionOnlyChange(from, to) {
    if (!from || !to) return false;
    if (!CLASS_IDENTITY_KEYS.every((key) => same(from[key], to[key]))) return false;
    return !same(from.section, to.section);
}

export default isSectionOnlyChange;
export { CLASS_IDENTITY_KEYS };
