// must match with backend/main/constants/payment.py constants!
const TRANSPORTATION = "tn";
// HOSTEL fee — a pseudo-title exactly like transportation. The rate is not in
// the class fee table because it is PER STUDENT: it comes from the room that
// student was given (their hostel allocation's monthly_fee, snapshot at
// check-in). Following `tn` is what makes hostel dues show up in reminder
// bills, receipts and the dues report without any of them knowing the hostel
// module exists.
const HOSTEL = "hs";
// The two ONE-OFF hostel charges, raised once at check-in rather than monthly.
// Separate titles rather than folded into "hs" because a receipt has to say
// which of the three a guardian actually paid, and because a deposit is not
// revenue — it is money HELD, refundable at check-out.
const HOSTEL_ADMISSION = "hsa";
const HOSTEL_DEPOSIT = "hsd";
const HOSTEL_TITLES = [HOSTEL, HOSTEL_ADMISSION, HOSTEL_DEPOSIT];
// The titles whose rate differs student by student, so their entry in a ledger
// table's `details` is keyed by student id rather than being one shared row.
// Anything that walks a ledger's titles must ask this, not compare against
// `tn` — that hard-coded comparison is why adding a second per-student service
// used to mean editing six places.
const PER_STUDENT_TITLES = [TRANSPORTATION, HOSTEL];
const OLD_DUES = "od";
const OPENING_BALANCE = "ob";
// Balancing entry written in a student's OLD academic year when a promotion
// carries their outstanding balance forward into the new year as an opening
// balance. Holds the negative of the carried amount so the old year nets to
// zero (dues are moved, not duplicated). Never a collectable bill on its own.
const CARRY_FORWARD_OUT = "cfo";
const LIBRARY_FINE = "lib_fine";
// Reserved key inside StudentInvoice.details / StudentLedger.details that
// stores the FeeTitle name snapshot at write time. Not a real fee title, so
// every iterator over `details` must skip it.
const TITLE_NAMES_KEY = "__titles";

const INVOICE_DETAILS = {
    AMOUNT: "amt",
    DISCOUNT: "dis",
    DUE: "due",
    TAX_PERCENT: "tdsp",
    TAX_AMOUNT: "tdsa",
};

const PAYMENT_MODES = [
    { name: "cash", value: 1 },
    { name: "bank", value: 2 },
    { name: "cheque", value: 3 },
    { name: "wallet", value: 4 },
]; // MUST MATCH WITH backend/main/models/Invoice.PAYMENT_MODES

export { TRANSPORTATION, HOSTEL, HOSTEL_ADMISSION, HOSTEL_DEPOSIT, HOSTEL_TITLES, PER_STUDENT_TITLES, OLD_DUES, OPENING_BALANCE, CARRY_FORWARD_OUT, LIBRARY_FINE, TITLE_NAMES_KEY, INVOICE_DETAILS, PAYMENT_MODES }