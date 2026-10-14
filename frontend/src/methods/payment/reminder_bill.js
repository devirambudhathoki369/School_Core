import { months } from "@/components/inputs/options/months";

const reminderBillSample = {
    pan: '', // user?.profile?.pan
    estd_date: '',
    schoolName: '', // user?.profile?.name
    contact: '', // user?.profile?.contact
    telephone: '', // user?.profile?.telephone
    // invoiceId: '',
    // payment_mode: '',
    date: '',
    guardianName: '',
    studentName: '',
    class: '',
    postingMonth: '',
    details: [
        // { title: 'bus fair', rate: '350', amount: '700' },
        // { title: 'monthly', rate: '1000', amount: '3000' },
    ],
    total: '',
    due: '',
    cashier: '', // user?.profile?.signature
    remarks: '',
};
export function generateReminderBill(reminderBill, userProfile) {
    if (!reminderBill) return null;
    const _reminderBill = { ...reminderBillSample };
    _reminderBill['pan_no'] = userProfile?.pan_no || '';
    _reminderBill['estd_date'] = userProfile?.estd_date?.split('-')?.[0] || '';
    _reminderBill['schoolName'] = userProfile?.name || '';
    _reminderBill['address'] = userProfile?.address || '';
    _reminderBill['contact'] = userProfile?.contact || '';
    _reminderBill['telephone'] = userProfile?.telephone || '';
    _reminderBill['email'] = userProfile?.email || '';
    // _reminderBill['payment_mode'] = reminderBill?.payment_mode || '';
    // _reminderBill['reminderBillId'] = reminderBill?.reminderBill_id || ''; //
    _reminderBill['date'] = reminderBill?.date || ''; //
    _reminderBill['guardianName'] = reminderBill?.guardian_name || ''; //
    _reminderBill['studentId'] = reminderBill?.student_id || ''; //
    _reminderBill['studentName'] = reminderBill?.student_name || ''; //
    _reminderBill['class'] = reminderBill?.class || ''; //
    _reminderBill['postingMonth'] = months?.[reminderBill?.payment_month] || ''; //
    _reminderBill['particulars'] = reminderBill?.particulars || []; //
    _reminderBill['total'] = reminderBill?.total_paid || ''; //
    _reminderBill['due'] = reminderBill?.total_due || ''; //
    _reminderBill['discount'] = reminderBill?.total_discount || null;
    _reminderBill['cashier'] = userProfile?.signature || 'admin';
    _reminderBill['remarks'] = reminderBill?.remarks || '';
    return _reminderBill;
}