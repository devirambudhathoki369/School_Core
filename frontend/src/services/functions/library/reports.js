import { __fetch } from "@/services/functions";
import cleanEmptyFields from "@/methods/cleanEmptyFields";

const LIB_REPORTS_API = "/library/reports";

/**
 * Unified library reports fetcher.
 * @param {string} school_id
 * @param {string} report  one of: daily | issued-by-students | issued-by-teachers |
 *                          issued-returned-count | overall | book-operation | fine |
 *                          member-profile
 * @param {Object} params  report-specific query params (date, start, end, student, staff)
 */
export async function libraryReport(school_id, report, params = {}) {
    return __fetch(LIB_REPORTS_API, cleanEmptyFields({ school: school_id, report, ...params }));
}
