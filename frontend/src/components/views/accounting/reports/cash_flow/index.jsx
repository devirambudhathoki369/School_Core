import Loader from "@/components/Loader";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import ReportHeader from "@/components/tables/ReportHeader";
import ReportActionBar from "@/components/tables/ReportActionBar";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __search } from "@/services/functions";
import { useEffect, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import { useReactToPrint } from "react-to-print";
import getCurrentDateTime from "@/methods/getCurrentDateTime";

const searchSchema = { school: '', economic_year: '', start_date: '', end_date: '' };

function CashFlowReport() {
    const { user: { user }, fiscalYear: { year, years, mappedYears, getCurrentAccountingEconomicYear },
        notification: { updateNotification } } = useAppContext();
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [data, setData] = useState(null);
    const [generatedTime, setGeneratedTime] = useState('');
    const { searching, statusHandler } = useRequestStatus();

    const reportRef = useRef(null);
    const printReport = useReactToPrint({ content: () => reportRef.current });

    function onChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }
    // selecting a fiscal year repoints the date range to that year.
    function onYearChange({ value }) {
        const ey = mappedYears?.allAccountingEconomicYears?.[value];
        setSearchInput(state => ({
            ...state,
            economic_year: value,
            start_date: ey?.start_date || state.start_date,
            end_date: ey?.end_date || user?.today || state.end_date,
        }));
    }
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const [status, msg, _data] = await __search("/accounting/reports/cash_flow", searchInput);
        updateNotification(status, msg);
        if (_data) {
            setData(_data);
            setGeneratedTime(getCurrentDateTime());
        } else {
            setGeneratedTime('');
            setData(null);
        }
        statusHandler.toggleSearching();
    }
    function allowSearch() {
        return (searchInput?.school && searchInput?.economic_year &&
            searchInput?.start_date && searchInput?.end_date);
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

    return (
        <>
            <form onSubmit={onSearch}>
                <Section>
                    <SelectInput input={{ name: 'economic_year', label: "Fiscal Year", options: years?.allAccountingEconomicYears || [] }}
                        value={searchInput?.economic_year} onChange={onYearChange} />
                    <TextInput input={{ name: 'start_date', label: "Date (From)" }} value={searchInput?.start_date} onChange={onChange} />
                    <TextInput input={{ name: 'end_date', label: "Date (To)" }} value={searchInput?.end_date} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} disabled={!allowSearch()} />
                </ButtonsSecion>
            </form>
            <div className="my-2">
                {data ?
                    <>
                        <ReportActionBar onPrint={printReport} reportRef={reportRef}
                            exportName={"Cash Flow Statement"}
                            exportTitles={[`From ${searchInput.start_date} to ${searchInput.end_date}`]} />
                        <div ref={reportRef} className="rounded-md my-2">
                            <ReportHeader />
                            <div className="flex flex-col gap-y-2 text-center font-bold children-text-base px-5">
                                <span className="!text-2xl">Cash Flow Statement</span>
                                <span>From {searchInput.start_date} to {searchInput.end_date}</span>
                                <span className="text-end">Date : {user?.today}</span>
                            </div>
                            <div className="my-0 py-2 bg-transparent">
                                <table className="w-full text-left accounting-report">
                                    <tbody className="w-full border-collapse [&_td]:p-2 [&_td]:border [&_td]:border-gray-500">
                                        <Activity title="A. Cash Flow from Operating Activities" section={data.operating} />
                                        <Activity title="B. Cash Flow from Investing Activities" section={data.investing} />
                                        <Activity title="C. Cash Flow from Financing Activities" section={data.financing} />
                                        {data.other?.items?.length > 0 &&
                                            <Activity title="D. Other / Unclassified" section={data.other} />}
                                        <tr className="font-bold bg-gray-100">
                                            <td>Net Increase / (Decrease) in Cash & Bank</td>
                                            <td className="text-right">{data.net_change}</td>
                                        </tr>
                                        <tr className="font-bold">
                                            <td>Add: Opening Cash & Bank Balance</td>
                                            <td className="text-right">{data.opening_cash}</td>
                                        </tr>
                                        <tr className="font-bold bg-gray-100">
                                            <td>Closing Cash & Bank Balance</td>
                                            <td className="text-right">{data.closing_cash}</td>
                                        </tr>
                                    </tbody>
                                </table>
                                <div className="flex justify-between items-center p-4 font-bold">
                                    <span>Report generated at : {generatedTime}</span>
                                    <span className="capitalize">Report generated by : {user?.profile?.school_name || user?.profile?.name}</span>
                                </div>
                            </div>
                        </div>
                    </> :
                    <>{searching ? <Loader /> : null}</>
                }
            </div>
        </>
    );
}

function Activity({ title, section }) {
    const items = section?.items || [];
    return (
        <>
            <tr className="font-bold uppercase bg-table-header">
                <td colSpan={2}>{title}</td>
            </tr>
            {items.length === 0 ?
                <tr><td className="italic text-gray-500" colSpan={2}>No activity</td></tr> :
                items.map((it, i) => (
                    <tr key={i}>
                        <td className="capitalize pl-6">{it.name}</td>
                        <td className="text-right">{it.amount}</td>
                    </tr>
                ))
            }
            <tr className="font-bold">
                <td>Net Cash from {title.replace(/^[A-D]\.\s*Cash Flow from\s*/, '')}</td>
                <td className="text-right">{section?.total ?? 0}</td>
            </tr>
        </>
    );
}

export default CashFlowReport;
