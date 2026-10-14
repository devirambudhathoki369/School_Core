import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __fetch } from "@/services/functions";
import { useState } from "react";
import { payrollStaffName } from "@/configs/payroll";

const searchSchema = { start_date: '', end_date: '', school: '', salary_sheet: true };
const summaryRow = { name: "Totals", previous_dues: 0, salary: 0, funds: 0, grade: 0, allowance: 0, extra: 0, total: 0, tax: 0, pf: 0, insurance: 0, deduction: 0, net: 0, paid: 0, balance: 0 };
function SalarySheet() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    searchSchema["school"] = user?.profile?.school || user?.profile?.id;
    searchSchema["start_date"] = user?.today;
    searchSchema["end_date"] = user?.today;
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [data, setData] = useState([]);
    const { searching, statusHandler } = useRequestStatus();
    // "Previous dues" is what each member of staff was owed coming into the
    // range: old dues carried in by a year-close, and any earlier month of
    // this year still unpaid. Balance counts it, so the sheet ends on what the
    // payment screen says is owed. The column is there only when somebody has
    // some: a range nobody owes anything before reads as it always did.
    //
    // The same goes for the titles and deductions a school does not use. Most
    // pay a salary and perhaps an allowance, and the sheet carried five columns
    // of zeros for the rest (funds, grade, extra, PF, insurance), wide enough
    // to push Balance off the side of the screen. A column appears as soon as
    // one person on the sheet has an amount in it; print and export follow.
    const used = (key) => data.some(row => Number(row?.[key]));
    const usedOnly = (columns) => columns.filter(([key]) => used(key));

    function onChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        let data = await __fetch("api/staff_payments", searchInput);
        if (data?.length > 0) {
            // the sheet also lists people who have left but are still owed
            data = data.map(row => ({ ...row, name: payrollStaffName(row) }));
            const totals = data.reduce((acc, item) => {
                Object.keys(acc).forEach(key => {
                    if (key === "name") return;
                    acc[key] += Number(item[key]) || 0;
                })
                return acc;
            }, { ...summaryRow });
            data.push(totals);
            setData(data);
        } else {
            updateNotification(404, "Data not found!");
        }
        statusHandler.toggleSearching();
    }

    return (
        <>
            {/* search form */}
            <form className="my-1" onSubmit={onSearch}>
                <Section title={"Search"}>
                    <TextInput input={{ name: 'start_date', label: "Date (from)" }} value={searchInput?.start_date} onChange={onChange} />
                    <TextInput input={{ name: 'end_date', label: "Date (to)" }} value={searchInput?.end_date} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
            {/* data-table */}
            <BasicTable name={"Salary Sheet"} header={
                <span className="mb-2">Salary sheet from : {searchInput.start_date} to {searchInput.end_date}</span>
            } data={data} columns={[
                ['name'], ['designation'],
                ...usedOnly([['previous_dues', 'Previous dues']]),
                ['salary'], ...usedOnly([['funds'], ['grade'], ['allowance'], ['extra']]),
                ['total', 'Gross'], ...usedOnly([['tax', 'TDS'], ['pf', 'PF'], ['insurance', 'Insurance']]),
                ['deduction', 'Deductions'], ['net', 'Net Salary'], ['paid', 'Paid'], ['balance', 'Balance']
            ]} showSelected={false} print={true} highLightLast={true}
                // sixteen or seventeen columns: tightened so that Balance, the
                // figure the sheet exists for, is not off the side of the card
                dense />
        </>
    )
}

export default SalarySheet;