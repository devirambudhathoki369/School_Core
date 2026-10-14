import { useAppContext } from "@/contexts/AppContext";
import numberToWords from "@/methods/numberToWords";
import { formatInvoiceNo } from "@/methods/formatInvoiceNo";
import BillHeader from "../BillHeader";
import showOnlyClass from "@/methods/showOnlyClass";
import { useEffect, useRef } from "react";
import JsBarcode from 'jsbarcode';

function InvoiceTable({ invoice }) {
    // A discount is given per fee title, so the receipt says which title it came
    // off — the footer's lump sum never could. The column only appears when this
    // payment carried a discount; adding it to every receipt would take width
    // away from the figures that are always there.
    const hasDiscount = invoice?.particulars?.some(detail => Number(detail?.[4]) > 0);
    const HEADS = hasDiscount
        ? ['particulars', 'rate', 'total', 'discount', 'paid', 'due']
        : ['particulars', 'rate', 'total', 'paid', 'due'];
    return (
        <>
            <thead>
                <tr>
                    {
                        HEADS
                            ?.map((parhead, phi) => (
                                <th className="font-semibold uppercase !p-1" key={phi}>{parhead}</th>
                            ))
                    }
                </tr>
            </thead>
            <tbody>
                {invoice?.particulars
                    ?.map((detail, i) => {
                        const [title, rate, paid, due, discount] = detail;
                        const total = paid + discount + due;
                        return (
                            <tr key={i}>
                                <td className="capitalize !p-[0.2rem]">{title || ''}</td>
                                <td>{rate || ''}</td>
                                <td>{total || ''}</td>
                                {hasDiscount && <td>{discount || ''}</td>}
                                <td>{paid || ''}</td>
                                <td>{due || ''}</td>
                            </tr>
                        )
                    })}
                <tr>
                    <td>Total paid amount</td>
                    <td colSpan={HEADS.length - 1} className="text-right">{invoice?.total || ''}</td>
                </tr>
                {invoice?.discount &&
                    <tr>
                        <td>Total discount</td>
                        <td colSpan={HEADS.length - 1} className="text-right">{invoice.discount}</td>
                    </tr>
                }
                {invoice?.due &&
                    <tr>
                        <td>Remaining amount</td>
                        <td colSpan={HEADS.length - 1} className="text-right">{invoice?.due || ''}</td>
                    </tr>
                }
            </tbody>
        </>
    )
}
function CashReceiptTable({ invoice }) {
    const HEADS = ['particulars', 'amount'];
    return (
        <>
            <thead>
                <tr>
                    {
                        HEADS
                            ?.map((parhead, phi) => (
                                <th className="font-semibold uppercase !p-1" key={phi}>{parhead}</th>
                            ))
                    }
                </tr>
            </thead>
            <tbody>
                {invoice?.particulars
                    ?.map((detail, i) => {
                        const { PAR, AMT } = detail; // particular, amount
                        return (
                            < tr key={i} >
                                <td className="capitalize !p-[0.2rem]">{PAR}</td>
                                <td>{AMT}</td>
                            </tr>
                        )
                    })
                }
                {/* The words line alone was the only place the figure appeared on a
                    cash receipt, so anyone checking the slip had to add the
                    particulars up by hand. The invoice table has always carried a
                    total row; this is the same row for the cash side. */}
                <tr>
                    <td className="font-semibold !p-[0.2rem]">Total</td>
                    <td className="font-semibold">{invoice?.total || ''}</td>
                </tr>
            </tbody >
        </>)
}

