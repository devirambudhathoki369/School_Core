import { months } from "@/components/inputs/options/months";

const invoiceSample = {
    pan: '', // user?.profile?.pan
    schoolName: '', // user?.profile?.name
    contact: '', // user?.profile?.contact
    telephone: '', // user?.profile?.telephone
    invoiceId: '',
    payment_mode: '',
    date: '',
    guardianName: '',
    studentName: '',
    class: '',
    paymentMonth: '',
    details: [
        // { title: 'bus fair', rate: '350', amount: '700' },
        // { title: 'monthly', rate: '1000', amount: '3000' },
    ],
    total: '',
    due: '',
    cashier: '', // user?.profile?.signature
    remarks: '',
};

/**
 * `reprint` marks a receipt opened again from a list, as against the one shown
 * the moment the payment is saved: the heading says so, so a second copy cannot
 * pass for the original.
 */
export function generateInvoice(invoice, userProfile, { reprint = false } = {}) {
    if (!invoice) return null;
    const currentUser = userProfile?.role ? userProfile?.name : "admin";
    // Who entered the bill, and when, is the server's to say: it reads the
    // account that saved it. The name used to fall back to whoever was signed
    // in whenever the server sent none, which was every first print and every
    // bill entered from the school's own login: reprinted by a member of
    // staff, such a bill came out signed by that member of staff. A bill older
    // than the server's record names nobody rather than the person reading
    // it. (`entered_on` missing altogether is a server that does not send any
    // of this yet.)
    const serverNamesTheCashier = invoice?.entered_on !== undefined;

    const _invoice = { ...invoiceSample };
    _invoice['pan_no'] = userProfile?.pan_no || userProfile?.school_pan_no || '';
    _invoice['estd_date'] = (userProfile?.estd_date || userProfile?.school_estd_date)?.split('-')?.[0] || '';
    _invoice['schoolName'] = userProfile?.school_name || userProfile?.name || '';
    _invoice['address'] = userProfile?.address || userProfile?.school_address || '';
    _invoice['contact'] = userProfile?.contact || userProfile?.school_contact || '';
    _invoice['telephone'] = userProfile?.telephone || userProfile?.school_telephone || '';
    _invoice['email'] = userProfile?.email || userProfile?.school_email || '';
    _invoice['payment_mode'] = invoice?.payment_mode || '';
    _invoice['invoiceId'] = invoice?.invoice_id || ''; //
    _invoice['date'] = invoice?.date || ''; //
    _invoice['guardianName'] = invoice?.guardian_name || ''; //
    _invoice['studentId'] = invoice?.student_id || ''; //
    _invoice['studentName'] = invoice?.student_name || ''; //
    _invoice['class'] = invoice?.class || ''; //
    _invoice['studentAddress'] = invoice?.student_address || ''; //
    _invoice['paymentMonth'] = months?.[invoice?.payment_month] || ''; //
    _invoice['particulars'] = invoice?.particulars || []; //
    _invoice['total'] = invoice?.total_paid || ''; //
    _invoice['due'] = invoice?.total_due || ''; //
    _invoice['discount'] = invoice?.total_discount || null;
    _invoice['cashier'] = serverNamesTheCashier ? (invoice?.cashier || '') : (invoice?.cashier || currentUser);
    _invoice['enteredOn'] = invoice?.entered_on || '';
    _invoice['enteredTime'] = invoice?.entered_time || '';
    _invoice['deleted'] = invoice?.deleted || null; // { by, on, time } of a deleted bill
    _invoice['reprint'] = reprint;
    _invoice['remarks'] = invoice?.remarks || '';
    _invoice['isCashReceipt'] = invoice?.isCashReceipt || false;
    return _invoice;
}