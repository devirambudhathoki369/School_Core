import { useAppContext } from "@/contexts/AppContext";
import { getCursor, getURL } from "@/methods/pagination";
import { fetchStaffInvoice, fetchStaffRecentTransactions } from "@/services/functions/payments";
import { useEffect, useState } from "react";
import { Card, Typography } from "@material-tailwind/react";
import ReprintButton from "@/components/buttons/ReprintButton";
import { PaginationSection } from "@/components/sections";
import Loader from "@/components/Loader";
import PaySlipSection from "./PaySlipSection";
import { months } from "@/components/inputs/options/months";

function RecentSlips() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const [data, setData] = useState([]);
    const [totalAmount, setTotalAmount] = useState(0);
    const [invoice, setInvoice] = useState(null);
    // 
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
    // 
    const [page, setPage] = useState(1);
    async function getData() {
        const nextURL = getURL(data, page - 1, 'next');
        if (!nextURL && getURL(data, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        const cursor = getCursor(nextURL);
        const res = await fetchStaffRecentTransactions(user?.profile?.school || user?.profile?.id, page, cursor);
        setData(state => ({ ...state, [page]: res }));
        setTotalAmount(res?.results?.reduce((acc, val) => {
            acc += val?.amount || 0;
            return acc;
        }, 0));
    }
    // 
    useEffect(() => {
        (async () => {
            if (!data?.[page]) await getData();
        })();
    }, [page]);

    const classes = {
        grid: 'grid grid-cols-12 gap-x-5 justify-between items-start border-b text-center border-blue-gray-100'
    }
    return (
        <>
            {data?.[page]?.['results']?.length > 0 ?
                <Card className="flex flex-col p-2 bg-transparent shadow-default">
                    <>
                        <Typography variant="h5" className={`my-2 text-center`}>
                            Pay Slips
                        </Typography>
                        <div className={`${classes.grid} font-semibold pb-2 bg-table-header`}>
                            <span>S.N</span>
                            <span>Date</span>
                            <span className="col-span-2">Amount</span>
                            <span className="col-span-3">Staff name</span>
                            <span className="col-span-3">Paid for</span>
                            <span>Month</span>
                            <span></span>
                        </div>
                        <div className="children-text-base">
                            {
                                <>
                                    {
                                        (data?.[page]?.['results'] || [])
                                            .map((transaction, sn) => {
                                                return (
                                                    <div key={sn} className={`${classes.grid} py-0.5`}>
                                                        <span className="text-base">{sn + 1}</span>
                                                        <span className="text-base w-max">{transaction?.date}</span>
                                                        <span className="col-span-2">Rs. {transaction?.amount || '0.00'}</span>
                                                        <span className="capitalize col-span-3 text-base">{transaction?.staff_name}</span>
                                                        {/* what the slip paid: a payment of old dues reads
                                                            differently from a month's salary */}
                                                        <span className="capitalize col-span-3 text-base">{(transaction?.paid_for || []).join(', ')}</span>
                                                        <span className="capitalize px-4 py-1 rounded-full bg-gray-300 font-normal text-black text-sm">
                                                            {months?.[transaction?.month] || ''}
                                                        </span>
                                                        <span>
                                                            <ReprintButton onClick={() => {
                                                                reprintInvoice(transaction.id, transaction.staff_id);
                                                            }} />
                                                        </span>
                                                        <span></span>
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
                    </>
                    <div className="my-1">
                        <PaginationSection page={page} setPage={setPage} nextPage={getURL(data, page, 'next')} />
                    </div>
                </Card> :
                <Loader />
            }
            {
                invoice &&
                <PaySlipSection invoice={invoice} user={user} onClose={resetInvoice} reprint />
            }
        </>
    )
}

export default RecentSlips;