export default function BillSample({ invoice }) {
    const { user: { user } } = useAppContext();
    // The clock time belongs to the day the bill was ENTERED. Most bills carry
    // that same day as their date and the time simply follows it; a back-dated
    // bill keeps its own date and says separately when it was really entered,
    // because "2083-03-04 09:46" would be a moment nothing happened at.
    const enteredSameDay = !!invoice?.enteredTime && invoice?.enteredOn === invoice?.date;
    const enteredLater = !!invoice?.enteredTime && !!invoice?.enteredOn && !enteredSameDay;
    const deleted = invoice?.deleted;

    const barcodeRef = useRef(null);
    useEffect(() => {
        if (barcodeRef.current && invoice?.studentId) {
            JsBarcode(barcodeRef.current,
                invoice.studentId,
                { format: "CODE128", width: 1.5, height: 15, displayValue: false, margin: 0 }
            );
        }
    }, [invoice?.studentId]);

    return (
        <>
            <div className={"bill"}>
                <BillHeader user={user} />
                <hr className="my-2 border-black" />
                <div className="w-full flex flex-col gap-y-1">
                    <span className="text-center !font-bold underline">
                        CASH RECEIPT{deleted ? ' (DELETED)' : invoice?.reprint ? ' (REPRINTED)' : ''}
                    </span>
                    {deleted &&
                        <span className="text-center">
                            Deleted by :- {deleted.by || 'not recorded'}
                            {deleted.on ? `, ${deleted.on} ${deleted.time || ''}` : ''}
                        </span>
                    }
                    <div className="grid grid-cols-2 gap-x-6">
                        {/* One row sized by its contents, not two equal halves:
                            the date now carries a time and needs the room the
                            short invoice number leaves. */}
                        <div className="col-span-2 flex justify-between gap-x-4">
                            <span>Invoice No :- {formatInvoiceNo(invoice?.invoiceId)}</span>
                            <span className="text-right">
                                Date :- {invoice?.date}{enteredSameDay ? ` ${invoice.enteredTime}` : ''}
                            </span>
                        </div>
                        {enteredLater &&
                            <span className="col-span-2 text-right">
                                Entered on :- {invoice.enteredOn} {invoice.enteredTime}
                            </span>
                        }
                        {invoice?.guardianName && <span className="col-span-2 capitalize">guardian name :- {invoice.guardianName}</span>}
                        {invoice?.isCashReceipt ?
                            <span className="col-span-2 capitalize">name :- {invoice?.studentName}</span>
                            :
                            <span className="col-span-2 capitalize">student name :- {invoice?.studentName}
                                {invoice?.studentId ? `(${invoice.studentId})` : ''}
                            </span>
                        }
                        {invoice?.class && <span className="col-span-2 capitalize">class :- {showOnlyClass(invoice?.class) || ''}</span>}
                        {invoice?.studentAddress && <span className="col-span-2 capitalize">Address :- {invoice?.studentAddress || ''}</span>}
                    </div>
                    <div className="my-1">
                        <span className="my-1 flex justify-between">
                            <div>
                                Upto the month :
                                <span className="capitalize ml-1">{invoice?.paymentMonth}</span>
                            </div>
                            <span className="mx-3 uppercase">[by : {invoice?.payment_mode}]</span>
                        </span>
                        <table className="w-full !rounded-2xl">
                            {invoice?.isCashReceipt ?
                                <CashReceiptTable invoice={invoice} /> :
                                <InvoiceTable invoice={invoice} />
                            }
                        </table>
                        <div className="flex flex-col mt-2">
                            <span>In words :- {numberToWords(invoice?.total)} only /-</span>
                            {invoice?.discount &&
                                <span>Discount : Discount of Rs. {invoice?.discount} only /-</span>
                            }
                            {invoice?.remarks &&
                                <span>Remarks : {invoice?.remarks}</span>
                            }
                        </div>
                    </div>
                </div>
                <div className={`flex ${invoice?.studentId ? 'justify-between' : 'justify-end'} items-end mt-2`}>
                    <>
                        {invoice?.studentId &&
                            <svg ref={barcodeRef} style={{ width: '100%', height: 'auto' }} />
                        }
                    </>
                    <div className="flex flex-col w-1/4">
                        <span className="border-b border-black text-right">
                            {invoice?.cashier || '\u00A0'}
                        </span>
                        <span className="text-right">Accountant</span>
                    </div>
                </div>
            </div>
        </>
    );
}
