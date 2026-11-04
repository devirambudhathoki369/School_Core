import { useRef, useState } from "react";
import { Accordion, AccordionBody, AccordionHeader, Button, Card } from "@material-tailwind/react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import { useReactToPrint } from "react-to-print";

import DeleteButton from "@/components/buttons/DeleteButton";
import ReprintButton from "@/components/buttons/ReprintButton";
import NotFound from "@/components/NotFound";
import { ButtonsSecion } from "@/components/sections";
import ReportHeader from "@/components/tables/ReportHeader";
import { TXN_DISCOUNT, TXN_POSTING, TXN_REFUND, TXN_TOPUP } from "@/configs/canteen";
import { PERMISSIONS } from "@/configs/permissions";
import { useAppContext } from "@/contexts/AppContext";
import hasPermission from "@/methods/hasPermission";
import { voidOfficeReceipt, withdrawMonthlyPosting } from "@/services/functions/canteen";
import { rs } from "../common";

const grid = "grid grid-cols-12 gap-x-2 justify-between items-start border-b text-center border-gray-400";

/** Charges read differently from money received, in print as well as on screen. */
function rowTone(row) {
    return row.charged !== null || row.kind === TXN_REFUND
        ? "bg-amber-50/60 border-l-4 border-l-amber-500"
        : "bg-emerald-50/60 border-l-4 border-l-emerald-500";
}
function dr(row) {
    if (row.charged !== null) return Number(row.charged);
    return row.kind === TXN_REFUND ? -Number(row.paid) : 0;
}
function cr(row) {
    return row.kind === TXN_TOPUP || row.kind === TXN_DISCOUNT ? Number(row.paid) : 0;
}

/**
 * The student's trial balance: every entry on the canteen ledger, oldest first,
 * as the fee screen draws it. Balance reads as what is owed; below zero is advance.
 * A voided entry and a cash sale are not on it: neither moved the ledger.
 */
function TrialBalance({ profile, person, school, updateNotification, onChanged, onReprint }) {
    const { user: { user }, prompt: { toggleConfirmationPrompt } } = useAppContext();
    const [open, setOpen] = useState(false);
    const sheetRef = useRef(null);
    const print = useReactToPrint({ content: () => sheetRef.current });

    const rows = (profile?.history || []).filter((r) => r.is_active && r.group !== "counter").reverse();
    const canWithdraw = hasPermission(user, PERMISSIONS.CANTEEN.MONTHLY_POSTING);

    function ask(header, action) {
        toggleConfirmationPrompt({
            ask_reason: true,
            header,
            onConfirm: async (reason) => {
                const [status, message] = await action(reason);
                updateNotification(status === 200 ? 200 : 400, message || "Failed.");
                if (status === 200) onChanged();
            },
        });
    }
    function onDelete(row) {
        if (row.receipt) {
            ask(`Are you sure you want to void receipt ${row.reference}?`, (reason) => voidOfficeReceipt(school, row.receipt, reason || "voided at Payment"));
        } else {
            ask("Are you sure you want to withdraw this posting?", (reason) => withdrawMonthlyPosting(school, Number(row.id.slice(1)), reason || "withdrawn at Payment"));
        }
    }

    return (
        <div className="px-3">
            <Accordion open={open} icon={open ? <ChevronUpIcon className="w-6 h-6" /> : <ChevronDownIcon className="w-6 h-6" />}>
                <AccordionHeader onClick={() => setOpen((s) => !s)}>
                    <h2 className="text-xl font-semibold leading-7 text-gray-900">Student&apos;s Trial Balance</h2>
                </AccordionHeader>
                <AccordionBody>
                    <Card className="flex flex-col p-2 bg-teal-100">
                        {rows.length < 1 ? <NotFound /> : (
                            <>
                                <div className="flex flex-wrap gap-2 items-end justify-end pb-2 mb-2 border-b border-gray-500">
                                    <ButtonsSecion>
                                        <Button variant="outlined" onClick={print}>Print</Button>
                                    </ButtonsSecion>
                                </div>
                                <div ref={sheetRef}>
                                    <ReportHeader />
                                    <div className="text-base font-semibold capitalize py-2">
                                        Name: {person.name} &nbsp; {person.detail ? `Class: ${person.detail}` : ""}
                                    </div>
                                    <div className="overflow-x-auto print:overflow-visible">
                                        <div className="min-w-[60rem] print:min-w-0">
                                            <div className={`${grid} font-semibold p-2 bg-table-header rounded-md`}>
                                                <span>S.N</span>
                                                <span>Receipt no.</span>
                                                <span>Date</span>
                                                <span className="col-span-3">Particular</span>
                                                <span>Dr.</span>
                                                <span>Cr.</span>
                                                <span>Payment mode</span>
                                                <span>Balance</span>
                                                <span>Months</span>
                                                <span></span>
                                            </div>
                                            <div className="children-text-base">
                                                {rows.map((row, sn) => {
                                                    const deletable = row.receipt || (row.kind === TXN_POSTING && canWithdraw);
                                                    return (
                                                        <div key={row.id} className={`${grid} ${rowTone(row)} py-2`}>
                                                            <span>{sn + 1}</span>
                                                            <span>{row.reference}</span>
                                                            <span>{row.date}<span className="block text-xs">{row.time}</span></span>
                                                            <span className="col-span-3 flex flex-col px-2 border border-gray-400 border-dotted">
                                                                <span className="text-left text-xs">{row.what}</span>
                                                                {(row.lines || []).map((l, i) => (
                                                                    <span key={i} className="flex justify-between">
                                                                        <span className="font-semibold capitalize">{l.name}{l.qty > 1 ? ` x${l.qty}` : ""}</span>
                                                                        <span>{rs(l.amount)}</span>
                                                                    </span>
                                                                ))}
                                                                {Number(row.advance) > 0 && (
                                                                    <span className="flex justify-between">
                                                                        <span className="font-semibold">Advance</span>
                                                                        <span>{rs(row.advance)}</span>
                                                                    </span>
                                                                )}
                                                            </span>
                                                            <span className={dr(row) ? "font-semibold text-amber-900" : ""}>Rs. {rs(dr(row))}</span>
                                                            <span className={cr(row) ? "font-semibold text-emerald-900" : ""}>Rs. {rs(cr(row))}</span>
                                                            <span className="capitalize">{row.mode_name || "—"}</span>
                                                            <span>Rs. {rs(-Number(row.running || 0))}</span>
                                                            <span className="capitalize break-words">{(row.months || []).join(", ") || "—"}</span>
                                                            <div className="flex justify-end gap-x-2 hide-from-print">
                                                                {row.receipt && <ReprintButton onClick={() => onReprint(row.receipt)} />}
                                                                {deletable && <DeleteButton onClick={() => onDelete(row)} />}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                <div className={`${grid} text-right py-1`}>
                                                    <span className="col-span-8 text-base font-semibold capitalize">Total due</span>
                                                    <span className="col-span-2 font-semibold text-center">Rs. {rs(profile.summary.due)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </Card>
                </AccordionBody>
            </Accordion>
        </div>
    );
}

export default TrialBalance;
