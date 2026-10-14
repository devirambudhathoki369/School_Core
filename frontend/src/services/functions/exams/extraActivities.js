import { __fetch, __fetchAsOptions, __save, __update } from "..";

const EXTRA_ACTIVITIES_API = "/api/extra_activities";
export async function saveExtraActivities(data) {
    if (data?.id) return __update(EXTRA_ACTIVITIES_API, data);
    return __save(EXTRA_ACTIVITIES_API, data);
}

export async function fetchExtraActivities(school_id) {
    return __fetch(EXTRA_ACTIVITIES_API, { school: school_id });
}

// 
const EXTRA_ACTIVITIES_ENTRY_API = "/api/extra_activities_entry";
export async function saveExtraActivitiesEntry(data) {
    return __save(EXTRA_ACTIVITIES_ENTRY_API, data);
}

export async function fetchExtraActivitiesEntries(school_id, exam_id, class_info_id, student_id = '') {
    return __fetch(EXTRA_ACTIVITIES_ENTRY_API, {
        school: school_id, exam: exam_id, class_info: class_info_id, student: student_id
    })
}