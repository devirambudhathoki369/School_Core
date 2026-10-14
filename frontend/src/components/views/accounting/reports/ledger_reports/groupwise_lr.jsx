import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __search } from "@/services/functions";
import { useEffect, useState } from "react";
import BasicTable from "@/components/tables/BasicTable";
import { getTransactionTypeForReport } from "../methods";
import { LEDGER_GROUPS_OPTIONS, MAPPED_LEDGER_GROUPS } from "../../ledger_groups";
import Checkbox from "@/components/inputs/Checkbox";
/* 
1. Replace ledgers input with ledger_group!
*/

const searchSchema = { school: '', economic_year: '', ledger_group: [], start_date: '', end_date: '' };
const optionsSchema = { default: true, withLedger: false, withSubgroupLedger: false };
// 
function GroupwiseLedgerReport() {
    const { user: { user }, fiscalYear: { year, years, mappedYears, getCurrentAccountingEconomicYear },
        notification: { updateNotification } } = useAppContext();
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [data, setData] = useState({});
    const [generatedBackup, setGeneratedBackup] = useState([]); // generated data backup!
    const [options, setOptions] = useState({ ...optionsSchema });
    const { searching, statusHandler } = useRequestStatus();

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
    function onOptionsChange({ name, value }) {
        setOptions(state => ({ ...state, [name]: value }));
    }

    // FROM ledgera_groups > BALANCE_TYPES!
    const DEBIT = 1, CREDIT = 2;
    function formatReportData(data) {
        if (!data?.length) return [];

        const group = searchInput.ledger_group.reduce((acc, ledgerGroup) => {
            acc[ledgerGroup] = {
                ledger_str: MAPPED_LEDGER_GROUPS?.[ledgerGroup]?.name || "",
                highlight: false,
                opening: 0, debit: 0, credit: 0,
                //
                ledgers: {},
            };
            return acc;
        }, {});
        /**
         * for each item/entry in data/entries!
         * group by ledger_group_id and sumup!
         */
        data.forEach((tsx) => {
            let _type = getTransactionTypeForReport(tsx, false);
            const amt = tsx?.amount || 0;
            const mainGroup = group?.[tsx.ledger_group];
            // rows carrying `balance_type` are the synthetic opening-balance
            // rows the backend prepends -- they are a starting position, not a
            // transaction, so they never count towards debit/credit turnover.
            const openingSigned = tsx?.balance_type === CREDIT ? -amt
                : tsx?.balance_type === DEBIT ? amt : null;

            if (mainGroup) {
                //
                if (searchInput.ledger_group.includes(tsx.ledger_group)) {
                    if (openingSigned === null) {
                        if (_type === DEBIT) mainGroup.debit += amt;
                        else if (_type === CREDIT) mainGroup.credit += amt;
                    } else {
                        mainGroup.opening += openingSigned;
                    }
                    //
                    const ledgerEntry = mainGroup.ledgers?.[tsx.ledger];
                    if (ledgerEntry) {
                        // If found with ledger-id, do sum!
                        if (openingSigned === null) {
                            ledgerEntry.debit += (_type === DEBIT ? amt : 0);
                            ledgerEntry.credit += (_type === CREDIT ? amt : 0);
                        } else {
                            ledgerEntry.opening += openingSigned;
                        }
                    } else {
                        // New entry with ledger-id!
                        mainGroup.ledgers[tsx.ledger] = {
                            ledger_str: tsx.ledger_str,
                            opening: openingSigned || 0,
                            debit: (openingSigned === null && _type === DEBIT ? amt : 0),
                            credit: (openingSigned === null && _type === CREDIT ? amt : 0),
                            sub: true,
                        };
                    }
                } else {
                    const existing = mainGroup.ledgers?.[tsx.ledger];
                    if (existing && openingSigned === null) {
                        // sum
                        existing.debit += (_type === DEBIT ? amt : 0);
                        existing.credit += (_type === CREDIT ? amt : 0);
                    }
                }
            }
        });
        data = Object.values(group);
        setGeneratedBackup(data);
        if (options.withLedger === true) {
            data = flatOnWithLedgers(data);
        }
        //
        const summary = {};
        //
        return { data: formatRows(data), summary };
    }

    // rows are summed as floats; round only on the way out so the table never
    // shows binary-float noise like 33794190.769999996.
    function round2(n) {
        return (Number(n) || 0).toFixed(2);
    }
    // opening/closing are signed: +ve sits on the debit side, -ve on the credit
    // side. A payable and a receivable can both live in one report, so the side
    // has to be spelled out rather than implied by the column.
    function withSide(n) {
        const v = Number(n) || 0;
        if (!v) return "0.00";
        return `${Math.abs(v).toFixed(2)} ${v > 0 ? "Dr" : "Cr"}`;
    }
    function formatRows(rows) {
        return rows.map(row => ({
            ...row,
            opening: withSide(row.opening),
            debit: round2(row.debit),
            credit: round2(row.credit),
            closing: withSide((Number(row.opening) || 0) + (Number(row.debit) || 0) - (Number(row.credit) || 0)),
        }));
    }

    function flatOnWithLedgers(data) {
        // data: generatedBackup
        const flat = [];
        data.forEach(group => {
            flat.push({
                ledger_str: group.ledger_str,
                opening: group.opening,
                debit: group.debit,
                credit: group.credit,
                highlight: true,
            });

            if (group.ledgers && typeof group.ledgers === 'object') {
                Object.values(group.ledgers).forEach(ledger => {
                    flat.push(ledger);
                });
            }
        });
        return flat;
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        // 
        const [status, msg, _data] = await __search("/accounting/reports/ledger_report", {
            ...searchInput,
        });
        updateNotification(status, msg);
        if (_data) {
            if (_data?.length < 1) {
                updateNotification(404, "Not found!");
                statusHandler.toggleSearching();
                return;
            }
            setData(formatReportData(_data));
        }
        statusHandler.toggleSearching();
    }

    function allowSearch() {
        return (searchInput?.school && searchInput?.economic_year &&
            searchInput?.ledger_group?.length > 0 && searchInput?.start_date && searchInput?.end_date);
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
        // change table format on options.withLedger;
        if (options.withLedger === true) {
            const withLedgers = flatOnWithLedgers(generatedBackup);
            setData(state => ({ ...state, data: formatRows(withLedgers) }));
        } else {
            setData(state => ({ ...state, data: formatRows(generatedBackup) }));
        }
    }, [options.withLedger]);
    // 
    return (
        <>
            <form onSubmit={onSearch}>
                <Section>
                    <SelectInput input={{ name: 'economic_year', label: "Fiscal Year", options: years?.allAccountingEconomicYears || [] }}
                        value={searchInput?.economic_year} onChange={onYearChange} />
                    <TextInput input={{ name: 'start_date', label: "Date (From)" }} value={searchInput?.start_date} onChange={onChange} />
                    <TextInput input={{ name: 'end_date', label: "Date (To)" }} value={searchInput?.end_date} onChange={onChange} />
                    <SearchInput input={{ name: 'ledger_group', label: "Ledger Group", options: LEDGER_GROUPS_OPTIONS }}
                        multiSelect={true} value={searchInput?.ledger_group} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} disabled={!allowSearch()} />
                </ButtonsSecion>
            </form>
            <>
                <Section title={"Filters"}>
                    <Checkbox name={"withLedger"} text={"With Ledger"} checked={options.withLedger}
                        onClick={() => onOptionsChange({ name: "withLedger", value: !options.withLedger })} />
                </Section>
            </>
            <>
                {data?.data?.length > 0 &&
                    <BasicTable name={"Groupwise Ledger Report"} data={data.data} columns={[
                        ["ledger_str", "Particular"],
                        ["opening", "Opening Balance"], ["debit"], ["credit"], ["closing", "Closing Balance"]
                    ]} hideHeader={true} loading={searching} header={
                        <div className="flex justify-between items-center my-2">
                            <div>
                                <span className="text-base font-semibold text-black">
                                    Name : {
                                        searchInput.ledger_group
                                            .map(e => MAPPED_LEDGER_GROUPS?.[e]?.name)
                                            .join(",  ")
                                    }
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
                    } onSelect={() => null} print={true} allowExport showSelected={false} />
                }
            </>
        </>
    )
}

export default GroupwiseLedgerReport;