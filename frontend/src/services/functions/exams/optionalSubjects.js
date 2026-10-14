import { __fetch, __save, __update } from "..";

const OSAURL = "/api/subjects/optional";

export async function saveOptionalSubjectData(data) {
    if (data?.id) return __update(OSAURL, data);
    return __save(OSAURL, data);
}

export async function fetchOptionalSubjectData(school_id, academic_year, class_id, subject_id) {
    return __fetch(OSAURL, {
        school: school_id, academic_year, class: class_id, subject: subject_id
    })
}