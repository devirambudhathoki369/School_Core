import { __delete, __fetch, __save, __update } from "..";

const EXAM_RESULTS_API = "/api/exams/results";
export async function saveExamResult(data) {
    if (data?.id) return __update(EXAM_RESULTS_API, data);
    return __save(EXAM_RESULTS_API, data);
}

/**
 * Deletes a marks header (ClassResult) so a cleared subject stops
 * showing as an empty/NG column on the gradesheet.
 */
export async function deleteExamResult({ id, school, exam, class_info }) {
    return __delete(EXAM_RESULTS_API, { id, school, exam, class_info });
}

/**
 * @param {*} type "letter" or "number"
 * @returns 
 */
export async function fetchExamResults(class_info_id, exam_id, subject_id = '', student_id = '', type = "number", publish = '', school_info = '', ledger = '', academic_year = '', school = '', student_status = '') {
    return __fetch(EXAM_RESULTS_API,
        { class_info: class_info_id, exam: exam_id, subject: subject_id, student: student_id, type, publish, school_info, ledger, academic_year, school, student_status });
}

export async function publishResults(data) {
    return __update(EXAM_RESULTS_API, data);
}