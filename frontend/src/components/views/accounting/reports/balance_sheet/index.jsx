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
import { LEDGER_GROUP_CATEGORIES, MAPPED_LEDGER_GROUPS } from "../../ledger_groups";
import { useReactToPrint } from "react-to-print";
import { BALANCE_SHEET_GROUP_CATEGORIES, SIGNED_LEDGER_GROUPS } from "./config";
import Checkbox from "@/components/inputs/Checkbox";
import { customParseFloat, equitySideParseFloat } from "@/components/views/accounting/methods";
import getCurrentDateTime from "@/methods/getCurrentDateTime";

const searchSchema = { school: '', economic_year: '', start_date: '', end_date: '' };
const filtersSchema = { show_ledgers: false };
function BalanceSheetReport() {
    const { user: { user }, fiscalYear: { year, years, mappedYears, getCurrentAccountingEconomicYear },
        notification: { updateNotification } } = useAppContext();
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [filters, setFilters] = useState({ ...filtersSchema });
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
        const [status, msg, _data] = await __search("/accounting/reports/balance_sheet", searchInput);
        updateNotification(status, msg);
        if (_data) {
            setData(_data);
            setGeneratedTime(getCurrentDateTime());
        } else {
            setGeneratedTime('');
            setData(_data);
        }
        statusHandler.toggleSearching();
    }
    // WHY THE TWO SIDES DISAGREE, IN WORDS.
    //
    // The sheet is NOT plugged to make it tie -- an invented balancing figure
    // buries a real hole. Instead the API returns the gap split into the only
    // two things that can cause it, and this turns that into a sentence the
    // school's accountant can act on. Silence here is what made a data problem
    // read as a broken report.
    function differenceReason(difference) {
        const opening = Math.abs(parseFloat(difference?.opening) || 0) >= 0.01;
        const vouchers = Math.abs(parseFloat(difference?.vouchers) || 0) >= 0.01;
        if (opening && vouchers) return "opening balances and vouchers do not tie";
        if (vouchers) return "some vouchers are posted one-sided";
        if (opening) return "the opening balances do not tie";
        return "";
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
                    {/* A balance sheet is AS-AT a date, not over a range. The From
                        box used to be editable and silently produced nonsense:
                        the opening balances are the whole year's, so a later
                        From kept them while dropping the movements before it.
                        start_date is still sent (and pinned to the fiscal year
                        by the API) so the payload shape is unchanged. */}
                    <TextInput input={{ name: 'end_date', label: "As at Date" }} value={searchInput?.end_date} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} disabled={!allowSearch()} />
                </ButtonsSecion>
            </form>
            <div className="my-2">
                {searching ?
                    <Loader /> :
                    data?.particulars ?
                        <>
                            <>
                                <Section>
                                    <Checkbox checked={filters?.show_ledgers} name={"show_ledgers"} text={"Show Ledgers"}
                                        onClick={() => {
                                            setFilters(state => ({ ...state, show_ledgers: !state.show_ledgers }));
                                        }} />
                                </Section>
                            </>
                            <ReportActionBar onPrint={printReport} reportRef={reportRef}
                                exportName={"Balance Sheet"}
                                exportTitles={[`As at ${searchInput.end_date}`]} />
                            <div ref={reportRef} className="rounded-md my-2">
                                <ReportHeader />
                                <div className="flex flex-col gap-y-2 text-center font-bold children-text-base px-5">
                                    <span className="!text-2xl">Balance Sheet</span>
                                    <span>As at {searchInput.end_date}</span>
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
                                                <ColumnHeader columnName={"Liabilities"} />
                                                <ColumnHeader columnName={"Amount"} />
                                                <ColumnHeader columnName={"Amount"} />
                                                {/* <th className="w-8"></th> */}
                                                <ColumnHeader columnName={"Assets"} />
                                                <ColumnHeader columnName={"Amount"} />
                                                <ColumnHeader columnName={"Amount"} />
                                            </tr>
                                        </thead>
                                        <tbody className="w-full border-collapse [&_*]:p-2 [&_*]:border [&_*]:border-gray-500">
                                            <>
                                                {
                                                    (() => {
                                                        // --- EQUITIES & LIABILITIES
                                                        const equityRows = (BALANCE_SHEET_GROUP_CATEGORIES?.[LEDGER_GROUP_CATEGORIES.EQUITY.name] || [])
                                                            .map((ledger_group_id, _) => ({
                                                                ledger_group_id,
                                                                name: MAPPED_LEDGER_GROUPS?.[ledger_group_id]?.name || "-",
                                                                amount: data.totals?.[ledger_group_id] || "0.00",
                                                                ledgers: data.particulars?.[ledger_group_id] || {},
                                                            }));
                                                        const liabilityRows = (BALANCE_SHEET_GROUP_CATEGORIES?.[LEDGER_GROUP_CATEGORIES.LIABILITY.name] || [])
                                                            .map((ledger_group_id, _) => ({
                                                                ledger_group_id,
                                                                name: MAPPED_LEDGER_GROUPS?.[ledger_group_id]?.name || "-",
                                                                amount: data.totals?.[ledger_group_id] || "0.00",
                                                                ledgers: data.particulars?.[ledger_group_id] || {},
                                                                signed: SIGNED_LEDGER_GROUPS.has(ledger_group_id),
                                                            }));
                                                        // --- Insert profitLossRow at index 3;
                                                        // `signed`: this row alone keeps its sign when rendered,
                                                        // so a loss cannot look like a profit. See methods.js.
                                                        const leftRows = [...equityRows, ...liabilityRows];
                                                        leftRows.splice(3, 0, { ...(data?.profit_loss || {}), signed: true });
                                                        // --- ASSETS
                                                        const rightRows = (BALANCE_SHEET_GROUP_CATEGORIES?.[LEDGER_GROUP_CATEGORIES.ASSET.name] || [])
                                                            .map((ledger_group_id, _) => ({
                                                                ledger_group_id,
                                                                name: MAPPED_LEDGER_GROUPS?.[ledger_group_id]?.name || "-",
                                                                amount: data.totals?.[ledger_group_id] || "0.00",
                                                                ledgers: data.particulars?.[ledger_group_id] || {},
                                                            }));
                                                        const maxRows = Math.max(leftRows.length, rightRows.length);
                                                        // 
                                                        // 
                                                        return (
                                                            <>
                                                                {Array.from({ length: maxRows }).map((_, idx) => (
                                                                    <Fragment key={idx}>
                                                                        <tr>
                                                                            <td className="w-max font-semibold whitespace-nowrap">{leftRows[idx]?.name || ""}</td>
                                                                            <td></td>
                                                                            <td className="font-bold">{
                                                                (leftRows[idx]?.signed
                                                                    ? equitySideParseFloat(leftRows[idx]?.amount)
                                                                    : customParseFloat(leftRows[idx]?.amount)) || ""
                                                            }</td>
                                                                            {/*  */}
                                                                            <td className="w-max font-semibold whitespace-nowrap">{rightRows[idx]?.name || ""}</td>
                                                                            <td></td>
                                                                            <td className="font-bold">{customParseFloat(rightRows[idx]?.amount) || ""}</td>
                                                                        </tr>
                                                                        <>
                                                                            {filters.show_ledgers && leftRows[idx]?.ledgers && Object.keys(leftRows[idx].ledgers).length > 0 &&
                                                                                (
                                                                                    Object.entries(leftRows[idx].ledgers).map(([ledgerId, amount]) => (
                                                                                        <tr key={`left-ledger-${idx}-${ledgerId}`}>
                                                                                            <td className="!pl-6 font-semibold">{data.ledgers?.[ledgerId] || ledgerId}</td>
                                                                                            <td>{customParseFloat(amount)}</td>
                                                                                            <td></td>
                                                                                            <td></td>
                                                                                            <td></td>
                                                                                            <td></td>
                                                                                        </tr>
                                                                                    ))
                                                                                )}
                                                                            {filters.show_ledgers && rightRows[idx]?.ledgers && Object.keys(rightRows[idx].ledgers).length > 0 &&
                                                                                (
                                                                                    Object.entries(rightRows[idx].ledgers).map(([ledgerId, amount]) => (
                                                                                        <tr key={`right-ledger-${idx}-${ledgerId}`}>
                                                                                            <td></td>
                                                                                            <td></td>
                                                                                            <td></td>
                                                                                            <td className="!pl-6 font-semibold">{data.ledgers?.[ledgerId] || ledgerId}</td>
                                                                                            <td>{customParseFloat(amount)}</td>
                                                                                            <td></td>
                                                                                        </tr>
                                                                                    ))
                                                                                )}
                                                                        </>
                                                                    </Fragment>
                                                                ))}
                                                            </>
                                                        );
                                                    })()
                                                }
                                            </>
                                        </tbody>
                                        <tfoot className="p-5 border-t border-black">
                                            <tr className="font-bold">
                                                <td colSpan={2}>Total Equity and Liabilities</td>
                                                <td>
                                                    {
                                                        Math.abs(
                                                            (
                                                                (parseFloat(data.totals?.equities) || 0) +
                                                                (parseFloat(data.totals?.liabilities) || 0)
                                                            ).toFixed(2)
                                                        )
                                                    }
                                                </td>
                                                <td colSpan={2}>Total Assets</td>
                                                <td>
                                                    {
                                                        Math.abs(
                                                            (
                                                                parseFloat(data.totals?.assets) || 0)
                                                                .toFixed(2)
                                                        )
                                                    }
                                                </td>
                                            </tr>
                                            {Math.abs(parseFloat(data.difference?.amount) || 0) >= 0.01 && (
                                                <tr className="font-bold text-red-700">
                                                    <td colSpan={2}>
                                                        Difference — {differenceReason(data.difference)}
                                                    </td>
                                                    <td colSpan={4}>
                                                        {Math.abs(parseFloat(data.difference?.amount) || 0).toFixed(2)}
                                                    </td>
                                                </tr>
                                            )}
                                        </tfoot>
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
                        </> : null
                }
            </div>
        </>
    )
}

export default BalanceSheetReport;