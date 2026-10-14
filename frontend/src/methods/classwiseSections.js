const HIGHSCHOOL = 3;
const MONTESSORI = 1;
// bachelor / master / pre-diploma / diploma — these are course + year|semester,
// they never carry a grade or a faculty.
const HIGHER_ED = [4, 5, 8, 9];
// `course` is in here because a high-school stream (Class 11 Management ▸
// Computer Science) is a course row, and its sections are its own: without the
// trigger, picking the stream left the previous stream's sections on offer.
const sectionsListFilterTrigger = ["education_level", "grade", "faculty", "course", "year", "semester"];

const int = (v) => {
    const n = parseInt(v);
    return Number.isNaN(n) ? null : n;
};

/**
 * ONE canonical key per class, built from the WHOLE class identity — not from
 * whichever chip was clicked last.
 *
 * The old key for a faculty click was just `f<faculty>`, which is not a class:
 * it collected the sections of every faculty-3 class in the school, so picking
 * "eleven + education" offered the sections of twelve-education (and of any
 * other level that happens to use faculties) as well. Sections that belong to
 * no such class are exactly what the pickers must not offer.
 *
 * Returns null when the selection is not yet a full class (e.g. a high-school
 * grade with no faculty chosen yet) — the caller then shows no sections, which
 * is honest: we cannot know which class is meant.
 */
function getDistributedSectionsKey(name, value, class_info = {}) {
    const info = { ...class_info, [name]: value };
    const EL = int(info?.education_level);
    if (!EL) return null;
    // montessori keeps ONE bucket for the whole level: its grade chips are not
    // rendered, so a grade click can never come back to look the key up.
    if (EL === MONTESSORI) return `e${EL}`;
    if (HIGHER_ED.includes(EL)) {
        const course = int(info?.course);
        if (!course) return null;
        const year = int(info?.year);
        const semester = int(info?.semester);
        if (year) return `e${EL}c${course}y${year}`;
        if (semester) return `e${EL}c${course}s${semester}`;
        return null;
    }
    const grade = int(info?.grade);
    if (!grade) return null;
    if (EL === HIGHSCHOOL) {
        const faculty = int(info?.faculty);
        if (!faculty) return null;
        // A stream, where the school uses one, is part of the class: Management
        // ▸ Computer Science and Management ▸ Finance are two classes and their
        // sections must not be pooled. Schools that put nothing under the
        // faculty keep the exact key they had.
        const course = int(info?.course);
        return course
            ? `e${EL}f${faculty}g${grade}c${course}`
            : `e${EL}f${faculty}g${grade}`;
    }
    return `e${EL}g${grade}`;
}

function getDistributedSections(classes) {
    return classes.reduce((acc, class_info) => {
        const { section } = class_info;
        if (!section) return acc;
        const key = getDistributedSectionsKey('section', section, class_info);
        if (!key) return acc;
        if (!acc[key]) acc[key] = new Set();
        acc[key].add(section);
        return acc;
    }, {});
}

function getSections(sections, filtered_sections = null) {
    if (!filtered_sections) filtered_sections = Object.keys(sections).map(e => parseInt(e));
    filtered_sections = filtered_sections.reduce((acc, section_id) => {
        const sec = sections?.[section_id];
        acc.push({ value: section_id, name: sec });
        return acc;
    }, []);
    return filtered_sections;
}

export {
    getDistributedSections,
    getDistributedSectionsKey,
    getSections,
    HIGHSCHOOL,
    sectionsListFilterTrigger
};
