import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __search } from "@/services/functions";
import { useEffect, useState } from "react";
import BasicTable from "@/components/tables/BasicTable";
import { customParseFloat } from "../../methods";
import { getTransactionTypeForReport } from "../methods";
import { customAction } from "@/components/tables/actions";
import VoucherDetailModal from "./VoucherDetailModal";

const searchSchema = { school: '', economic_year: '', ledger: '', start_date: '', end_date: '' };
const SHOW_MORE_ACTION = customAction({
    text: "Show more", action: "show_more",
    tooltip: "Show the full voucher behind this line",
});
const ledger_groups = [];
function IndividualLedgerReport() {
    const { user: { user }, fiscalYear: { year, years, mappedYears, getCurrentAccountingEconomicYear },
        notification: { updateNotification } } = useAppContext();
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [majorLedgers, setMajorLedgers] = useState([]);
    const [mappedLedgers, setMappedLedgers] = useState({});
    const [data, setData] = useState({});
    // Row whose source voucher is open in the "Show more" modal.
    const [detailRow, setDetailRow] = useState(null);
    const { searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }
    function onYearChange({ value }) {
        const ey = mappedYears?.allAccountingEconomicYears?.[value];
        setSearchInput(state => ({
            ...state, economic_year: value, ledger: '',
            start_date: ey?.start_date || state.start_date,
            end_date: ey?.end_date || user?.today || state.end_date,
        }));
    }

    // FROM ledger_groups > BALANCE_TYPES!
    const DEBIT = 1, CREDIT = 2,
        BLC_TYPES = { [DEBIT]: "Dr.", [CREDIT]: "Cr." };
    function formatReportData(data) {
        let balance = 0;
        // 
        if (data && data?.length > 0) {
            let opening_blc = balance, dr_total = 0, cr_total = 0;
            data = data.reduce((acc, ledger) => {
                let _balance_type = ledger?.balance_type,
                    _type = getTransactionTypeForReport(ledger),
                    amount = ledger?.amount || ledger?.display_amount || 0;
                // only the synthetic opening-balance row carries `balance_type`;
                // it seeds the running balance and IS the opening balance.
                if (_balance_type === CREDIT) balance = opening_blc = -(amount);
                else if (_balance_type === DEBIT) balance = opening_blc = amount;
                //
                if (_type === DEBIT) {
                    balance += amount;
                    dr_total += amount;
                } else if (_type === CREDIT) {
                    balance -= amount;
                    cr_total += amount;
                }
                // 
                acc.push({
                    ...ledger,
                    type: BLC_TYPES?.[_type] || "",
                    debit: _type === 1 ? customParseFloat(amount) : "0.00",
                    credit: _type === 2 ? customParseFloat(amount) : "0.00",
                    balance: customParseFloat(balance) || "0.00",
                });
                return acc;
            }, []);
            const summary = {
                opening_blc: customParseFloat(opening_blc) || "0.00",
                closing_blc: customParseFloat(balance) || "0.00",
                dr_total: customParseFloat(dr_total) || "0.00",
                cr_total: customParseFloat(cr_total) || "0.00",
            };
            return { data, summary };
        }
        return [];
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        // 
        const ledger_group = mappedLedgers?.[searchInput.ledger]?.ledger_group;
        const [status, msg, _data] = await __search("/accounting/reports/ledger_report", {
            ...searchInput,
            ledger_group,
        });
        updateNotification(status, msg);
        if (_data) {
            setData(formatReportData(_data));
        } else {
            setData({});
        }
        statusHandler.toggleSearching();
    }

    // Opens the voucher a report line came from, so "Masaland 500" can be read
    // back to the particulars and remarks that produced it.
    function onRowAction(action, id, row) {
        if (action !== SHOW_MORE_ACTION.action) return;
        if (!row?.entry_id) {
            updateNotification(400, "This row has no voucher behind it!");
            return;
        }
        setDetailRow(row);
    }

    function allowSearch() {
        return (searchInput?.school && searchInput?.economic_year &&
            searchInput?.ledger && searchInput?.start_date && searchInput?.end_date);
    }

    async function getLedgerOptions() {
        // statusHandler.toggleSearching();
        const schoolId = user?.profile?.school || user?.profile?.id;
        const [, , ledgers] = await __search("/accounting/search/ledgers", {
            school: schoolId,
            economic_year: searchInput.economic_year,
            ledger_groups,
            as_options: true,
            include_balance: true,
        });
        if (ledgers) {
            setMajorLedgers(ledgers);
            setMappedLedgers(ledgers.reduce((acc, led) => {
                acc[led.value] = led;
                return acc;
            }, {}));
        } else {
            updateNotification(404, "Ledgers Not found! Create them first!");
        }
        // statusHandler.toggleSearching();
    }

    useEffect(() => {
        if (searchInput?.economic_year) {
            (async () => {
                await getLedgerOptions();
            })();
        }
    }, [searchInput?.economic_year]);
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
                    <SearchInput input={{ name: 'ledger', label: "Ledger", options: majorLedgers }} value={searchInput?.ledger} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} disabled={!allowSearch()} />
                </ButtonsSecion>
            </form>
            <>
                {data?.data?.length > 0 &&
                    <BasicTable name={"Individual Ledger Report"} data={data.data} columns={[
                        ["date"], ["type"], ["voucher_id", "Voucher No."], ["ledger_str", "Particular"],
                        ["narration", "Narration"], ["debit"], ["credit"], ["balance", "Balance Amount"],
                    ]} hideHeader={true} loading={searching} header={
                        <div className="flex justify-between items-center my-2">
                            <div>
                                <span className="text-base font-semibold text-black">
                                    Name : {mappedLedgers?.[searchInput?.ledger]?.name || ""}
                                </span>
                            </div>
                            <div>
                                <span className="text-base font-semibold text-black">
                                    Date From : {searchInput?.start_date}, &nbsp;
                                    To : {searchInput?.end_date}
                                </span>
                            </div>
                            <div>
                                <span className="text-base font-semibold text-black">Date : {user?.today}</span>
                            </div>
                        </div>
                    } footer={
                        <table className="w-full text-left font-semibold text-black">
                            <tbody>
                                <tr>
                                    <td colSpan={12} className="text-center py-2">
                                        TRANSACTION SUMMARY
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-1">DR. ENTRIES</td>
                                    <td>{data.summary.dr_total}</td>
                                    <td>OPENING BALANCE</td>
                                    <td>{data.summary.opening_blc}</td>
                                </tr>
                                <tr>
                                    <td className="py-1">CR. ENTRIES</td>
                                    <td>{data.summary.cr_total}</td>
                                    <td>CLOSING BALANCE</td>
                                    <td>{data.summary.closing_blc}</td>
                                </tr>
                            </tbody>
                        </table>
                    } actions={[SHOW_MORE_ACTION]} onSelect={onRowAction}
                        print={true} allowExport showSelected={false} />
                }
            </>
            <VoucherDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
        </>
    )
}



export default IndividualLedgerReport;