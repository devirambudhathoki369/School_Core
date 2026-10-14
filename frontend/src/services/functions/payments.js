// PAYMENT INVOICE
import { __save, __fetch, __delete, __update } from "."

const PAYMENTS_API = '/api/payments';

/* 
* get all invoices of a student; \
* for trial balance (student's payment history)!
*/
export async function fetchStudentPayments(student_id, school_id, academic_year = '') {
    return __fetch(PAYMENTS_API, { school: school_id, student: student_id, academic_year });
}

/**
 * for view_transactions;
 */
export async function fetchTransactions(school_id, page, cursor) {
    return __fetch(PAYMENTS_API, { school: school_id, page, cursor });
}

export async function fetchInvoice(invoice_id, student_id, school_id) {
    return __fetch(PAYMENTS_API, { id: invoice_id, student: student_id, school: school_id });
}

export async function makePayment(data) {
    return __save(PAYMENTS_API, data);
}

export async function deletePayment(invoice_id, school_id, remarks) {
    return __update(PAYMENTS_API, { id: invoice_id, school: school_id, remarks });
}

// staff payment
const STAFF_PAYMENT_API = "/api/staff_payments";

export async function makeStaffPayment(data) {
    return __save(STAFF_PAYMENT_API, data);
}

// recent staff transactions;
export async function fetchStaffRecentTransactions(school_id, page, cursor) {
    return __fetch(STAFF_PAYMENT_API, { school: school_id, page, cursor });
}

export async function fetchStaffInvoice(invoice_id, staff_id, school_id) {
    return __fetch(STAFF_PAYMENT_API, { id: invoice_id, staff: staff_id, school: school_id });
}

export async function deleteStaffPayment(invoice_id, school_id, remarks) {
    return __update(STAFF_PAYMENT_API, { id: invoice_id, school: school_id, remarks });
}

// trial-balance;
export async function fetchStaffPayments(staff_id, school_id) {
    return __fetch(STAFF_PAYMENT_API, { school: school_id, staff: staff_id });
}