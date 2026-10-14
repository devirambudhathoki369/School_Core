import cleanEmptyFields from "@/methods/cleanEmptyFields";
import { __delete, __fetch, __save, __search, __update } from ".";

const LEDGERS_API = "/api/ledgers";

export async function saveLedgers(data, clean = true) {
    return __save(LEDGERS_API, data, clean);
}

/**
 * What this class has already been billed for.
 * Returns [status, message, {months, studentTitles}] where
 * - months : months a CLASS-WIDE posting already covers — nobody can be posted
 *            them again, so the picker blocks them.
 * - studentTitles : {student_id: {title_id: [months]}} already billed to that
 *            student (mostly profile catch-ups). Those months stay selectable
 *            for the class; the holder simply isn't charged that title again.
 *            Per title, because posting the same month for a DIFFERENT title is
 *            a normal second charge, not a duplicate.
 * Tolerates the older bare-array response so a stale bundle still works.
 */
export async function fetchPreviousPostings(classDetails, academic_year) {
    classDetails = cleanEmptyFields(classDetails);
    const [status, message, data] = await __search('/api/search/postings',
        { ...classDetails, academic_year, include_student_months: true }) || [];
    const postings = Array.isArray(data)
        ? { months: data, studentTitles: {} }
        : { months: data?.months || [], studentTitles: data?.student_titles || {} };
    return [status, message, postings];
}

export async function getRecentPostings(school_id, page, cursor) {
    return __fetch(LEDGERS_API, { school: school_id, page, cursor });
}

const LP_SEARCH_API = "/api/ledgers/history"
export async function searchLedgerPostingHistory(data) {
    return __search(LP_SEARCH_API, data);
}

/**
 * `months` pins a reminder bill / tax invoice to one posted period ("1,2,3" as
 * the month picker hands it over). Left empty, the newest posting is used.
 */
export async function getLedgers(school_id, ledger_id, class_id, academic_year, reminder = '', month = '', student_id = '', months = '') {
    return __fetch(LEDGERS_API, { school: school_id, ledger: ledger_id, class: class_id, academic_year, reminder, month, student: student_id, months });
}

// The month groups this class has been posted for, each flagged with whether
// THIS student already holds it. Asked for explicitly (`posted_months`) because
// sending a student id alone means "merge this student's ledgers", which is a
// different question.
export async function getPostedMonths(school_id, class_id, academic_year, student_id = '') {
    return __fetch(LEDGERS_API, {
        school: school_id, class: class_id, academic_year,
        posted_months: true, student: student_id,
    });
}

export async function getStudentLedger(student_id, class_id, school_id, academic_year, reminder = '') {
    return __fetch(LEDGERS_API, { student: student_id, class: class_id, school: school_id, academic_year, reminder });
}

export async function deleteLedger(ledger_id, school_id, remarks) {
    return __update(LEDGERS_API, { id: ledger_id, school: school_id, remarks });
}

export async function getOpeningBalanceReport(school_id, academic_year, status = '', include_zero = false) {
    return __fetch(LEDGERS_API, {
        school: school_id, academic_year, opening_balance_report: true,
        status, include_zero: include_zero ? true : ''
    })
}

// Opening balances staff cleared by hand. Kept a separate call so the report's
// own response stays the plain list every deployed client expects.
export async function getWaivedOpeningBalances(school_id, academic_year) {
    return __fetch(LEDGERS_API, {
        school: school_id, academic_year, opening_balance_report: true, waived: true
    })
}

// STAFF LEDGERS
const STAFF_LEDGERS_API = "/api/staff_ledgers";
export async function saveSalaryPostings(data, clean = true) {
    return __save(STAFF_LEDGERS_API, data, clean);
}

export async function fetchStaffLedgers(school_id, academic_year = '', economic_year = '', months = '', staff_id = '',) {
    return __fetch(STAFF_LEDGERS_API, {
        school: school_id, staff: staff_id, academic_year, economic_year, months
    })
}

export async function deleteStaffLedger(ledger_id, school_id, remarks) {
    return __update(STAFF_LEDGERS_API, { id: ledger_id, school: school_id, remarks });
}