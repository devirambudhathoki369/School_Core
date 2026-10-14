import Loader from "@/components/Loader";
import ReprintButton from "@/components/buttons/ReprintButton";
import { months } from "@/components/inputs/options/months";
import { useAppContext } from "@/contexts/AppContext";
import { useStudentPayment } from "@/contexts/StudentPayment";
import monthsMapper from "@/methods/monthsMapper";
import { deletePayment, fetchStudentPayments } from "@/services/functions/payments";
import { Accordion, AccordionBody, AccordionHeader, Card, Button } from "@material-tailwind/react";
import { useEffect, useRef, useState } from "react";
import BillsSection from "./BillsSection";
import TaxInvoiceSection from "./TaxInvoiceSection";
import { claimTaxInvoiceNo, ledgerSourceKey } from "@/services/functions/taxInvoice";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import DeleteButton from "@/components/buttons/DeleteButton";
import { deleteLedger } from "@/services/functions/ledgers";
import { ButtonsSecion } from "@/components/sections";
import { useReactToPrint } from "react-to-print";
import ReportHeader from "@/components/tables/ReportHeader";
import hasPermission from "@/methods/hasPermission";
import { PERMISSIONS } from "@/configs/permissions";
import safeDecimal from "@/methods/safeDecimal";
import NotFound from "@/components/NotFound";
import ClosedAcademicYearSelectInput from "@/components/inputs/ClosedAcademicYearSelectInput";
import useClosedAcademicYear from "@/hooks/closedAcademicYear";
import useRequestStatus from "@/hooks/requestStatus";
import { OPENING_BALANCE, CARRY_FORWARD_OUT } from "@/configs/payment";
import { collectionByMode, paymentModeLabel } from "@/methods/payment/collection";
import CollectionSummary from "../CollectionSummary";
import EntryTime from "../EntryTime";

// Carried balances, not charges: an opening balance (or its old-year
// balancing entry) was never billed in this year, so it gets no tax invoice.
// The ledger may send either the raw key or its display label.
const NON_INVOICEABLE_TITLES = [OPENING_BALANCE, CARRY_FORWARD_OUT, "opening balance", "carried forward"];
function isTaxInvoiceable(history) {
    const particulars = history?.particulars || [];
    return particulars.some(([title]) =>
        !NON_INVOICEABLE_TITLES.includes(String(title ?? '').trim().toLowerCase()));
}

