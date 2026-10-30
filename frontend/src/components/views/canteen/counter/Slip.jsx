import { useAppContext } from "@/contexts/AppContext";
import { PAY_PLAN } from "@/configs/canteen";
import { rs } from "../common";

/**
 * The counter slip: what a child or a teacher is handed with their samosa.
 *
 * Sized for the counter's slip printer (80 or 58 mm, from Canteen Setup) — a
 * single narrow column, school name on top, the lines, the total and, for an
 * account sale, what is left on the card. On A4/A5 it is the same column, so a
 * school without a slip printer still gets a readable slip.
 *
 * The school's name comes from the profile, whoever is signed in: a staff
 * login carries it as `school_name`, the school's own login as `name`.
 */
export function slipPageStyle(width) {
    if (width === 58 || width === 80) {
        return `@page { size: ${width}mm auto; margin: 2mm; } body { margin: 0; }`;
    }
    return "@page { margin: 10mm; }";
}

export default function CanteenSlip({ sale, width = 80, footer }) {
    const { user: { user } } = useAppContext();
    if (!sale) return null;
    const profile = user?.profile || {};
    const schoolName = profile.school_name || profile.name || "";
    const address = profile.school_address || profile.address || "";
    const mm = width === 58 ? 54 : 76;
    const style = width === 0 ? { width: "76mm" } : { width: `${mm}mm` };
    const balance = sale.balance_after !== undefined && sale.balance_after !== null
        ? Number(sale.balance_after) : null;
    // A meal on a monthly use type: nothing was charged at the counter.
    const plan = sale.payment === PAY_PLAN;
    return (
        <div style={style} className="canteen-slip text-black bg-white p-1 font-mono">
            <p className="text-center !font-bold text-[13px] leading-tight uppercase">{schoolName}</p>
            {address && <p className="text-center text-[10px] leading-tight">{address}</p>}
            <p className="text-center text-[11px] leading-tight mt-0.5">CANTEEN</p>
            <div className="border-t border-dashed border-black my-1" />
            <div className="flex justify-between text-[10px]">
                <span>Sale No. {sale.sale_no}</span>
                <span>{sale.date} {sale.time || ""}</span>
            </div>
            {sale.name && (
                <p className="text-[10px] leading-tight">
                    {sale.name}{sale.detail ? ` · ${sale.detail}` : ""}
                </p>
            )}
            <div className="border-t border-dashed border-black my-1" />
            <table className="w-full text-[10px]">
                <tbody>
                    {(sale.lines || []).map((line, i) => (
                        <tr key={i}>
                            <td className="align-top pr-1">{line.qty} × {line.name}</td>
                            <td className="text-right align-top whitespace-nowrap">{plan ? "plan" : rs(line.amount)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="border-t border-dashed border-black my-1" />
            <div className="flex justify-between text-[12px] !font-bold">
                <span>TOTAL</span>
                <span>Rs. {rs(sale.total)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
                <span>{plan ? "Covered by" : "Paid by"}</span>
                <span className="uppercase">{plan ? (sale.payment_name || "").replace(/^Plan · /, "") : (sale.payment_name || "")}</span>
            </div>
            {balance !== null && (
                <div className="flex justify-between text-[10px]">
                    <span>{balance < 0 ? "Owing on account" : "Left on account"}</span>
                    <span>Rs. {rs(Math.abs(balance))}</span>
                </div>
            )}
            {sale.is_active === false && <p className="text-center !font-bold text-[11px] mt-1">** VOIDED **</p>}
            <div className="border-t border-dashed border-black my-1" />
            <p className="text-[9px] leading-tight">Served by: {sale.entered_by || "—"}</p>
            {footer && <p className="text-center text-[9px] leading-tight mt-1">{footer}</p>}
        </div>
    );
}
