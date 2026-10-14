import { __fetch, __save, __update } from "..";

const GRADING_RULES_API = "/api/exams/grading_rules";
export async function saveGradingRules(data) {
    if (data?.id) return __update(GRADING_RULES_API, data);
    return __save(GRADING_RULES_API, data);
}

export async function fetchGradingRules(school_id, type) {
    return __fetch(GRADING_RULES_API, { school: school_id, type });
}