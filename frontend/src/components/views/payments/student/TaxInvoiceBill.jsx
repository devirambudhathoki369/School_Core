import { useAppContext } from "@/contexts/AppContext";
import numberToWords from "@/methods/numberToWords";
import { formatInvoiceNo } from "@/methods/formatInvoiceNo";
import showOnlyClass from "@/methods/showOnlyClass";
import BillHeader from "../BillHeader";
import { useEffect, useRef } from "react";
import JsBarcode from 'jsbarcode';

// The debit (Dr.) side of the trial balance is a fee *posting*, not a payment,
// so it prints as a TAX INVOICE: what was charged, for which months, dated the
// day it was posted — never the day it is printed.
export default function TaxInvoiceBill({ invoice }) {
    const { user: { user } } = useAppContext();
    const barcodeRef = useRef(null);

    useEffect(() => {
        if (barcodeRef.current && invoice?.studentId) {
            JsBarcode(barcodeRef.current,
                String(invoice.studentId),
                { format: "CODE128", width: 1.5, height: 15, displayValue: false, margin: 0 }
            );
        }
    }, [invoice?.studentId]);

    return (
        <div className={"bill"}>
            <BillHeader user={user} />
            <hr className="my-2 border-black" />
            <div className="w-full flex flex-col gap-y-1">
                <span className="text-center !font-bold underline">
                    TAX INVOICE
                </span>
                <div className="grid grid-cols-2 gap-x-6">
                    {/* Always present: the number is minted before this paper
                        is built, and the print is aborted if it could not be. */}
                    <span>Invoice No :- {formatInvoiceNo(invoice?.invoiceId)}</span>
                    <span className="text-right">Date :- {invoice?.date}</span>
                    <span className="col-span-2 capitalize">student name :- {invoice?.studentName}
                        {invoice?.studentId ? ` (${invoice.studentId})` : ''}
                    </span>
                    {invoice?.class && <span className="col-span-2 capitalize">class :- {showOnlyClass(invoice.class)}</span>}
                    {invoice?.academicYear && <span className="col-span-2 capitalize">academic year :- {invoice.academicYear}</span>}
                </div>
                <div className="my-1">
                    {invoice?.months?.length > 0 &&
                        <span className="my-1 flex justify-between">
                            <div>
                                For the month{invoice.months.length > 1 ? 's' : ''} :
                                <span className="capitalize ml-1">{invoice.months.join(', ')}</span>
                            </div>
                        </span>
                    }
                    <table className="w-full !rounded-2xl">
                        <thead>
                            <tr>
                                {['particulars', 'amount'].map((head, hi) => (
                                    <th className="font-semibold uppercase !p-1" key={hi}>{head}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {invoice?.particulars?.map(([title, amount], i) => (
                                <tr key={i}>
                                    <td className="capitalize !p-[0.2rem]">{title || ''}</td>
                                    <td className="text-right">{amount || ''}</td>
                                </tr>
                            ))}
                            <tr>
                                <td className="font-semibold">Total</td>
                                <td className="text-right font-semibold">{invoice?.total || 0}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="flex flex-col mt-2">
                        <span>In words :- {numberToWords(invoice?.total)} only /-</span>
                        {invoice?.remarks &&
                            <span>Remarks : {invoice.remarks}</span>
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
                        {invoice?.cashier}
                    </span>
                    <span className="text-right">Accountant</span>
                </div>
            </div>
        </div>
    );
}
