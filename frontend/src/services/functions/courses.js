import { __delete, __fetch, __fetchAsOptions, __save, __update } from ".";

// High school (+2) keeps its programmes in the same table as the college
// courses: "Computer Science" under Class 11 Management is a course row of
// level 3. They must never turn up in a bachelor's course list, nor a BCA in a
// Class 11 one, hence `coursesForLevel`.
const HIGHSCHOOL = 3;

export async function fetchCourses(school_id, as_options = '') {
    if (as_options) {
        return __fetchAsOptions('/api/courses', { school: school_id }, { name: 'course' });
    }
    return __fetch('/api/courses', { school: school_id, as_options });
}

/**
 * Course options that still carry the level they belong to, so a picker can
 * narrow them with `coursesForLevel`.
 */
export async function fetchCourseOptions(school_id) {
    const rows = await __fetch('/api/courses', { school: school_id });
    if (!Array.isArray(rows)) return [];
    return rows.map((c) => ({
        name: c?.course, value: c?.id,
        education_level: c?.education_level, faculty: c?.faculty,
    }));
}

/**
 * The streams one +2 faculty is split into. A stream belongs to exactly one
 * faculty; one whose faculty is not set yet is offered under none, so it can
 * never be filed under the wrong faculty — the school sets it in Course setup.
 */
export function streamsForFaculty(courses, faculty) {
    const f = parseInt(faculty);
    if (!f) return [];
    return coursesForLevel(courses, HIGHSCHOOL).filter((c) => parseInt(c?.faculty) === f);
}

/**
 * Whether `course` may stay picked for this class selection. When the faculty
 * or the level changes, a stream picked for the old one must be dropped —
 * otherwise Education would be searched with a Management stream.
 */
export function courseFitsSelection(courses, selection) {
    const course = parseInt(selection?.course);
    if (!course) return true;
    const EL = parseInt(selection?.education_level);
    const allowed = EL === HIGHSCHOOL
        ? streamsForFaculty(courses, selection?.faculty)
        : coursesForLevel(courses, EL);
    // Courses not loaded yet: nothing to judge against, keep the value.
    if (!(courses || []).length) return true;
    return allowed.some((c) => parseInt(c?.value) === course);
}

/**
 * The courses a given education level may pick.
 *
 * High school gets level-3 rows and nothing else. Every other level gets
 * everything that is NOT level 3 — including rows whose level is missing:
 * these lists were unfiltered before high school had programmes, and a course
 * disappearing from a college's picker because of a blank column would be a
 * regression. Only the +2 rows are held back.
 */
export function coursesForLevel(courses, education_level) {
    const el = parseInt(education_level);
    return (courses || []).filter((c) => {
        const level = parseInt(c?.education_level);
        return el === HIGHSCHOOL ? level === HIGHSCHOOL : level !== HIGHSCHOOL;
    });
}


export async function saveCourse(data) {
    if (data?.id) return __update('/api/courses', data);
    else return __save('/api/courses', data);
}

export async function deleteCourse(course_id, school_id) {
    return __delete('/api/courses', { id: course_id, school: school_id });
}