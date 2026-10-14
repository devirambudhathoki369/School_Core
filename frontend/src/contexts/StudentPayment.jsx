import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAppContext } from "./AppContext";
import { getStudentLedger } from "@/services/functions/ledgers";
import { getStudentDiscounts } from "@/services/functions/students";
import { fetchInvoice, makePayment } from "@/services/functions/payments";
import { generateInvoice } from "@/methods/payment/invoice";
import { INVOICE_DETAILS, OLD_DUES } from "@/configs/payment";
//
const StudentPaymentContext = createContext({});

export function useStudentPayment() {
    return useContext(StudentPaymentContext);
}

// The backend serializes money (bill_amount / total / rates) as Decimal, which
// arrives in JSON as STRINGS. Downstream we do `+=` arithmetic on these values,
// and JS concatenates strings ("1680" + "9845" => "16809845") instead of adding,
// which produced absurd totals (e.g. Rs. 168009845) and made the save fail.
// Coerce every numeric ledger field to a real Number right after fetch so all
// arithmetic below stays numeric.
function toNum(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}
function numberMap(map) {
    return Object.fromEntries(
        Object.entries(map || {}).map(([k, v]) => [k, toNum(v)])
    );
}
function normalizeLedger(ledger) {
    if (!ledger || typeof ledger !== "object") return ledger;
    return {
        ...ledger,
        bill_amount: numberMap(ledger.bill_amount),
        rates: numberMap(ledger.rates),
        total: toNum(ledger.total),
    };
}