// TRIAL BALANCE;
function StudentPaymentHistory({ selectedStudent = null }) {
    const { user: { user },
        fiscalYear: { year },
        notification: { updateNotification },
        prompt: { toggleConfirmationPrompt } } = useAppContext();
    const [open, setOpen] = useState(false);
    const { history: { paymentHistory, setPaymentHistory, onDeletePostEvent },
        data: { studentId, invoice },
        methods: { reprintInvoice, resetInvoice } } = useStudentPayment();
    const [balances, setBalances] = useState(0);
    const [totalBalance, setTotalBalance] = useState(0);
    const [titles, setTitles] = useState({});
    // Tax invoice for a debit (Dr.) row — the fee posting, printed on demand.
    const [taxInvoice, setTaxInvoice] = useState(null);
    const { closedAcademicYear, onClosedAcademicYearSelect } = useClosedAcademicYear();
    const balanceSheetRef = useRef();
    const { fetching, statusHandler } = useRequestStatus();

    const printBalanceSheet = useReactToPrint({
        content: () => balanceSheetRef.current,
    });

    useEffect(() => {
        if (open) {
            // fetch history;
            (async () => {
                statusHandler.toggleFetching();
                const res = await fetchStudentPayments(studentId, user?.profile?.school || user?.profile?.id, closedAcademicYear || year?.academic_year || '');
                if (res) {
                    const { data, titles } = res;
                    let total = 0;
                    const balances = data?.reduce((acc, val) => {
                        val?.debit_amount ?
                            (total += val.debit_amount) :
                            (total -= (val?.credit_amount || val?.discount_amount || 0))
                        total = safeDecimal(total);
                        acc.push(total);
                        return acc;
                    }, []);
                    setBalances(balances);
                    setTotalBalance(total);
                    setPaymentHistory(data);
                    setTitles(titles);
                }
                statusHandler.toggleFetching();
                // console.log('fetching history for', studentId);
            })();
        }
    }, [open, studentId, closedAcademicYear]);
    // 
    const classes = {
        grid: 'grid grid-cols-16 gap-x-2 justify-between items-start border-b text-center border-gray-400',
        month: 'text-black p-1 rounded-md',
        // The ledger is a 16-column table; squeezing it into a phone width makes
        // every cell unreadable (see the wrapped "Acade Remar Nths" headings).
        // Keep the table's shape and let it scroll sideways instead.
        scroller: 'overflow-x-auto print:overflow-visible',
        sheet: 'min-w-[70rem] print:min-w-0'
    }
    // Builds the printable tax invoice straight off the ledger row: the date is
    // the posting's own date, never today's.
    async function buildTaxInvoice(history) {
        const rowMonths = typeof history?.months === 'number'
            ? [months[history.months]]
            : monthsMapper(history?.months || []);
        // The number is minted on the first print and reused on every reprint,
        // so the guardian's copy and ours always carry the same invoice no.
        const taxInvoiceNo = await claimTaxInvoiceNo({
            school: user?.profile?.school || user?.profile?.id,
            source_key: ledgerSourceKey(history.id),
            student: studentId,
            date: history?.date,
        });
        if (!taxInvoiceNo) {
            updateNotification(400, "Could not issue a tax invoice number!");
            return null;
        }
        return {
            invoiceId: taxInvoiceNo,
            date: history?.date || '',
            studentId: studentId || '',
            studentName: selectedStudent?.name || '',
            class: history?.classname || selectedStudent?.classname || '',
            academicYear: history?.academic_year_name || '',
            months: rowMonths,
            particulars: (history?.particulars || [])
                .map(([title, amount]) => [titles?.[title] || title, amount]),
            total: history?.debit_amount || 0,
            remarks: history?.remarks || '',
            cashier: user?.profile?.signature ||
                (user?.profile?.school && user?.profile?.name?.split(' ')?.shift()?.toLowerCase()) ||
                'admin',
        };
    }
    //
    // A debit row is a fee posting (charge), a credit row is a payment/discount.
    // They read very differently, so they are tinted differently — with a left
    // accent bar so the distinction survives printing without backgrounds.
    function rowTone(history) {
        return TsxDifferentiator.isInvoice(history) || history?.discount_amount
            ? 'bg-emerald-50/60 border-l-4 border-l-emerald-500'
            : 'bg-amber-50/60 border-l-4 border-l-amber-500';
    }
    // 
    return (
        <div className="px-3">
            <Accordion open={open}
                icon={open ?
                    <ChevronUpIcon className="w-6 h-6" /> :
                    <ChevronDownIcon className="w-6 h-6" />}
            >
                <AccordionHeader onClick={() => {
                    setOpen(state => !state);
                }}>
                    <h2 className="text-xl font-semibold leading-7 text-gray-900">Student's Trial Balance</h2>
                </AccordionHeader>
                <AccordionBody>
                    {fetching ? <Loader /> :
                        <Card className="flex flex-col p-2 bg-teal-100">
                            {paymentHistory?.length > 0 ?
                                <>
                                    <div className="flex flex-wrap gap-2 items-end justify-between pb-2 mb-2 border-b border-gray-500">
                                        <ClosedAcademicYearSelectInput value={closedAcademicYear} onChange={onClosedAcademicYearSelect} showRunning={true} />
                                        <ButtonsSecion>
                                            <Button variant="outlined" onClick={printBalanceSheet}>Print</Button>
                                        </ButtonsSecion>
                                    </div>
                                    <div ref={balanceSheetRef}>
                                        <ReportHeader />
                                        <CollectionSummary totals={collectionByMode(paymentHistory, row => row.credit_amount || 0)} />
                                        {selectedStudent &&
                                            <div className="text-base font-semibold capitalize py-2">
                                                Name: {selectedStudent.name} &nbsp;
                                                Class: {
                                                    (closedAcademicYear &&
                                                        paymentHistory?.find(h => h?.classname)?.classname)
                                                    || selectedStudent.classname
                                                }
                                            </div>
                                        }
                                        <div className={classes.scroller}>
                                        <div className={classes.sheet}>
                                        <div className={`${classes.grid} font-semibold p-2 bg-table-header rounded-md`}>
                                            <span>S.N</span>
                                            <span>Invoice no.</span>
                                            <span>Date</span>
                                            <span className="col-span-3">Particular</span>
                                            <span>Dr.</span>
                                            <span>Cr.</span>
                                            <span>Payment mode</span>
                                            <span>Balance</span>
                                            <span>Class</span>
                                            <span>Academic Year</span>
                                            <span>Remarks</span>
                                            <span className="col-span-2">Months</span>
                                            <span></span>
                                        </div>
                                        <div className="children-text-base">
                                            {
                                                <>
                                                    {
                                                        paymentHistory.map((history, sn) => {
                                                            const hasDeletePermission = hasPermission(user,
                                                                history?.credit_amount ?
                                                                    PERMISSIONS.STUDENT.DELETE_INVOICE :
                                                                    PERMISSIONS.STUDENT.DELETE_LEDGER);

                                                            return (
                                                                <div key={sn} className={`${classes.grid} ${rowTone(history)} py-2`}>
                                                                    <span>{sn + 1}</span>
                                                                    <span>{history?.invoice_id}</span>
                                                                    <span>
                                                                        {history?.date}
                                                                        <EntryTime row={history} />
                                                                    </span>
                                                                    <span className="col-span-3 flex flex-col px-2 border border-gray-400 border-dotted">
                                                                        {
                                                                            history?.particulars
                                                                                ?.map((detail, detailIndex) => {
                                                                                    const [title, amount] = detail;
                                                                                    return (
                                                                                        <span key={detailIndex} className="flex justify-between">
                                                                                            <span className="font-semibold capitalize">{titles?.[title] || title}</span>
                                                                                            <span>{amount}</span>
                                                                                        </span>
                                                                                    )
                                                                                })
                                                                        }
                                                                    </span>
                                                                    {/* total-due */}
                                                                    <span className={history?.debit_amount ? 'font-semibold text-amber-900' : ''}>
                                                                        Rs. {history?.debit_amount || '0.00'}
                                                                    </span>
                                                                    {/* total-paid */}
                                                                    <span className={(history?.credit_amount || history?.discount_amount) ? 'font-semibold text-emerald-900' : ''}>
                                                                        Rs. {history?.credit_amount || history?.discount_amount || '0.00'}
                                                                    </span>
                                                                    <span>{history?.credit_amount !== undefined ? paymentModeLabel(history.mode) : '—'}</span>
                                                                    <span>Rs. {balances[sn]}</span>
                                                                    <span className="capitalize">{history?.classname || '-'}</span>
                                                                    <span>{history?.academic_year_name || '-'}</span>
                                                                    <span className="break-words">{history?.remarks || '-'}</span>
                                                                    <div className="capitalize col-span-2 text-left flex flex-wrap items-center gap-x-1">
                                                                        {
                                                                            typeof (history.months) === 'number' ?
                                                                                <>
                                                                                    <span className={classes.month}>{months[history.months]}</span>
                                                                                </>
                                                                                :
                                                                                <>
                                                                                    {monthsMapper(history?.months || [])?.map((month, mi) => (
                                                                                        <span className={classes.month} key={mi}>{month}</span>
                                                                                    ))}
                                                                                </>
                                                                        }
                                                                    </div>
                                                                    <div className="flex justify-end gap-x-2 hide-from-print">
                                                                        <>
                                                                            {history?.credit_amount != undefined ?
                                                                                <span>
                                                                                    <ReprintButton onClick={async () => {
                                                                                        setTaxInvoice(null);
                                                                                        await reprintInvoice(history.id);
                                                                                    }} />
                                                                                </span> :
                                                                                (history?.debit_amount && isTaxInvoiceable(history)) ?
                                                                                    <span>
                                                                                        <ReprintButton onClick={async () => {
                                                                                            resetInvoice();
                                                                                            setTaxInvoice(await buildTaxInvoice(history));
                                                                                        }} />
                                                                                    </span> :
                                                                                    <span></span>
                                                                            }
                                                                        </>
                                                                        <>
                                                                            {(hasDeletePermission && !history?.discount_amount && !closedAcademicYear) &&
                                                                                <span>
                                                                                    <DeleteButton onClick={async () => {
                                                                                        const promptData = { ask_reason: true };
                                                                                        const schoolID = user?.profile?.school || user?.profile?.id;
                                                                                        if (TsxDifferentiator.isInvoice(history)) {
                                                                                            // delete invoice
                                                                                            promptData['header'] = "Are you sure delete invoice?";
                                                                                            promptData['action'] = async (reason) => await deletePayment(history.id, schoolID, reason);
                                                                                        } else if (TsxDifferentiator.isLedger(history)) {
                                                                                            // delete ledger
                                                                                            promptData['header'] = "Are you sure delete ledger?";
                                                                                            promptData['action'] = async (reason) => await deleteLedger(history.id, schoolID, reason);
                                                                                        } else {
                                                                                            updateNotification('', "Something went wrong!");
                                                                                            return;
                                                                                        }
                                                                                        // 
                                                                                        promptData['onConfirm'] = async (reason) => {
                                                                                            if (typeof promptData['action'] !== 'function') {
                                                                                                return;
                                                                                            }
                                                                                            const [status, message] = await promptData['action'](reason);
                                                                                            if (status) {
                                                                                                updateNotification(status, message);
                                                                                                if (status === 200) {
                                                                                                    onDeletePostEvent(sn, history.id);
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                        toggleConfirmationPrompt(promptData);
                                                                                    }} />
                                                                                </span>
                                                                            }
                                                                        </>
                                                                    </div>
                                                                </div>
                                                            )
                                                        })
                                                    }
                                                </>
                                            }
                                            <div className={`${classes.grid} text-right py-1`}>
                                                <span className="col-span-2"></span>
                                                <span className="text-base font-semibold capitalize">Total</span>
                                                <span className="col-span-2"></span>
                                                <span className="font-semibold">Rs. {totalBalance}</span>
                                                <span className="col-span-5"></span>
                                            </div>
                                        </div>
                                        </div>
                                        </div>
                                    </div>
                                </> :
                                <NotFound />}
                        </Card>
                    }
                </AccordionBody>
            </Accordion>
            <BillsSection invoice={invoice} onClose={resetInvoice} />
            <TaxInvoiceSection invoice={taxInvoice} onClose={() => setTaxInvoice(null)} />
        </div >
    )
}

const TsxDifferentiator = {
    isLedger: (tsx) => {
        return tsx?.debit_amount && !tsx?.credit_amount;
    },
    isInvoice: (tsx) => {
        return tsx?.credit_amount && !tsx?.debit_amount;
    }
};

export default StudentPaymentHistory;
