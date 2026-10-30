import { useAppContext } from "@/contexts/AppContext";
import numberToWords from "@/methods/numberToWords";
import BillHeader from "../../payments/BillHeader";
import { TXN_REFUND } from "@/configs/canteen";
import { paisa, rs } from "../common";

/**
 * The paper a parent is handed for a canteen payment (or signs for a refund), in the
 * school's own bill format: the same letterhead the fee receipts carry
 * (`BillHeader` reads the school's name, logo, PAN and contacts whoever is
 * signed in), the amount in words, and the balance the card is left with.
 *
 * Its number is the canteen's own office series, printed with a "C-" so it is
 * never mistaken for a fee receipt of the same number.
 */
function Copy({ receipt, user, whose }) {
    const refund = receipt.kind === TXN_REFUND;
    const amount = Math.abs(Number(receipt.amount || 0));
    // What it paid item by item; whatever it did not name is an advance.
    const lines = receipt.lines || [];
    const advance = (paisa(amount) - lines.reduce((sum, l) => sum + paisa(l.amount), 0)) / 100;
    const after = receipt.balance_after !== undefined && receipt.balance_after !== null ? Number(receipt.balance_after) : null;
    return (
        <div className="bill">
            <BillHeader user={user} />
            <hr className="my-2 border-black" />
            <div className="w-full flex flex-col gap-y-1">
                <span className="text-center !font-bold underline">
                    {refund ? "CANTEEN REFUND" : "CANTEEN RECEIPT"}
                </span>
                <div className="grid grid-cols-2 gap-x-6">
                    <span>Receipt No :- C-{receipt.receipt_no}</span>
                    <span className="text-right">Date :- {receipt.date} {receipt.time || ""}</span>
                    <span className="col-span-2 capitalize">Name :- {receipt.name}{receipt.detail ? ` (${receipt.detail})` : ""}</span>
                </div>
                <table className="w-full my-1">
                    <thead>
                        <tr>
                            <th className="font-semibold uppercase !p-1">particulars</th>
                            <th className="font-semibold uppercase !p-1">amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {refund ? (
                            <tr>
                                <td className="!p-[0.2rem]">Canteen advance given back [by : {receipt.mode_name}]</td>
                                <td>{rs(amount)}</td>
                            </tr>
                        ) : (
                            <>
                                {lines.map((line) => (
                                    <tr key={line.item}>
                                        <td className="!p-[0.2rem] capitalize">{line.name}</td>
                                        <td>{rs(line.amount)}</td>
                                    </tr>
                                ))}
                                {advance > 0 && (
                                    <tr>
                                        <td className="!p-[0.2rem]">Advance (kept on the canteen account)</td>
                                        <td>{rs(advance)}</td>
                                    </tr>
                                )}
                                <tr>
                                    <td className="!p-[0.2rem] font-semibold">Total paid [by : {receipt.mode_name}]</td>
                                    <td className="font-semibold">{rs(amount)}</td>
                                </tr>
                            </>
                        )}
                        {after !== null && (
                            <tr>
                                <td className="!p-[0.2rem]">{after < 0 ? "Still due on the canteen account" : "Advance on the canteen account"}</td>
                                <td>{rs(Math.abs(after))}</td>
                            </tr>
                        )}
                    </tbody>
                </table>
                <span>In words :- {numberToWords(amount)} only /-</span>
                {receipt.remarks && <span>Remarks : {receipt.remarks}</span>}
                {receipt.is_active === false && <span className="text-center !font-bold">** VOIDED **</span>}
            </div>
            <div className="flex justify-between items-end mt-6">
                <span className="text-xs">{whose} · entered by {receipt.entered_by || "—"}</span>
                <div className="flex flex-col w-1/4">
                    <span className="border-b border-black text-right">&nbsp;</span>
                    <span className="text-right">{refund ? "Received by" : "Accountant"}</span>
                </div>
            </div>
        </div>
    );
}

export default function OfficeReceipt({ receipt }) {
    const { user: { user } } = useAppContext();
    if (!receipt) return null;
    return (
        <div className="w-max flex justify-around items-start gap-2 p-1">
            <Copy receipt={receipt} user={user} whose="Payer's copy" />
            <Copy receipt={receipt} user={user} whose="Office copy" />
        </div>
    );
}
