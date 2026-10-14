import Loader from "@/components/Loader";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import ReportHeader from "@/components/tables/ReportHeader";
import ReportActionBar from "@/components/tables/ReportActionBar";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __search } from "@/services/functions";
import { Fragment, useEffect, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import ColumnHeader from "@/components/tables/ColumnHeader";
import { MAPPED_LEDGER_GROUPS } from "../../ledger_groups";
import { useReactToPrint } from "react-to-print";
import getCurrentDateTime from "@/methods/getCurrentDateTime";

const searchSchema = { school: '', economic_year: '', start_date: '', end_date: '' };
function ProfitLossReport() {
    const { user: { user }, fiscalYear: { year, years, mappedYears, getCurrentAccountingEconomicYear },
        notification: { updateNotification } } = useAppContext();
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [data, setData] = useState({});
    const [generatedTime, setGeneratedTime] = useState('');
    const { searching, statusHandler } = useRequestStatus();

    // 
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
        // 
        const [status, msg, _data] = await __search("/accounting/reports/profit_loss", searchInput);
        updateNotification(status, msg);
        if (_data) {
            setData(_data);
            setGeneratedTime(getCurrentDateTime());
        } else {
            setGeneratedTime('');
            setData({});
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
                {data?.particulars ?
                    <>
                        <ReportActionBar onPrint={printReport} reportRef={reportRef}
                            exportName={"Profit And Loss Report"}
                            exportTitles={[`From ${searchInput.start_date} to ${searchInput.end_date}`]} />
                        <div ref={reportRef} className="rounded-md my-2">
                            <ReportHeader />
                            <div className="flex flex-col gap-y-2 text-center font-bold children-text-base px-5">
                                <span className="!text-2xl">Profit And Loss Report</span>
                                <span>From {searchInput.start_date} to {searchInput.end_date}</span>
                                <span className="text-end">Date : {user?.today}</span>
                            </div>
                            <div className="my-0 py-2 bg-transparent">
                                <table className={`w-full text-left accounting-report`}>
                                    <thead className="uppercase bg-table-header">
                                        <ColumnHeader columnName={"Ledger Name"} />
                                        <ColumnHeader columnName={"Amount"} />
                                        <ColumnHeader columnName={"Balance"} />
                                    </thead>
                                    <tbody className="w-full border-collapse [&_*]:p-2 [&_*]:border [&_*]:border-gray-500">
                                        {
                                            Object.entries(data.ledger_groups)
                                                .map(([_ledger_type, ledger_group_ids], xi) => (
                                                    <Fragment key={xi}>
                                                        <tr>
                                                            <td colSpan={3} className="font-bold uppercase">{_ledger_type}</td>
                                                        </tr>
                                                        <>
                                                            {
                                                                ledger_group_ids.map((ledger_group_id, yi) => (
                                                                    <Fragment key={yi}>
                                                                        <tr>
                                                                            <td colSpan={3} className="font-bold">{MAPPED_LEDGER_GROUPS?.[ledger_group_id]?.name || ""}</td>
                                                                        </tr>
                                                                        <>
                                                                            {data.particulars?.[ledger_group_id] &&
                                                                                <>
                                                                                    {Object.entries(data.particulars[ledger_group_id])
                                                                                        .map(([ledger_id, amount], zi) => (
                                                                                            <tr key={zi}>
                                                                                                <td className="capitalize">{data?.ledgers?.[ledger_id] || ""}</td>
                                                                                                <td>{amount}</td>
                                                                                                <td></td>
                                                                                            </tr>
                                                                                        ))}
                                                                                    <tr className="font-bold">
                                                                                        <td>Total</td>
                                                                                        <td></td>
                                                                                        <td>{data.totals?.[ledger_group_id] || ""}</td>
                                                                                    </tr>
                                                                                </>
                                                                            }
                                                                        </>
                                                                    </Fragment>
                                                                ))
                                                            }
                                                        </>
                                                        <tr className="font-bold">
                                                            <td className="capitalize">Total {_ledger_type}</td>
                                                            <td></td>
                                                            <td>{data.totals?.[_ledger_type]}</td>
                                                        </tr>
                                                    </Fragment>
                                                ))}
                                        <tr className="font-bold">
                                            <td className="capitalize">Net Profit/Loss</td>
                                            <td></td>
                                            <td>{data.totals.net_profit_loss}</td>
                                        </tr>
                                    </tbody>
                                </table>
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
                    </> :
                    <>
                        {
                            searching ? <Loader /> : null
                        }
                    </>
                }
            </div>
        </>
    )
}

export default ProfitLossReport;