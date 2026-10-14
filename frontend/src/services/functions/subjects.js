import { __delete, __fetch, __fetchAsOptions, __save, __update } from ".";

const SUBJECTS_API = "/api/subjects";

export async function fetchSubjects(school_id, as_options = '', optional = '', credit_hours = '', class_id = '') {
    if (as_options) {
        return __fetchAsOptions(SUBJECTS_API, { school: school_id, as_options, optional, credit_hours, class_info: class_id }, { name: 'subject' });
    }
    return __fetch(SUBJECTS_API, { school: school_id, optional, credit_hours, class_info: class_id });
}


export async function saveSubject(data) {
    if (data?.id) return __update(SUBJECTS_API, data, false);
    else return __save(SUBJECTS_API, data);
}

export async function deleteSubject(subject_id, school_id) {
    return __delete(SUBJECTS_API, { id: subject_id, school: school_id });
}