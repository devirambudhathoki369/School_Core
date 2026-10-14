import { useReactToPrint } from "react-to-print";
import { getReceipt } from "@/services/functions/extra_billing";
import ExtraBillingReceipt from "../../extra_billing/Receipt";
import Loader from "@/components/Loader";
import ReprintButton from "@/components/buttons/ReprintButton";
import DeleteButton from "@/components/buttons/DeleteButton";
import { months } from "@/components/inputs/options/months";
import { useAppContext } from "@/contexts/AppContext";
import { fetchInvoice, fetchTransactions, deletePayment } from "@/services/functions/payments";
import { Card, Typography } from "@material-tailwind/react";
import { useEffect, useRef, useState } from "react";
import { generateInvoice } from "@/methods/payment/invoice";
import BillsSection from "../../payments/student/BillsSection";
import { getCursor, getURL } from "@/methods/pagination";
import { PaginationSection } from "@/components/sections";
import hasPermission from "@/methods/hasPermission";
import { PERMISSIONS } from "@/configs/permissions";
import { collectionByMode, paymentModeLabel } from "@/methods/payment/collection";
import CollectionSummary from "../../payments/CollectionSummary";

function RecentTransactions() {
    const { user: { user }, notification: { updateNotification },
        prompt: { toggleConfirmationPrompt } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    // Cash receipts (type === true) have no student, so they never surface in a
    // student's payment history where delete lives — this is their only delete
    // path. Reuse the same soft-delete invoice endpoint + permission.
    const canDeleteCashReceipt = hasPermission(user, PERMISSIONS.STUDENT.DELETE_INVOICE);
    const [data, setData] = useState([]);
    const [invoice, setInvoice] = useState(null);
    const [extraReceipt, setExtraReceipt] = useState(null);
    const extraReceiptRef = useRef(null);
    const printExtraReceipt = useReactToPrint({ content: () => extraReceiptRef.current });
    useEffect(() => {
        if (extraReceipt) printExtraReceipt();
    }, [extraReceipt]);
    async function reprintTransaction(transaction) {
        if (transaction.source === "extra_billing") {
            const receipt = await getReceipt(schoolId, transaction.extra_invoice_id);
            if (receipt?.id) setExtraReceipt(receipt);
            else updateNotification(400, "Could not load the extra billing receipt.");
            return;
        }
        await reprintInvoice(transaction.id, transaction.student_id);
    }
    // 
    async function reprintInvoice(invoice_id, student_id) {
        const _inv = await fetchInvoice(invoice_id, student_id, user?.profile?.school || user?.profile?.id);
        if (_inv && _inv?.invoice) {
            setInvoice(generateInvoice(_inv.invoice, user?.profile, { reprint: true }));
        }
        else updateNotification(400, "Something went wrong!");
    }
    function resetInvoice() {
        setInvoice(null);
    }
    // Remove a soft-deleted row from the current page and adjust the page total,
    // so the UI reflects the delete without a full refetch (which would shift the
    // cursor page).
    function removeDeletedRow(deletedId) {
        setData(state => {
            const pageData = state?.[page];
            if (!pageData) return state;
            const results = (pageData.results || []).filter(t => t?.id !== deletedId);
            return { ...state, [page]: { ...pageData, results } };
        });
    }
    function onDeleteCashReceipt(transaction) {
        toggleConfirmationPrompt({
            ask_reason: true,
            header: "Delete this cash receipt?",
            sub_header: "This cannot be undone from here.",
            onConfirm: async (reason) => {
                const [status, message] = await deletePayment(transaction.id, schoolId, reason);
                if (status) {
                    updateNotification(status, message);
                    if (status === 200) removeDeletedRow(transaction.id, transaction.amount);
                }
            },
        });
    }
    // PAGINATION;
    const [page, setPage] = useState(1);
    async function getData() {
        const nextURL = getURL(data, page - 1, 'next');
        if (!nextURL && getURL(data, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        const cursor = getCursor(nextURL);
        const res = await fetchTransactions(user?.profile?.school || user?.profile?.id, page, cursor);
        setData(state => ({ ...state, [page]: res }));
    }
    // 
    useEffect(() => {
        (async () => {
            if (!data?.[page]) await getData();
        })();
    }, [page]);
    // 
    const pageRows = data?.[page]?.results || [];
    const totalAmount = pageRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const classes = {
        grid: 'grid grid-cols-15 gap-x-5 justify-between items-start border-b text-center border-blue-gray-100'
    }
    return (
        <>
            <div className="hidden">
                <div ref={extraReceiptRef}>
                    <ExtraBillingReceipt receipt={extraReceipt} />
                </div>
            </div>
            {data?.[page]?.['results']?.length > 0 ?
                <Card className="flex flex-col p-2 bg-teal-10">
                    <>
                        <Typography variant="h5" className={`my-2 text-center`}>
                            Recent Transactions
                        </Typography>
                        <CollectionSummary totals={collectionByMode(pageRows, row => row.amount)} label="Collected by payment mode — this page" />
                        <div className="overflow-x-auto">
                        <div className="min-w-[64rem]">
                        <div className={`${classes.grid} font-semibold pb-2 bg-table-header`}>
                            <span>S.N</span>
                            <span>Type</span>
                            <span>Date</span>
                            <span className="col-span-2">Amount</span>
                            <span>Payment mode</span>
                            <span className="col-span-3">Payer name</span>
                            <span className="col-span-3">Class</span>
                            <span>Month</span>
                            <span></span>
                            <span></span>
                        </div>
                        <div className="children-text-base">
                            {
                                <>
                                    {
                                        (data?.[page]?.['results'] || [])
                                            .map((transaction, sn) => {
                                                let type = '';
                                                if (transaction?.type === true) type = 'CR';
                                                else if (transaction?.type === false) type = 'R';
                                                else if (transaction?.source === 'extra_billing') type = 'Extra';
                                                return (
                                                    <div key={sn} className={`${classes.grid} py-1.5`}>
                                                        <span className="text-base">{sn + 1}</span>
                                                        <span className="text-base">{type}</span>
                                                        <span className="text-base w-max">{transaction?.date}</span>
                                                        <span className="col-span-2">Rs. {transaction?.amount || '0.00'}</span>
                                                        <span>{paymentModeLabel(transaction?.mode)}</span>
                                                        <span className="col-span-3 text-base">{transaction?.student_name}</span>
                                                        <span className="capitalize col-span-3 text-base">{transaction?.class_name}</span>
                                                        <span className="capitalize px-4 py-1 rounded-full bg-gray-300 font-normal text-black text-sm">
                                                            {months[transaction?.month] || ''}
                                                        </span>
                                                        <span>
                                                            <ReprintButton onClick={() => {
                                                                reprintTransaction(transaction);
                                                            }} />
                                                        </span>
                                                        <span className="flex justify-center">
                                                            {(transaction?.type === true && canDeleteCashReceipt) &&
                                                                <DeleteButton onClick={() => onDeleteCashReceipt(transaction)} />
                                                            }
                                                        </span>
                                                    </div>
                                                )
                                            })
                                    }
                                </>
                            }
                            <div className={`${classes.grid} text-right py-2`}>
                                <span></span>
                                <span className="font-semibold text-center">Total</span>
                                <span className="font-semibold text-center col-span-2">Rs. {totalAmount}</span>
                            </div>
                        </div>
                        </div>
                        </div>
                    </>
                    <div className="my-1">
                        <PaginationSection page={page} setPage={setPage} nextPage={getURL(data, page, 'next')} />
                    </div>
                </Card> :
                <Loader />
            }
            <BillsSection invoice={invoice} onClose={resetInvoice} />
        </>
    )
}

// const transactionSample = {
//     date: '',
//     studentName: '',
//     className: '',
//     amount: '',
//     month: '',
// }

export default RecentTransactions;
