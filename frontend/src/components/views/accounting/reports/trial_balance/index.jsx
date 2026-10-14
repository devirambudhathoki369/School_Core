import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import { ButtonsSecion, Section } from "@/components/sections";
import ColumnHeader from "@/components/tables/ColumnHeader";
import ReportHeader from "@/components/tables/ReportHeader";
import ReportActionBar from "@/components/tables/ReportActionBar";
import { customParseFloat } from "@/components/views/accounting/methods";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import getCurrentDateTime from "@/methods/getCurrentDateTime";
import { __search } from "@/services/functions";
import { Button } from "@material-tailwind/react";
import { Fragment, useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";

const API_PATH = "/accounting/reports/trial_balance";
const searchSchema = { school: '', economic_year: '', start_date: '', end_date: '' };
const optionsSchema = { show_ledgers: true, show_detailed: false };
function AccountingTrialBalance() {
    const { user: { user }, fiscalYear: { year, years, mappedYears, getCurrentAccountingEconomicYear },
        notification: { updateNotification } } = useAppContext();
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [data, setData] = useState({});
    const [options, setOptions] = useState({ ...optionsSchema });
    const [cols, setCols] = useState([]);
    const [generatedTime, setGeneratedTime] = useState('');
    const { searching, statusHandler } = useRequestStatus();

    const reportRef = useRef(null);
    const printReport = useReactToPrint({
        content: () => reportRef.current,
    });

    function onChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }
    function onYearChange({ value }) {
        const ey = mappedYears?.allAccountingEconomicYears?.[value];
        setSearchInput(state => ({
            ...state, economic_year: value,
            start_date: ey?.start_date || state.start_date,
            end_date: ey?.end_date || user?.today || state.end_date,
        }));
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const [status, msg, data] = await __search(API_PATH, { ...searchInput });
        updateNotification(status, msg);
        if (data) {
            setData(data);
            setGeneratedTime(getCurrentDateTime());
        } else {
            setData({});
            setGeneratedTime('');
        }
        statusHandler.toggleSearching();
    }

    useEffect(() => {
        // The ACTIVE accounting year when one has been chosen, otherwise the
        // school's current one. `year.accounting_economic_year` is read from
        // localStorage and stays empty until somebody uses the top-right
        // fiscal-year picker on this browser, so without the fallback a fresh
        // machine — or a member of staff signing in for the first time — opens
        // this report with a blank Fiscal Year and a Search button that will
        // not enable. A chosen year still wins; this only fills the hole.
        const economic_year = year?.accounting_economic_year ||
            getCurrentAccountingEconomicYear(user?.today);
        searchSchema["school"] = user?.profile?.school || user?.profile?.id;
        searchSchema["economic_year"] = economic_year;
        searchSchema["start_date"] = mappedYears?.allAccountingEconomicYears?.[economic_year]?.start_date;
        searchSchema["end_date"] = user?.today;
        setSearchInput(state => ({ ...state, ...searchSchema }));
        // `mappedYears` too: the fallback reads it, and it must not be a
        // coincidence of React batching that it is already there.
    }, [year, mappedYears]);

    useEffect(() => {
        if (options?.show_detailed) setCols(["Opening", "Transaction", "Closing"]);
        else setCols(["Closing"]);
    }, [options?.show_detailed]);

    function allowSearch() {
        return (searchInput?.school && searchInput?.economic_year &&
            searchInput?.start_date && searchInput?.end_date);
    }

    return (
        <>
            <form onSubmit={onSearch}>
                <Section>
                    <SelectInput input={{ name: 'economic_year', label: "Fiscal Year", options: years?.allAccountingEconomicYears || [] }}
                        value={searchInput?.economic_year} onChange={onYearChange} />
                    <TextInput input={{ name: 'start_date', label: "Date (From)" }}
                        value={searchInput?.start_date} onChange={onChange} />
                    <TextInput input={{ name: 'end_date', label: "Date (To)" }}
                        value={searchInput?.end_date} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} disabled={!allowSearch()} />
                </ButtonsSecion>
            </form>

            <>
                {
                    searching ? <Loader /> :
                        <>
                            {
                                !data?.data?.length ?
                                    <NotFound /> :
                                    <div className="my-2">
                                        <Section>
                                            <Checkbox checked={options?.show_ledgers} name={"show_ledgers"} text={"Show Ledgers"}
                                                onClick={() => {
                                                    setOptions(state => ({ ...state, show_ledgers: !state.show_ledgers }));
                                                }} />
                                            <Checkbox checked={options?.show_detailed} name={"show_detailed"} text={"Show Detailed"}
                                                description={"Extend with opening and transaction columns."}
                                                onClick={() => {
                                                    setOptions(state => ({ ...state, show_detailed: !state.show_detailed }));
                                                }} />
                                        </Section>
                                        <ReportActionBar onPrint={printReport} reportRef={reportRef}
                                            exportName={"Trial Balance"}
                                            exportTitles={[`From ${searchInput.start_date} to ${searchInput.end_date}`]} />
                                        <div ref={reportRef} className="rounded-md my-2">
                                            <ReportHeader />
                                            <div className="flex flex-col gap-y-2 text-center font-bold children-text-base px-5">
                                                <span className="!text-2xl">Trial Balance</span>
                                                <span>From {searchInput.start_date} to {searchInput.end_date}</span>
                                                <span className="text-end">Date : {user?.today}</span>
                                            </div>
                                            {/* MERGED TABLE */}
                                            <div className="w-full flex justify-center">
                                                <span className="p-2 text-lg font-bold">
                                                    {mappedYears?.allAccountingEconomicYears?.[searchInput?.economic_year]?.name ||
                                            year?.accounting_economic_year_name}
                                                </span>
                                            </div>
                                            <div className="flex">
                                                <table className="w-full text-left">
                                                    <thead className="uppercase cursor-pointer bg-table-header">
                                                        <tr>
                                                            <ColumnHeader columnName={"Account Title"} rowSpan={2} />
                                                            <>
                                                                {
                                                                    cols.map((col, ci) => (
                                                                        <ColumnHeader key={ci} columnName={col} colSpan={2} classNameTypo={"mx-auto"} />
                                                                    ))
                                                                }
                                                            </>
                                                        </tr>
                                                        <tr>
                                                            {
                                                                cols.map((_, ci) => (
                                                                    <Fragment key={ci}>
                                                                        <ColumnHeader columnName={"Debit"} />
                                                                        <ColumnHeader columnName={"Credit"} />
                                                                    </Fragment>
                                                                ))
                                                            }
                                                        </tr>
                                                    </thead>
                                                    <tbody className="w-full border-collapse [&_*]:p-2 [&_*]:border [&_*]:border-gray-500">
                                                        {
                                                            data?.data.map((group, sn) => (
                                                                <Fragment key={sn}>
                                                                    <tr className="font-semibold">
                                                                        <td>{group.group}</td>
                                                                        <>
                                                                            {options?.show_detailed &&
                                                                                <>
                                                                                    <td>{customParseFloat(group?.group_opening_debit) || "0.00"}</td>
                                                                                    <td>{customParseFloat(group?.group_opening_credit) || "0.00"}</td>
                                                                                    <td>{customParseFloat(group.group_debit) || "0.00"}</td>
                                                                                    <td>{customParseFloat(group.group_credit) || "0.00"}</td>
                                                                                </>
                                                                            }
                                                                        </>
                                                                        <td>{customParseFloat(group?.group_closing_debit) || "0.00"}</td>
                                                                        <td>{customParseFloat(group?.group_closing_credit) || "0.00"}</td>
                                                                    </tr>
                                                                    <>
                                                                        {options?.show_ledgers &&
                                                                            group["ledgers"].map(ledger => (
                                                                                <tr key={ledger.id}>
                                                                                    <td className="!pl-4">{ledger.ledger}</td>
                                                                                    <>
                                                                                        {
                                                                                            options?.show_detailed &&
                                                                                            <>
                                                                                                <td>{customParseFloat(ledger?.opening_debit) || "0.00"}</td>
                                                                                                <td>{customParseFloat(ledger?.opening_credit) || "0.00"}</td>
                                                                                                <td>{customParseFloat(ledger?.debit) || "0.00"}</td>
                                                                                                <td>{customParseFloat(ledger?.credit) || "0.00"}</td>
                                                                                            </>
                                                                                        }
                                                                                    </>
                                                                                    <td>{customParseFloat(ledger.closing_debit) || "0.00"}</td>
                                                                                    <td>{customParseFloat(ledger.closing_credit) || "0.00"}</td>
                                                                                </tr>
                                                                            ))
                                                                        }
                                                                    </>
                                                                    <tr></tr>
                                                                </Fragment>
                                                            ))
                                                        }
                                                        <tr className="font-bold">
                                                            <td>Total</td>
                                                            <>
                                                                {options?.show_detailed &&
                                                                    <>
                                                                        <td>{customParseFloat(data?.total_opening_debit) || "0.00"}</td>
                                                                        <td>{customParseFloat(data?.total_opening_credit) || "0.00"}</td>
                                                                        <td>{customParseFloat(data?.total_debit) || "0.00"}</td>
                                                                        <td>{customParseFloat(data?.total_credit) || "0.00"}</td>
                                                                    </>
                                                                }
                                                            </>
                                                            <td>{customParseFloat(data?.total_closing_debit) || "0.00"}</td>
                                                            <td>{customParseFloat(data?.total_closing_credit) || "0.00"}</td>
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                            <div className="flex justify-between items-center p-4 font-bold">
                                                <span>
                                                    Report generated at : {generatedTime}
                                                </span>
                                                <span className="capitalize">
                                                    Report generated by : {user?.profile?.school_name || user?.profile?.name}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                            }
                        </>
                }
            </>
        </>
    )
}

export default AccountingTrialBalance;