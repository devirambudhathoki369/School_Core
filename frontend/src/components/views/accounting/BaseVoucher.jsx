import { useAppContext } from "@/contexts/AppContext";
import BillHeader from "../payments/BillHeader";
import numberToWords from "@/methods/numberToWords";
import { useEffect, useState } from "react";
import { BALANCE_TYPES } from "./ledger_groups";
import { splitDebitCredit } from ".";
import { customParseFloat } from "./methods";
import { ENTRIES } from "@/components/views/accounting/acc_constants";
import Signatures from "@/components/views/exams/reports/Signatures";

const totalsSchema = { debit: 0.0, credit: 0.0 };
function particularsTotal(entry_id, entry) {
    return (entry?.particulars || []).reduce((acc, par) => {
        const type = par?.type || splitDebitCredit(entry_id, par?.ledger_group);
        if (type === BALANCE_TYPES.DEBIT.value) {
            acc['debit'] += parseFloat(par?.amount || 0);
        } else if (type === BALANCE_TYPES.CREDIT.value) {
            acc['credit'] += parseFloat(par?.amount || 0);
        }
        return acc;
    }, { ...totalsSchema });
}

function BaseVoucher({ id, name = "Voucher", entry }) {
    const { user: { user } } = useAppContext();
    const [totals, setTotals] = useState({ ...totalsSchema });

    function getEntryLedgerType() {
        return entry?.ledger_group ? splitDebitCredit(id, entry.ledger_group) : null;
    }

    useEffect(() => {
        if (entry?.particulars) {
            setTotals(particularsTotal(id, entry));
        }
    }, [entry]);

    const showAcknowledgeMent = [ENTRIES.EXPENSE.ID, ENTRIES.JOURNAL.ID].includes(id);

    return (
        <>
            <div className={"bill voucher print:h-[99vh] print-border"}>
                <BillHeader user={user} />
                <hr className="my-2 border-black" />
                <div className="w-full flex flex-col gap-y-1">
                    {entry?.is_active === false &&
                        <span className="uppercase text-center !font-bold text-red-600 border-2 border-red-600 rounded-md py-0.5 tracking-widest">
                            Deleted / Cancelled
                        </span>
                    }
                    <span className="uppercase text-center !font-bold underline">
                        {name}
                    </span>
                    <div className="my-1 flex justify-between items-center">
                        <span>Voucher No :- {entry?.voucher_id}</span>
                        <span>Date :- {entry?.date}</span>
                    </div>
                </div>
                <table className="w-full !rounded-2xl">
                    <VoucherTable id={id} entry={entry}
                        entryLedgerType={getEntryLedgerType()} totals={totals} />
                </table>
                <div className="flex flex-col mt-2">
                    <span>In words :- {numberToWords(totals?.debit || totals?.credit)} only /-</span>
                    {entry?.remarks &&
                        <span>Remarks : {entry?.remarks}</span>
                    }
                </div>

                <Signatures signees={[
                    { position: "Prepared By", username: entry?.accountant || "admin" },
                    { position: "Checked By" },
                    { position: "Approved By" },
                ]} showIssueDate={false} />

                {showAcknowledgeMent &&
                    <VoucherAcknowledgement org={user?.profile || {}} />}
            </div>
        </>
    )
}

function VoucherTable({ id, entry, entryLedgerType, totals }) {
    const HEADS = ['particulars', 'debit', 'credit', 'remarks'];

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
                {(entry?.particulars || [])
                    .sort((a, b) => a.type - b.type)
                    .map((particular, i) => {
                        const { ledger_name, type, amount, remarks } = particular;
                        let ledger_group_type = type ? type : (particular?.ledger_group ?
                            splitDebitCredit(id, particular.ledger_group) : null);
                        const isDebitSide = ledger_group_type === BALANCE_TYPES.DEBIT.value,
                            isCreditSide = ledger_group_type === BALANCE_TYPES.CREDIT.value;
                        return (
                            <tr key={i}>
                                <td className={`capitalize !p-[0.2rem] ${isCreditSide ? '!pl-5' : ''}`}>{ledger_name || ''}</td>
                                {
                                    (ledger_group_type) ?
                                        <>
                                            {/* dr */}
                                            <td>{isDebitSide ? customParseFloat(amount) : "0.00"}</td>
                                            {/* cr */}
                                            <td>{isCreditSide ? customParseFloat(amount) : "0.00"}</td>
                                        </> :
                                        <td colSpan={2}></td>
                                }
                                <td className="!max-w-[20rem]">{remarks || ''}</td>
                            </tr>
                        )
                    })}
                <tr>
                    <td>Total Amount</td>
                    <td>{customParseFloat(totals?.debit) || "0.00"}</td>
                    <td>{customParseFloat(totals?.credit) || "0.00"}</td>
                    <td></td>
                </tr>
            </tbody>
        </>
    )
}

function VoucherAcknowledgement({ org }) {
    return (
        <div className="mt-20 py-4 px-2 border border-gray-600 rounded-md shadow-md flex flex-col gap-y-2">
            <span className="text-center underline !text-lg">रकम बुझिलिएको भरपाई</span>
            <div className="w-max mx-auto !text-lg">
                &nbsp; भरपाई दादै ....................................................... उ.म.न.पा. /न.पा. /गा.पा. वडा नं. ........... <br />
                टोल ................................................................. बस्ने म ............................................................ <br />
                ले ........................................................................................... वापत रु. .................................. <br />
                अक्षरुपी रु. ...................................................................................................................... मात्र <br />
                नगद/चेक नं. .................................................................................................................... बाट <br />
                आज मिति .................................................. गतेका दिन बुझिलिई यो भरपाई गरिदियाँ । <br />
                इति सम्बत् २०............ साल .......... महिना .......... गते ................................ रोज शुभम् । <br />
            </div>
            <hr className="border-gray-600" />
            <div className="flex justify-between items-start mt-7 p-2">
                <div className="flex flex-col max-w-1/2">
                    <span>.....................................</span>
                    <span>रकम बुझाउनेको सहि</span>
                    <span>नाम :- </span>
                    <span>ठेगाना :- </span>
                    <span className="!font-bold">{org?.school || org?.name}, {org?.school_address || org?.address}</span>
                </div>
                <div className="flex flex-col">
                    <span>......................................</span>
                    <span>रकम बुझिलिनेको सहि</span>
                    <span>नाम :-</span>
                    <span>ठेगाना :-</span>
                </div>
            </div>
        </div>
    )
}

export default BaseVoucher;