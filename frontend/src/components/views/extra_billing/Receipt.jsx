import { useAppContext } from "@/contexts/AppContext";
import { formatInvoiceNo } from "@/methods/formatInvoiceNo";
import numberToWords from "@/methods/numberToWords";
import BillHeader from "../payments/BillHeader";
import { rs } from "./common";

/**
 * ONE copy of the receipt, in the school's own bill format.
 *
 * It is the student cash receipt (`payments/student/BillSample`) with a payer
 * instead of a student: the same letterhead, the same boxed table, the amount
 * in words and the accountant's line. It used to be a bare list under a single
 * line of text — and that line was `profile.name`, which for a staff login is
 * the CASHIER's own name, so a receipt issued by staff was headed with a
 * person instead of the school. `BillHeader` reads the school's name, logo,
 * PAN and contacts whoever is signed in.
 */
function ReceiptCopy({ receipt, user }) {
    const names = receipt?.details?.__titles || {};
    const rows = Object.entries(receipt?.details || {}).filter(([key]) => key !== "__titles");
    return (
        <div className={"bill"}>
            <BillHeader user={user} />
            <hr className="my-2 border-black" />
            <div className="w-full flex flex-col gap-y-1">
                <span className="text-center !font-bold underline">
                    CASH RECEIPT
                </span>
                <div className="grid grid-cols-2 gap-x-6">
                    <span>Invoice No :- {formatInvoiceNo(receipt.invoice_id)}</span>
                    <span className="text-right">Date :- {receipt.date}</span>
                    <span className="col-span-2 capitalize">name :- {receipt.party__name}
                        {receipt.party__property_name ? ` (${receipt.party__property_name})` : ""}
                    </span>
                    {receipt.party__address && <span className="col-span-2 capitalize">Address :- {receipt.party__address}</span>}
                    {receipt.party__contact && <span className="col-span-2">Contact :- {receipt.party__contact}</span>}
                </div>
                <div className="my-1">
                    <span className="my-1 flex justify-end">
                        <span className="mx-3 uppercase">[by : {receipt.mode_name}]</span>
                    </span>
                    <table className="w-full !rounded-2xl">
                        <thead>
                            <tr>
                                <th className="font-semibold uppercase !p-1">particulars</th>
                                <th className="font-semibold uppercase !p-1">amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(([key, value]) => (
                                <tr key={key}>
                                    <td className="capitalize !p-[0.2rem]">{names[key] || key}</td>
                                    <td>{rs(value)}</td>
                                </tr>
                            ))}
                            <tr>
                                <td className="font-semibold !p-[0.2rem]">Total paid amount</td>
                                <td className="font-semibold">{rs(receipt.total_paid)}</td>
                            </tr>
                            <tr>
                                <td className="!p-[0.2rem]">Remaining amount</td>
                                <td>{rs(receipt.total_due)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="flex flex-col mt-2">
                        <span>In words :- {numberToWords(receipt.total_paid)} only /-</span>
                        {receipt.remarks &&
                            <span>Remarks : {receipt.remarks}</span>
                        }
                        {/* A voided receipt keeps its number and can still be
                            reprinted — it has to say what it is. */}
                        {receipt.is_active === false &&
                            <span className="text-center !font-bold">** VOIDED **</span>
                        }
                    </div>
                </div>
            </div>
            <div className="flex justify-end items-end mt-6">
                <div className="flex flex-col w-1/4">
                    <span className="border-b border-black text-right">&nbsp;</span>
                    <span className="text-right">Accountant</span>
                </div>
            </div>
        </div>
    );
}

/**
 * The printable receipt: TWO copies side by side, one for the payer and one
 * for the school's file — the way a student receipt has always printed
 * (`payments/student/BillsSection`).
 */
export default function ExtraBillingReceipt({ receipt }) {
    const { user: { user } } = useAppContext();
    if (!receipt) return null;
    return (
        <div className="w-max flex justify-around items-start gap-2 p-1">
            <ReceiptCopy receipt={receipt} user={user} />
            <ReceiptCopy receipt={receipt} user={user} />
        </div>
    );
}
