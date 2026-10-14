import { __delete, __fetch, __fetchAsOptions, __save, __update } from "..";

const EXAMS_API = "/api/exams";

export async function saveExam(data, cleanEmptyFields = false) {
    if (data?.id) return __update(EXAMS_API, data, cleanEmptyFields);
    else return __save(EXAMS_API, data, cleanEmptyFields);
}

export async function fetchExams(school_id, academic_year = '', as_options = '') {
    if (as_options) return __fetchAsOptions(EXAMS_API,
        { school: school_id, academic_year, as_options },
        { name: 'name' });
    return __fetch(EXAMS_API, { school: school_id, academic_year, as_options });
}