import { __delete, __fetch, __save, __update } from "..";

const EXAMS_SCHEDULE_API = "/api/exams/schedule";

export async function saveExamSchedule(data) {
    if (data?.id) return __update(EXAMS_SCHEDULE_API, data);
    return __save(EXAMS_SCHEDULE_API, data);
}

export async function fetchExamSchedule(class_info_id, exam_id) {
    return __fetch(EXAMS_SCHEDULE_API, { class_info: class_info_id, exam: exam_id });
}

export async function deleteExamSchedule(id, class_info_id) {
    return __delete(EXAMS_SCHEDULE_API, { id, class_info: class_info_id });
}