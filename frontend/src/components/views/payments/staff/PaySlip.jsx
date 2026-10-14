import { months } from "@/components/inputs/options/months";
import Signature from "../../exams/reports/Signature";
import numberToWords from "@/methods/numberToWords";
import BillHeader from "../BillHeader";
import { payrollTitle } from "@/configs/payroll";

function PaySlip({ invoice, cashier, designation, user, reprint = false }) {
    // Who paid the salary, and when, is the server's to say, as on a student
    // receipt (`methods/payment/invoice.js`): the slip used to be signed with
    // the name and designation of whoever was reading it. `cashier` and
    // `designation`, the reader's own, are used only against a server that
    // does not send this yet.
    const serverNamesThePayer = invoice?.entered_on !== undefined;
    const signedBy = serverNamesThePayer ? (invoice?.cashier || '') : (cashier || "Admin");
    const signedAs = serverNamesThePayer ? (invoice?.cashier_designation || null) : (designation || null);
    // The time follows the slip's date only when that is the day it was entered.
    const enteredSameDay = !!invoice?.entered_time && invoice?.entered_on === invoice?.date;
    const enteredLater = !!invoice?.entered_time && !!invoice?.entered_on && !enteredSameDay;
    const deleted = invoice?.deleted;
    const tds = Number(invoice?.total_deduction) || 0;
    const pf = Number(invoice?.pf_deduction) || 0;
    const insurance = Number(invoice?.insurance_deduction) || 0;
    const totalDeductions = tds + pf + insurance;
    // earnings cell spans the TDS row, each present extra-deduction row, and the total row
    const deductionRows = 2 + (pf ? 1 : 0) + (insurance ? 1 : 0);
    return (
        <div className="bill">
            <BillHeader user={user} />
            <hr className="my-2 border-black" />
            <div className="my-2 text-center !font-bold underline">
                PAY SLIP{deleted ? ' (DELETED)' : reprint ? ' (REPRINTED)' : ''}
            </div>
            {deleted &&
                <div className="text-center">
                    Deleted by : {deleted.by || 'not recorded'}
                    {deleted.on ? `, ${deleted.on} ${deleted.time || ''}` : ''}
                </div>
            }
            <div className="flex justify-between items-center gap-x-4">
                <span>Ref No : {invoice?.invoice_id || ""}</span>
                <span className="text-right">Date : {invoice?.date || ""}{enteredSameDay ? ` ${invoice.entered_time}` : ''}</span>
            </div>
            {enteredLater &&
                <div className="text-right">Entered on : {invoice.entered_on} {invoice.entered_time}</div>
            }
            <div className="flex flex-col">
                <span className="capitalize">Employee Name : {invoice?.staff_name}</span>
                <span className="capitalize">Designation : {invoice?.designation}</span>
                <div className="flex justify-between">
                    <span className="capitalize">Month : {months?.[invoice?.payment_month] || ""}</span>
                    <span className="capitalize">By : {invoice?.payment_mode}</span>
                </div>
            </div>
            <table className="w-full !rounded-2xl my-1">
                <thead>
                    <th className="font-semibold uppercase p-1">Earnings</th>
                    <th className="font-semibold uppercase p-1">Total</th>
                    <th className="font-semibold uppercase p-1">TDS (%)</th>
                    <th className="font-semibold uppercase p-1">Deduction</th>
                    <th className="font-semibold uppercase p-1">Amount</th>
                </thead>
                <tbody>
                    {
                        Object.entries(invoice?.details || {}).map(([title, entry]) => {
                            const { amt, tdsp, tdsa } = entry;
                            return (
                                <tr key={title}>
                                    <td className="capitalize">{payrollTitle(title)}</td>
                                    <td>{amt}</td>
                                    <td>{tdsp}</td>
                                    <td>{tdsa}</td>
                                    <td>{amt - (tdsa || 0)}</td>
                                </tr>
                            )
                        })
                    }
                    <tr>
                        <td rowSpan={deductionRows} className="font-semibold">Total Earnings</td>
                        <td rowSpan={deductionRows} className="font-semibold">{invoice?.total}</td>
                        <td colSpan={2}>TDS</td>
                        <td>{tds}</td>
                    </tr>
                    {pf ?
                        <tr>
                            <td colSpan={2}>Provident Fund (PF)</td>
                            <td>{pf}</td>
                        </tr> : null}
                    {insurance ?
                        <tr>
                            <td colSpan={2}>Insurance</td>
                            <td>{insurance}</td>
                        </tr> : null}
                    <tr>
                        <td colSpan={2} className="font-semibold">Total Deductions</td>
                        <td className="font-semibold">{totalDeductions}</td>
                    </tr>
                    <tr>
                        <td colSpan={3} className="font-semibold">Net Earnings</td>
                        <td colSpan={2} className="font-semibold">{invoice?.total_paid}</td>
                    </tr>
                </tbody>
            </table>
            <div className="flex flex-wrap">
                (In words: {numberToWords(invoice?.total_paid)} rupees only.)
            </div>
            <div className="w-full flex justify-between items-end">
                <span></span>
                <Signature user={signedBy} designation={signedAs} />
            </div>
        </div>
    )
}

export default PaySlip;