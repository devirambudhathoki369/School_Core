import { __fetch, __fetchAsOptions, __save, __update } from ".";

const CLASSES_API = "/api/classes";

export function fetchClasses(school_id, fees_count = '') {
    return __fetch(CLASSES_API, { school: school_id, fees_count });
}

export function saveClass(data) {
    if (data?.id) return __update(CLASSES_API, data);
    else return __save(CLASSES_API, data);
}

// class -> periods

const CLASS_PERIODS_API = "/api/classes/periods";

export async function saveClassPeriods(data) {
    if (data?.id) return __update(CLASS_PERIODS_API, data, false);
    else if (Number(data?.period_count) > 0) return __save(CLASS_PERIODS_API, data);
}

export async function fetchClassPeriod(class_info_id, detailed = '', teachers = '', subjects = '', academic_year = '') {
    return __fetch(CLASS_PERIODS_API, { class_info: class_info_id, detailed, teachers, subjects, academic_year });
}

export async function fetchClassPeriodSubjects(class_info_id, detailed = '', as_options = '', staff_id = '', strict = '', include_codes = '', academic_year_id = '') {
    const params = { class_info: class_info_id, subjects: true, detailed, staff: staff_id, strict, include_codes, academic_year: academic_year_id };
    if (as_options) return __fetchAsOptions(CLASS_PERIODS_API, params, { name: 'subject' });
    return __fetch(CLASS_PERIODS_API, params);
}
export async function fetchClassPeriodTeachers(class_info_id, detailed = '') {
    const params = { class_info: class_info_id, teachers: true, detailed };
    if (as_options) return __fetchAsOptions(CLASS_PERIODS_API, params, { name: 'name' });
    return __fetch(CLASS_PERIODS_API, params);
}

export async function fetchClassesInOrder(user, fees_count = '') {
    let _classes = await fetchClasses(user?.profile?.school || user?.profile?.id, fees_count);
    _classes = Object.values(_classes || {}).sort((c1, c2) => {
        const [, c1_class_info,] = c1;
        const [, c2_class_info,] = c2;
        // Check education level first for montessory
        if (c1_class_info.education_level === 1 && c2_class_info.education_level !== 1) {
            return -1;  // c1 comes first
        } else if (c2_class_info.education_level === 1 && c1_class_info.education_level !== 1) {
            return 1;  // c2 comes first
        }
        // 
        const aHasSection = "section" in c1_class_info;
        const bHasSection = "section" in c2_class_info;

        if (!aHasSection && bHasSection) return -1; // c1 without section comes first
        if (aHasSection && !bHasSection) return 1;  // c2 without section comes first

        // If both have sections, compare by grade, then section
        if (aHasSection && bHasSection) {
            if (c1_class_info.grade !== c2_class_info.grade) {
                return c1_class_info.grade - c2_class_info.grade;  // Compare by grade
            }
            return c1_class_info.section - c2_class_info.section;  // Compare by section
        }

        // If neither has a section, just compare by grade
        return c1_class_info.grade - c2_class_info.grade;
    });
    return _classes;
}