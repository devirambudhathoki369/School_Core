import cleanEmptyFields from "@/methods/cleanEmptyFields";
import { __fetch, __save, __search, __update } from "@/services/functions";

const LIB_BOOKS_API = "/library/books";

/**
 * @param {Object} search_params {title:'', barcode: boolean, selectedBooks: []}
 */
export async function fetchBooks(school_id, page = '', cursor = '', search_params = {}) {
    const params = { school: school_id, page, cursor, ...search_params };
    return __fetch(LIB_BOOKS_API, params);
}

export async function saveBook(data, clean = true) {
    if (data?.id) return __update(LIB_BOOKS_API, data, clean);
    return __save(LIB_BOOKS_API, data, clean);
}

// full single-book record, used to prefill the edit modal.
export async function fetchBook(school_id, id) {
    return __fetch(LIB_BOOKS_API, { school: school_id, id, full: true });
}

// 
export async function searchBook(data) {
    return __search("/library/books/search", data);
}

// 
const LIB_BOOK_ISSUE_API = "/library/books/issue";

export async function issueBook(issueData) {
    return __save(LIB_BOOK_ISSUE_API, issueData);
}

/**
 * @param {Object} date_params {issue_date_start:'', issue_date_end:'', return_date_start:'', return_date_end:''}
 */
export async function fetchIssuedBooks(school_id, student_id = '', staff_id = '', page = '', cursor = '', returned = '', date_params) {
    const params = cleanEmptyFields({ school: school_id, student: student_id, staff: staff_id, page, cursor, returned, ...date_params });
    return __fetch(LIB_BOOK_ISSUE_API, params);
}

// 
export async function renewBookIssue(data) {
    return __update(LIB_BOOK_ISSUE_API, data);
}

export async function returnBookIssue(data) {
    return __update(LIB_BOOK_ISSUE_API, data);
}