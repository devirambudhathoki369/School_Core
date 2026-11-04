import { useAppContext } from "@/contexts/AppContext";
import BillHeader from "../../payments/BillHeader";
import { rs } from "../common";

const BLANK = "—";

function balanceWords(value) {
    const n = Number(value || 0);
    if (n < 0) return `${rs(-n)} due`;
    if (n > 0) return `${rs(n)} advance`;
    return rs(0);
}

function particulars(row) {
    const months = (row.months || []).length ? `${row.months.join(", ")}${row.bs_year ? ` ${row.bs_year}` : ""}` : "";
    const items = (row.lines || []).map((l) => `${l.name}${l.qty > 1 ? ` x${l.qty}` : ""} ${rs(l.amount)}`).join(", ");
    const advance = Number(row.advance) > 0 ? `Advance ${rs(row.advance)}` : "";
    return [row.what, row.reference, months, items, advance].filter(Boolean).join(" · ");
}

/**
 * The paper a family can be handed: the canteen's own statement of one person.
 *
 * Only what counts: voided rows are left off so the columns add up, and cash
 * sales are named in a line because they never touch the account.
 */
export default function ProfileStatement({ data }) {
    const { user: { user } } = useAppContext();
    if (!data) return null;
    const rows = (data.history || []).filter((r) => r.is_active && r.group !== "counter").reverse();
    const { summary } = data;
    return (
        <div className="p-2" style={{ width: "190mm" }}>
            <div className="bill !min-w-0 !max-w-none !w-full">
                <BillHeader user={user} />
                <hr className="my-2 border-black" />
                <div className="w-full flex flex-col gap-y-1">
                    <span className="text-center !font-bold underline">CANTEEN STATEMENT</span>
                    <div className="grid grid-cols-2 gap-x-4">
                        <span className="col-span-2 capitalize">Name :- {data.name}</span>
                        <span>{data.buyer_type === 1 ? "Class" : "Role"} :- {data.detail || BLANK}</span>
                        <span className="text-right">Date :- {data.today}</span>
                        {data.roll_no && <span>Roll :- {data.roll_no}</span>}
                    </div>
                    <table className="w-full my-1">
                        <thead>
                            <tr>
                                <th className="!p-1 uppercase">date</th>
                                <th className="!p-1 uppercase">particulars</th>
                                <th className="!p-1 uppercase">billed</th>
                                <th className="!p-1 uppercase">paid</th>
                                <th className="!p-1 uppercase">balance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length < 1 && <tr><td colSpan={5} className="!p-[0.2rem]">Nothing on this account yet.</td></tr>}
                            {rows.map((r) => (
                                <tr key={r.id}>
                                    <td className="!p-[0.2rem] whitespace-nowrap">{r.date}</td>
                                    <td className="!p-[0.2rem]">{particulars(r)}</td>
                                    <td className="text-right">{r.charged === null ? BLANK : rs(r.charged)}</td>
                                    <td className="text-right">{r.paid === null ? BLANK : rs(r.paid)}</td>
                                    <td className="text-right whitespace-nowrap">{balanceWords(r.running)}</td>
                                </tr>
                            ))}
                            <tr>
                                <td className="!p-[0.2rem] !font-bold" colSpan={2}>Total billed</td>
                                <td className="text-right !font-bold" colSpan={3}>{rs(summary.billed)}</td>
                            </tr>
                            <tr>
                                <td className="!p-[0.2rem] !font-bold" colSpan={2}>Total paid</td>
                                <td className="text-right !font-bold" colSpan={3}>{rs(summary.paid)}</td>
                            </tr>
                            {Number(summary.discount) > 0 && (
                                <tr>
                                    <td className="!p-[0.2rem] !font-bold" colSpan={2}>Discount</td>
                                    <td className="text-right !font-bold" colSpan={3}>{rs(summary.discount)}</td>
                                </tr>
                            )}
                            {Number(summary.refunded) > 0 && (
                                <tr>
                                    <td className="!p-[0.2rem] !font-bold" colSpan={2}>Given back</td>
                                    <td className="text-right !font-bold" colSpan={3}>{rs(summary.refunded)}</td>
                                </tr>
                            )}
                            {Number(summary.advance) > 0 && (
                                <tr>
                                    <td className="!p-[0.2rem] !font-bold" colSpan={2}>Advance held</td>
                                    <td className="text-right !font-bold" colSpan={3}>{rs(summary.advance)}</td>
                                </tr>
                            )}
                            <tr>
                                <td className="!p-[0.2rem] !font-bold" colSpan={2}>Due now</td>
                                <td className="text-right !font-bold" colSpan={3}>{rs(summary.due)}</td>
                            </tr>
                        </tbody>
                    </table>
                    {summary.cash_sales > 0 && (
                        <span className="text-sm">
                            Also paid in cash at the counter: Rs. {rs(summary.cash_at_counter)} ({summary.cash_sales} sale{summary.cash_sales === 1 ? "" : "s"}). Not part of this bill.
                        </span>
                    )}
                    <span className="text-sm">Canteen billing only. School fees are billed separately.</span>
                </div>
            </div>
        </div>
    );
}
