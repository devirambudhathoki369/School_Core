import { useAppContext } from "@/contexts/AppContext";
import BillHeader from "../../payments/BillHeader";
import { rs } from "../common";

/**
 * Canteen bills to send home — one per student who owes, two to an A4 row.
 *
 * Item by item (Tiffin, Day care, counter items taken on due): what was charged,
 * what is paid and what is due, then the advance held and the total to pay.
 * The same figures the Dues report and Collect & Receipt show, because they are
 * the same rows (methods/ledger.py on the server).
 */
function Bill({ row, user, date, note }) {
    return (
        <div className="bill !min-w-0 !max-w-none !w-full break-inside-avoid">
            <BillHeader user={user} />
            <hr className="my-2 border-black" />
            <div className="w-full flex flex-col gap-y-1">
                <span className="text-center !font-bold underline">CANTEEN BILL</span>
                <div className="grid grid-cols-2 gap-x-4">
                    <span className="col-span-2 capitalize">Name :- {row.name}</span>
                    <span>Class :- {row.detail || "—"}</span>
                    <span className="text-right">Date :- {date}</span>
                    {row.roll_no && <span>Roll :- {row.roll_no}</span>}
                </div>
                <table className="w-full my-1">
                    <thead>
                        <tr>
                            <th className="!p-1 uppercase">item</th>
                            <th className="!p-1 uppercase">charged</th>
                            <th className="!p-1 uppercase">paid</th>
                            <th className="!p-1 uppercase">due</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(row.lines || []).map((line) => (
                            <tr key={line.name}>
                                <td className="!p-[0.2rem] capitalize">{line.name}</td>
                                <td className="text-right">{rs(line.charged)}</td>
                                <td className="text-right">{rs(line.paid)}</td>
                                <td className="text-right">{rs(line.due)}</td>
                            </tr>
                        ))}
                        {Number(row.advance) > 0 && (
                            <tr>
                                <td className="!p-[0.2rem]" colSpan={3}>Advance held</td>
                                <td className="text-right">− {rs(row.advance)}</td>
                            </tr>
                        )}
                        <tr>
                            <td className="!p-[0.2rem] !font-bold" colSpan={3}>Total to pay</td>
                            <td className="text-right !font-bold">{rs(row.due)}</td>
                        </tr>
                    </tbody>
                </table>
                {note && <span className="text-sm">{note}</span>}
            </div>
            <div className="flex justify-end items-end mt-6">
                <div className="flex flex-col w-1/3">
                    <span className="border-b border-black text-right">&nbsp;</span>
                    <span className="text-right">Canteen / Accountant</span>
                </div>
            </div>
        </div>
    );
}

export default function CanteenBills({ rows, date, note = "Please pay at the canteen office." }) {
    const { user: { user } } = useAppContext();
    const owing = (rows || []).filter((r) => Number(r.due) > 0);
    if (!owing.length) return null;
    return (
        <div className="grid grid-cols-2 gap-3 p-2" style={{ width: "190mm" }}>
            {owing.map((row) => <Bill key={row.account} row={row} user={user} date={date} note={note} />)}
        </div>
    );
}
