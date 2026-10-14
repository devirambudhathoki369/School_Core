import { confirmAction } from "@/components/ConfirmDialog";
import { SearchInput } from "@/components/inputs";
import { ButtonsSecion } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import { Button } from "@material-tailwind/react";

function FiscalYearView({ toggleFiscalYearView }) {
    const { fiscalYear: { fyKeys, years, year, updateAcademicYear, updateAccountingEconomicYear } } = useAppContext();
    async function onChange({ name, value }) {
        if (await confirmAction({
            title: "Switch to a different fiscal year?",
            body: "Every screen reloads against the year you pick. Records you were part-way through entering are not saved.",
            tone: "warning",
            confirmText: "Switch year",
        })) {
            localStorage.setItem(fyKeys[name], value);
            if (name === "academic_year") updateAcademicYear(value);
            else if (name === "accounting_economic_year") updateAccountingEconomicYear(value);
        }
        toggleFiscalYearView();
    }
    // 
    return (
        <>
            {
                /*
                    `w-max` sized this to its longest row — "Active Accounting
                    Economic Year is :" plus a select — which is wider than a
                    phone. Anchored to `right-[3%]`, the overflow went off the
                    LEFT edge, so the labels were the half you couldn't read.
                    It is capped to the viewport now, and each row stacks below
                    `sm` instead of squeezing its select down to nothing.
                */
                <div className="flex flex-col items-stretch w-[min(92vw,30rem)] max-w-[92vw] z-30 absolute right-[3%] top-12 !bg-blue-100 
                    border-2 border-blue-gray-200 p-3 rounded-md bg-sidebar shadow-lg">
                    <div className="flex flex-wrap gap-x-2 justify-between items-center border-b border-black mb-2 pb-1">
                        <span className="font-semibold">Active Economic Year is : </span>
                        <span className="font-semibold text-base text-blue-gray-600 ">{year?.economic_year_name}</span>
                    </div>
                    <span className="text-center text-green-700 underline my-1">Click on boxes to change fiscal years!</span>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                        <span className="font-semibold">Active Academic Year is : </span>
                        <SearchInput value={year?.academic_year} onChange={onChange}
                            input={{ name: 'academic_year', label: '', options: years?.academicYears || [] }} />
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                        <span className="font-semibold">Active Accounting Economic Year is : </span>
                        <SearchInput value={year?.accounting_economic_year} onChange={onChange}
                            input={{ name: 'accounting_economic_year', label: '', options: years?.accountingEconomicYears || [] }} />
                    </div>
                    <ButtonsSecion className={"my-1"}>
                        <Button className="px-5 py-2" variant="outlined" onClick={toggleFiscalYearView}>Close</Button>
                    </ButtonsSecion>
                </div>
            }
        </>
    )
}

export default FiscalYearView;