import { useEffect, useState } from "react";
import { Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { __fetch } from "@/services/functions";

const PAYROLL_CLOSE_API = "/api/payroll/year_close";

function rs(value) {
    const n = Number(value);
    return (Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

// The payroll years that close together with an accounting year, each with
// what it would carry forward: [{economic_year, next_economic_year,
// staff_count, total, rows}]. Empty when no payroll year closes with it -- most
// schools keep no payroll here, and the year a school is still working in is
// never closed.
function usePayrollClosingWith(school, accountingYear) {
    const [pending, setPending] = useState([]);

    useEffect(() => {
        if (!school || !accountingYear) return;
        // a slower answer for another year must not land on this one
        let stale = false;
        (async () => {
            const data = await __fetch(PAYROLL_CLOSE_API, { school, accounting_economic_year: accountingYear });
            if (!stale) setPending(Array.isArray(data?.pending) ? data.pending : []);
        })();
        return () => { stale = true; };
    }, [school, accountingYear]);

    return pending;
}

// The alert: said on the closing step AND inside the confirmation, because
// closing the books also closes something the school may not be thinking of.
// '' when no payroll year closes with it.
function payrollAlert(pending) {
    return (pending || []).map(year => {
        const name = year?.economic_year?.name || "this year";
        const into = year?.next_economic_year?.name || "the next year";
        const carried = Number(year?.staff_count) > 0
            ? `Rs. ${rs(year?.total)} still owed to ${year.staff_count} staff will be carried into ${into} as old dues`
            : `every member of staff is settled, so nothing is carried into ${into}`;
        return `This also closes payroll ${name}: ${carried}, and ${name} will take no more salary postings or payments.`;
    }).join(" ");
}

// What each member of staff is still owed, listed before the school confirms.
function PayrollCarryPreview({ pending }) {
    return (pending || []).map(year => {
        const into = year?.next_economic_year?.name || "the next year";
        const rows = [
            ...(year?.rows || []).map(row => ({ id: row.staff, name: row.name, amount: rs(row.total) })),
            { id: "total", name: "Total", amount: rs(year?.total) },
        ];
        return (
            <Section key={year?.economic_year?.id} grid={false}
                title={`Payroll ${year?.economic_year?.name || ""} closes with it`}
                description={`What each member of staff is still owed is carried into ${into} as old dues, ready to pay from Payroll. An amount with a minus was paid ahead.`}>
                <BasicTable name={`Staff balances carried into ${into}`} data={rows}
                    columns={[['name', 'Staff'], ['amount', 'Carried forward (Rs.)']]}
                    onSelect={() => null} showSelected={false} highLightLast={true} />
            </Section>
        );
    });
}

export default PayrollCarryPreview;
export { usePayrollClosingWith, payrollAlert };