const paymentInfoSchema = { mode: 1, remarks: '', date: '' };
export default function StudentPaymentProvider({ children, studentId, studentClassId, onlyForTrialBalance = false }) {
    const { user: { user },
        fiscalYear: { year, hasFiscalYears },
        notification: { updateNotification } } = useAppContext();
    paymentInfoSchema["date"] = user?.today || '';
    /*1*/const [studentLedger, setStudentLedger] = useState(null);
    /*2*/const [selectedBills, setSelectedBills] = useState({});
    /*3*/const [total, setTotal] = useState(0); // total (selected titles' bill amount);
    /*4*/const [discounts, setDiscounts] = useState({});
    // Read-only: the student's saved profile discounts per title (amount).
    // Shown as a hint in the form; NOT auto-applied to the charge.
    const [profileDiscounts, setProfileDiscounts] = useState({});
    /*5*/const [dues, setDues] = useState({});
    /*6*/const [payingTotal, setPayingTotal] = useState(0); // total (excluding discount) to be paid;
    /*7*/const [discountTotal, setDiscountTotal] = useState(0);
    /*7*/const [remainingTotal, setRemainingTotal] = useState(0); // total (including discount) to be paid;
    /*8*/const [invoice, setInvoice] = useState(null);
    /*9*/const [paymentInfo, setPaymentInfo] = useState(() => ({ ...paymentInfoSchema }));
    const [paymentStatus, setPaymentStatus] = useState(false);
    //
    const [paymentHistory, setPaymentHistory] = useState([]);
    // month-picker
    const [selectedMonths, setSelectedMonths] = useState([]);
    const [pickedAllMonths, setPickedAllMonths] = useState(false);
    // 
    function onSelectAll(_months) {
        setSelectedMonths(_months);
    }
    //
    async function reprintInvoice(invoice_id) {
        const _inv = await fetchInvoice(invoice_id, studentId, user?.profile?.school || user?.profile?.id);
        if (_inv?.invoice) {
            setInvoice(generateInvoice(_inv.invoice, user?.profile, { reprint: true }));
        }
        else updateNotification(400, "Something went wrong!");
    }
    function onPaymentInfoChange({ name, value }) {
        setPaymentInfo(state => ({ ...state, [name]: value }));
    }
    function generateBill(selectedBills, discounts, dues) {
        const bill = Object.keys(selectedBills).reduce((acc, key) => {
            const amount = toNum(selectedBills[key]),
                discount = toNum(discounts?.[key]),
                due = toNum(dues?.[key]);
            if (amount != 0) {
                acc[key] = { [INVOICE_DETAILS.AMOUNT]: amount };
                discount && (acc[key][INVOICE_DETAILS.DISCOUNT] = discount);
                due && (acc[key][INVOICE_DETAILS.DUE] = due);
            }
            return acc;
        }, {});
        return bill;
    }
    async function payStudentFee(e) {
        e.preventDefault();
        setPaymentStatus(true);
        if (!hasFiscalYears()) {
            setPaymentStatus(false);
            return;
        }
        if (!paymentInfo?.date) {
            updateNotification('', "Payment date is required!")
            setPaymentStatus(false);
            return;
        }
        const details = generateBill(selectedBills, discounts, dues);
        const selectedTitles = Object.keys(selectedBills) || [],
            payingTitles = Object.keys(details) || [];
        // TITLES-AMOUNT VALIDATION: every selected title must contribute an amount.
        const contributing = new Set(payingTitles);
        if (contributing.size < 1) {
            updateNotification('', "Enter an amount to pay!");
            setPaymentStatus(false);
            return null;
        }
        for (let title of selectedTitles) {
            if (!contributing.has(title)) {
                const titleStr = studentLedger.titles?.[title] || title;
                updateNotification('', `Invalid data at "${titleStr}"!`);
                setPaymentStatus(false);
                return null;
            }
        }
        // The "old dues" row is always offered (backend getFeeDetails adds it
        // unconditionally), so a lump sum can be typed there even when nothing
        // is carried forward. That books this year's title-wise fees as a
        // single "Old Dues" line on the receipt and in every title-wise
        // report. Settle old dues up to what is actually outstanding, no more.
        // The paying amount settles the balance in full (a discount is part of
        // it, not a deduction from it), so compare the raw amount.
        const oldDuesPaying = Number(selectedBills?.[OLD_DUES]) || 0;
        const oldDuesOutstanding = Math.max(Number(studentLedger?.bill_amount?.[OLD_DUES]) || 0, 0);
        if (oldDuesPaying > oldDuesOutstanding + 0.005) {
            updateNotification('', `Old dues outstanding is only Rs. ${oldDuesOutstanding}. Enter the remaining amount against the actual fee titles.`);
            setPaymentStatus(false);
            return null;
        }
        let amountFromDetails = 0, discountFromDetails = 0;
        Object.values(details).forEach(line => {
            amountFromDetails += toNum(line?.[INVOICE_DETAILS.AMOUNT]);
            discountFromDetails += toNum(line?.[INVOICE_DETAILS.DISCOUNT]);
        });
        const paidFromDetails = amountFromDetails - discountFromDetails;
        // What the student still owes AFTER this payment: everything that was
        // outstanding, less what these lines settle. A line's amount already
        // includes its discount (paid = amount - discount), so the discount is
        // taken off exactly once. See `remainingDue` below for why this is not
        // the on-screen running counter any more.
        const remainingAfterPayment = toNum(studentLedger?.total) - amountFromDetails;
        if (paidFromDetails <= 0) {
            updateNotification('', "Enter an amount to pay!");
            setPaymentStatus(false);
            return null;
        }
        const uploadData = {
            student: studentId,
            school: user?.profile?.school || user?.profile?.id,
            payment_month: selectedMonths.pop(),
            details,
            // Totals come from the lines being saved, not the running
            // on-screen counters: those are built up keystroke by keystroke
            // and a single string slip (discount "0" is a string) turned
            // 15000 into "150000" on a receipt whose lines summed to 15000.
            total_paid: paidFromDetails.toFixed(2),
            total_discount: discountFromDetails.toFixed(2),
            total_due: remainingAfterPayment.toFixed(2),
            ...paymentInfo, // date, payment_mode and remarks
            ...year // economic_year and academic_year
        };
        // TODO: calculate total and warn if found some errors;
        // console.log(uploadData);
        // return null;
        const [status, message, data] = await makePayment(uploadData);
        if (data) {
            updateNotification(200, message);
            const _invoice = generateInvoice(data?.invoice, user?.profile)
            resetLedgerSelection();
            // console.log(status, message, data?.invoice);
            setInvoice(_invoice);
            setSelectedBills({});
            // Refresh dues so the paid fee reflects immediately, without
            // re-selecting the student.
            try {
                const fresh = await getStudentLedger(
                    studentId, studentClassId,
                    user?.profile?.school || user?.profile?.id,
                    year?.academic_year || '',
                );
                if (fresh) setStudentLedger(normalizeLedger(fresh));
            } catch (e) { /* keep the receipt even if refresh fails */ }
        } else {
            updateNotification(400, "Failed to save bill!");
        }
        setPaymentStatus(false);
    }
    function onTitleSelect({ titleId, total }) {
        const _selectedBills = { ...selectedBills };
        let _payingTotal = payingTotal;
        if (titleId in _selectedBills) {
            // removing title from selectedBills;
            // 
            const tpa = toNum(_selectedBills[titleId]);
            setRemainingTotal(state => {
                const rt = state + tpa;
                return rt > 0 ? rt : state;
            });
            _payingTotal -= tpa;
            _payingTotal += toNum(discounts?.[titleId]);
            // 
            delete _selectedBills[titleId];
            // delete due, and discount as well;
            if (dues?.[titleId]) {
                updateDue(titleId, null);
            }
            discounts?.[titleId] && (updateDiscount(titleId, null));
        } else {
            // new title is selected;
            _payingTotal += toNum(total);
            _selectedBills[titleId] = total;
            setRemainingTotal((studentLedger?.total || 0) - _payingTotal);
        }
        setSelectedBills(_selectedBills);
        setPayingTotal(_payingTotal);
        guardianPayingAmount > 0 && setRemaingToDistribute(guardianPayingAmount - _payingTotal);
    }
    function onPayingAmountChange(titleId, value) {
        // Allow the field to be fully cleared: an empty/NaN entry means 0 here,
        // instead of bailing out (which used to snap the old amount back so the
        // box could never be emptied).
        const amount = (value === '' || value === null || value === undefined || isNaN(value)) ? 0 : value;
        const titleOriginalTotal = studentLedger?.bill_amount[titleId];
        const _selectedBills = { ...selectedBills };
        // update payingTotal;
        const prevTotal = toNum(_selectedBills[titleId]);
        const _payingTotal = payingTotal - (prevTotal - toNum(amount));
        setPayingTotal(_payingTotal);
        guardianPayingAmount > 0 && setRemaingToDistribute(guardianPayingAmount - _payingTotal);
        //
        _selectedBills[titleId] = amount; // updated title's total with new value;
        setSelectedBills(_selectedBills);
        //
        let due = toNum(titleOriginalTotal) - toNum(amount); // due or surplus;
        updateDue(titleId, due);
        // 
        const prevDue = dues?.[titleId]
        prevDue && (due -= toNum(prevDue));
        setRemainingTotal(state => (state + due));
    }
    function updateDue(titleId, due) {
        if (due) {
            setDues(state => ({ ...state, [titleId]: due }));
        } else {
            const _dues = { ...dues };
            delete _dues[titleId];
            setDues(_dues);
        }
    }
    /**
     * manages discounts and calculates total_discounted_amount
     */
    function updateDiscount(titleId, discount) {
        const _discounts = { ...discounts };
        if (discount) {
            _discounts[titleId] = discount;
        } else {
            delete _discounts[titleId];
        }
        setDiscounts(_discounts);
        const _totalDiscount = Object.values(_discounts).reduce((acc, val) => {
            acc += toNum(val);
            return acc;
        }, 0);
        setDiscountTotal(_totalDiscount);
    }
    function onDiscountAmountChange(titleId, value) {
        const prevDiscount = toNum(discounts?.[titleId]);
        setPayingTotal(state => toNum(state) - (toNum(value) - prevDiscount));
        updateDiscount(titleId, value);
    }
    function resetInvoice() {
        setInvoice(null);
    }
    function resetLedgerSelection() {
        setSelectedBills({});
        setTotal(0);
        setDiscounts({});
        setDues({});
        setPayingTotal(0);
        setRemaingToDistribute('');
        setRemainingTotal(0);
    }
    function reset() {
        setStudentLedger({});
        resetLedgerSelection();
        resetInvoice();
        setPaymentHistory([]);
        setPaymentInfo({ ...paymentInfoSchema });
    }
    function onDeletePostEvent(index, id) {
        function handleParticulars(item) {
            const data = { ...studentLedger };
            (item?.particulars || []).forEach(p => {
                let [titleId, amount] = p;
                try {
                    titleId = parseInt(titleId);
                } catch (e) { }
                // 
                const billAmt = data?.bill_amount?.[titleId] || 0;
                const newAmt = item?.debit_amount ? (billAmt - amount) : (billAmt + amount)
                if (newAmt >= 0) {
                    data["bill_amount"][titleId] = newAmt;
                }
            });
            // console.log(data);
            setStudentLedger({ ...data });
        }
        // 
        const item = paymentHistory?.[index];
        if (item) {
            if (item?.id === id) {
                handleParticulars(item);
                setPaymentHistory(state => (
                    [...paymentHistory.filter(each => each.id != id)]
                ))
            }
        }
    }
    // GUARDIAN PAYING AMOUNT DISTRIBUTION;
    const [guardianPayingAmount, setGuardianPayingAmount] = useState('');
    const [remainingToDistribute, setRemaingToDistribute] = useState('');
    function onGuardianPayingAmountChange({ _, value }) {
        setGuardianPayingAmount(value);
    }
    function guardianPayingAmountDistribution() {
        let _pa = parseFloat(guardianPayingAmount) || 0;
        if (_pa < 1) {
            updateNotification("", "Paying amount is invalid!");
            return;
        }
        const sortedBills = new Map();
        Object.entries(selectedBills || {})
            .map(e => {
                const amt = studentLedger?.bill_amount?.[e[0]];
                if (amt != 0) sortedBills.set(e[0], amt);
            });
        // 
        if (sortedBills.size < 1) {
            updateNotification('', "No valid paying amount in any title to distribute!");
            return;
        }
        const _selectedBills = new Map();
        const _dues = new Map();
        let _payingTotal = 0;
        sortedBills.forEach((val, key) => {
            let pafk = 0;
            if (_pa > 0) {
                pafk = _pa > val ? val : _pa;
                _pa -= pafk;
            }
            _selectedBills.set(key, pafk);
            const due = val - pafk;
            _dues.set(key, due);
            const amt = _selectedBills.get(key) || 0;
            if (amt > 0) _payingTotal += amt;
        });
        // 
        // console.log(studentLedger.rates);
        // console.log(sortedBills);
        // console.log(sortedRates);
        // console.log(_selectedBills);
        setSelectedBills(Object.fromEntries(_selectedBills));
        setDues(Object.fromEntries(_dues));
        setPayingTotal(_payingTotal);
        guardianPayingAmount > 0 && setRemainingTotal((studentLedger?.total || 0) - _payingTotal);
        setRemaingToDistribute(guardianPayingAmount - _payingTotal);
    }
    function guardianPayingAmountDistributionv1() {
        /*
        This method gives priority to old dues and
        distributes guardian paying amount to those titles which were posted via ledgers and
        also title with highest due is paid first.
        */
        let _pa = parseFloat(guardianPayingAmount) || 0;
        if (_pa < 1) {
            updateNotification('', "Paying amount is invalid!");
            return;
        }
        // console.log(_pa, selectedBills);
        // 
        // TODO: priority to oldDues is the issue!
        const sortedBills = new Map();
        const oldDues = parseFloat(studentLedger?.bill_amount?.[OLD_DUES] || 0);
        if (oldDues >= 0) sortedBills.set(OLD_DUES, oldDues);
        Object.entries(selectedBills || {})
            .filter(e => e[0] !== OLD_DUES)
            .sort((a, b) => b[1] - a[1])
            .map(e => {
                const amt = studentLedger?.bill_amount?.[e[0]];
                if (amt != 0) sortedBills.set(e[0], amt);
            });
        // const sortedRates = new Map(Object.entries(studentLedger?.rates || {})
        //     .filter(e => (e[1] > 0 && !sortedBills?.has(e[0]))) // filter if sortedBills doesn't have e[0]
        //     .sort((a, b) => b[1] - a[1]));
        if (sortedBills.size < 1) {
            updateNotification('', "No valid paying amount in any title to distribute!");
            return;
        }
        const _selectedBills = new Map();
        const _dues = new Map();
        let _payingTotal = 0;
        sortedBills.forEach((val, key) => {
            let pafk = 0;
            if (_pa > 0) {
                pafk = _pa > val ? val : _pa;
                _pa -= pafk;
            }
            _selectedBills.set(key, pafk);
            const due = val - pafk;
            _dues.set(key, due);
            const amt = _selectedBills.get(key) || 0;
            if (amt > 0) _payingTotal += amt;
        });
        // 
        // console.log(studentLedger.rates);
        // console.log(sortedBills);
        // console.log(sortedRates);
        // console.log(_selectedBills);
        setSelectedBills(Object.fromEntries(_selectedBills));
        setDues(Object.fromEntries(_dues));
        setPayingTotal(_payingTotal);
        guardianPayingAmount > 0 && setRemainingTotal((studentLedger?.total || 0) - _payingTotal);
        setRemaingToDistribute(guardianPayingAmount - _payingTotal);
    }
    // 
    useEffect(() => {
        if (!studentId) reset();
        if (!hasFiscalYears()) return null;
        if (!onlyForTrialBalance) {
            (async () => {
                // download student's ledger data
                const _studentLedger = await getStudentLedger(studentId,
                    studentClassId,
                    user?.profile?.school || user?.profile?.id,
                    year?.academic_year || '',
                );
                // console.log(_studentLedger);
                setStudentLedger(_studentLedger ? normalizeLedger(_studentLedger) : null);
                // Read-only: load the student's saved profile discounts and key
                // them by title, purely to show as a hint in the form. This does
                // NOT change any total or what gets charged.
                try {
                    const saved = await getStudentDiscounts(
                        studentId, user?.profile?.school || user?.profile?.id
                    );
                    const _map = {};
                    (saved || []).forEach((d) => {
                        const amount = Number(d.discount) || 0;
                        if (amount > 0) _map[String(d.title)] = amount;
                    });
                    setProfileDiscounts(_map);
                } catch (e) {
                    setProfileDiscounts({});
                }
            })();
        }
        return () => {
            /* console.log('==========================');
            console.log('student-ledger', studentLedger);
            console.log('selected-bills', selectedBills);
            console.log('total', total);
            console.log('discounts', discounts);
            console.log('dues', dues);
            console.log('paying-total', payingTotal);
            console.log('remaining-total', remainingTotal);
            console.log('invoice', invoice);
            console.log('payment-history', paymentHistory);
            console.log('=========================='); */
        }
    }, [studentId]);
    /**
     * The student's remaining dues once the selected lines are paid.
     *
     * This used to be `remainingTotal`, a counter nudged by each handler — and
     * the discount handler never nudged it. After the guardian's lump sum it
     * was recomputed as outstanding − CASH, so a Rs. 25,000 payment carrying a
     * Rs. 2,025 discount against Rs. 32,000 printed "Remaining amount 7000" on
     * the receipt (and texted it to the parent as the balance) while the
     * ledger correctly showed Rs. 4,975. Derived from the lines themselves it
     * cannot drift: outstanding − Σ amount, each amount including its discount.
     */
    const remainingDue = useMemo(() => {
        const titles = Object.keys(selectedBills || {});
        if (titles.length < 1) return 0;
        const settled = titles.reduce((acc, title) => acc + toNum(selectedBills[title]), 0);
        return toNum(studentLedger?.total) - settled;
    }, [selectedBills, studentLedger?.total]);
    //
    return (
        <StudentPaymentContext.Provider value={{
            data: {
                studentId, studentLedger, discounts, profileDiscounts, dues, invoice, payingTotal, discountTotal, remainingTotal: remainingDue,
                paymentInfo, onPaymentInfoChange, paymentStatus
            },
            history: { paymentHistory, setPaymentHistory, onDeletePostEvent },
            selectedBills: { selectedBills, total, setTotal },
            months: { selectedMonths, setSelectedMonths, pickedAllMonths, setPickedAllMonths, onSelectAll },
            methods: {
                onTitleSelect, onPayingAmountChange, onDiscountAmountChange, payStudentFee, reprintInvoice,
                reset, resetInvoice, resetLedgerSelection
            },
            guardianPayingSplit: { guardianPayingAmount, onGuardianPayingAmountChange, guardianPayingAmountDistribution, remainingToDistribute }
        }}>
            {children}
        </StudentPaymentContext.Provider>
    )
}