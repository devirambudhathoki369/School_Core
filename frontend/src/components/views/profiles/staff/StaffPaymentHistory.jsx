import { useAppContext } from "@/contexts/AppContext";
import { useStaffProfile } from "@/contexts/StaffProfile";
import { deleteStaffPayment, fetchStaffInvoice, fetchStaffPayments } from "@/services/functions/payments";
import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { Accordion, AccordionBody, AccordionHeader, Card, Button } from "@material-tailwind/react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { ButtonsSecion } from "@/components/sections";
import ReportHeader from "@/components/tables/ReportHeader";
import hasPermission from "@/methods/hasPermission";
import { PERMISSIONS } from "@/configs/permissions";
import monthsMapper from "@/methods/monthsMapper";
import { months } from "@/components/inputs/options/months";
import ReprintButton from "@/components/buttons/ReprintButton";
import Loader from "@/components/Loader";
import DeleteButton from "@/components/buttons/DeleteButton";
import PaySlipSection from "../../payments/staff/PaySlipSection";
import EntryTime from "../../payments/EntryTime";
import { deleteStaffLedger } from "@/services/functions/ledgers";
import safeDecimal from "@/methods/safeDecimal";

// `refreshKey` changes when something new was posted from the Ledger tab, so an
// open trial balance re-reads instead of showing the list from before the post.
function StaffPaymentHistory({ refreshKey = 0 }) {
    const { user: { user }, notification: { updateNotification }, prompt: { toggleConfirmationPrompt } } = useAppContext();
    const { data: { staffId } } = useStaffProfile();
    const [open, setOpen] = useState(false);
    const [balances, setBalances] = useState(0);
    const [totalBalance, setTotalBalance] = useState(0);
    const [paymentHistory, setPaymentHistory] = useState([]);
    const [invoice, setInvoice] = useState(null);

    const balanceSheetRef = useRef();
    const printBalanceSheet = useReactToPrint({
        content: () => balanceSheetRef.current,
    });

    async function reprintInvoice(invoice_id, staff_id) {
        const _inv = await fetchStaffInvoice(invoice_id, staff_id, user?.profile?.school || user?.profile?.id);
        if (_inv && _inv?.invoice) {
            setInvoice(_inv.invoice);
        }
        else updateNotification(400, "Something went wrong!");
    }
    function resetInvoice() {
        setInvoice(null);
    }

    function onDeletePostEvent(index, id) {
        const item = paymentHistory?.[index];
        if (item) {
            if (item?.id === id) {
                // handleParticulars(item);
                setPaymentHistory(state => (
                    [...state.filter(each => each.id != id)]
                ))
            }
        }
    }

    useEffect(() => {
        if (open) {
            // fetch history;
            (async () => {
                const data = await fetchStaffPayments(staffId, user?.profile?.school || user?.profile?.id);
                let total = 0;
                const balances = data?.reduce((acc, val) => {
                    val?.debit_amount ?
                        (total += val.debit_amount) :
                        (total -= (val?.credit_amount || val?.tds_amount || 0))
                    total = safeDecimal(total);
                    acc.push(total);
                    return acc;
                }, []);
                setBalances(balances);
                setTotalBalance(total);
                setPaymentHistory(data);
            })();
        } else {
            setInvoice(null);
        }
    }, [open, staffId, refreshKey]);
    // 
    const classes = {
        grid: 'grid grid-cols-13 gap-x-2 justify-between items-start border-b text-center border-black',
        month: 'text-black p-1 rounded-md'
    }

    return (
        <div className="px-3 bg-teal-100">
            <Accordion open={open}
                icon={open ?
                    <ChevronUpIcon className="w-6 h-6" /> :
                    <ChevronDownIcon className="w-6 h-6" />}
            >
                <AccordionHeader onClick={() => {
                    setOpen(state => !state);
                }}>
                    <h2 className="text-xl font-semibold leading-7 text-gray-900">Staff's Trial Balance</h2>
                </AccordionHeader>
                <AccordionBody>
                    {paymentHistory?.length > 0 ?
                        <Card className="flex flex-col p-2 bg-teal-100">
                            <>
                                <ButtonsSecion>
                                    <Button variant="outlined" onClick={printBalanceSheet}>Print</Button>
                                </ButtonsSecion>
                                <div ref={balanceSheetRef}>
                                    <ReportHeader />
                                    <div className={`${classes.grid} font-semibold pb-2 bg-table-header rounded-md`}>
                                        <span>S.N</span>
                                        <span>Invoice no.</span>
                                        <span>Date</span>
                                        <span className="col-span-3">Particular</span>
                                        <span>Dr.</span>
                                        <span>Cr.</span>
                                        <span>Balance</span>
                                        <span>Remarks</span>
                                        <span>Months</span>
                                        <span></span>
                                    </div>
                                    <div className="children-text-base">
                                        {
                                            <>
                                                {
                                                    paymentHistory.map((history, sn) => {
                                                        const allowDelete = hasPermission(user,
                                                            history?.credit_amount ?
                                                                PERMISSIONS.STUDENT.DELETE_INVOICE :
                                                                PERMISSIONS.STUDENT.DELETE_LEDGER)
                                                        return (
                                                            <div key={sn} className={`${classes.grid} py-1`}>
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
                                                                                        <span className="font-semibold capitalize">{title}</span>
                                                                                        <span>{amount}</span>
                                                                                    </span>
                                                                                )
                                                                            })
                                                                    }
                                                                </span>
                                                                {/* total-due */}
                                                                <span>Rs. {history?.debit_amount || '0.00'}</span>
                                                                {/* total-paid */}
                                                                <span>Rs. {history?.credit_amount || history?.tds_amount || '0.00'}</span>
                                                                <span>Rs. {balances[sn]}</span>
                                                                <span className="break-words">{history?.remarks || '-'}</span>
                                                                <div className="capitalize col-span-2 text-left flex items-center flex-wrap gap-x-1">
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
                                                                                    await reprintInvoice(history.id, staffId);
                                                                                }} />
                                                                            </span> :
                                                                            <span></span>
                                                                        }
                                                                    </>
                                                                    <>
                                                                        {/* `closed`: the line belongs to a payroll year
                                                                            that has been closed, where the server refuses
                                                                            a deletion; the button is left off rather than
                                                                            offered and refused. */}
                                                                        {(!history?.tds_amount && !history?.closed && allowDelete) &&
                                                                            <span>
                                                                                <DeleteButton onClick={async () => {
                                                                                    const promptData = { ask_reason: true };
                                                                                    const schoolID = user?.profile?.school || user?.profile?.id;
                                                                                    if (history?.credit_amount) {
                                                                                        // delete invoice
                                                                                        promptData['header'] = "Are you sure to delete invoice?";
                                                                                        promptData['action'] = async (reason) => await deleteStaffPayment(history.id, schoolID, reason);
                                                                                    } else if (history?.debit_amount) {
                                                                                        // delete ledger
                                                                                        promptData['header'] = "Are you sure to delete ledger?";
                                                                                        promptData['action'] = async (reason) => await deleteStaffLedger(history.id, schoolID, reason);
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
                                            <span className="col-span-2"></span>
                                        </div>
                                    </div>
                                </div>
                            </>
                        </Card>
                        : <Loader />
                    }
                </AccordionBody>
            </Accordion>
            {
                invoice &&
                <PaySlipSection invoice={invoice} user={user} onClose={resetInvoice} reprint />
            }
        </div>
    )
}

export default StaffPaymentHistory;