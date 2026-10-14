import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SearchInput, SelectInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { getOpeningBalanceReport, getWaivedOpeningBalances } from "@/services/functions/ledgers";
import { useState } from "react";

// Default to the students still attending. A year-close writes an opening
// balance for EVERY student who was in the class that year, so without a status
// the report answers "everyone who ever left owed us this", not "this is what
// we carry into the year" — at one school that was Rs 13.97 lakh of leavers
// inside a Rs 19.01 lakh total.
const searchSchema = { school: '', academic_year: '', status: 1, include_zero: false };

// `value: 0` rather than the shared OPTION_ALL's empty string: a second option
// carrying "" is what made a blank choice unselectable elsewhere, and the
// backend reads 0 as "every status".
const STATUS_FILTER_OPTIONS = [{ name: 'All statuses', value: 0 }, ...STUDENT_STATUS_OPTIONS];

function sumTotals(rows) {
    // Decimals can arrive as JSON strings; coerce before summing so the
    // total adds up instead of concatenating.
    return (rows || []).reduce((acc, item) => acc + (Number(item?.total) || 0), 0);
}

function OpeningBalanceReport() {
    const { user: { user }, fiscalYear: { years, getNameFromAcademicYear } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    searchSchema["school"] = schoolId;
    //
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [data, setData] = useState({});
    const [waived, setWaived] = useState({});
    const [summary, setSummary] = useState({});
    const [showWaived, setShowWaived] = useState(false);
    const { searching, statusHandler } = useRequestStatus();

    // The cache is keyed by the whole query, not the year alone: keying it by
    // academic_year meant switching status re-showed the previous status's rows.
    const cacheKey = `${searchInput?.academic_year}|${searchInput?.status}|${searchInput?.include_zero ? 1 : 0}`;
    const yearKey = `${searchInput?.academic_year}`;

    function onChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }

    async function searchReport(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const [_data, _waived] = await Promise.all([
            getOpeningBalanceReport(schoolId, searchInput.academic_year, searchInput.status, searchInput.include_zero),
            getWaivedOpeningBalances(schoolId, searchInput.academic_year),
        ]);
        if (_data) {
            setData(state => ({ ...state, [cacheKey]: _data }));
            setSummary(state => ({
                ...state, [cacheKey]: { total: sumTotals(_data), count: _data.length }
            }));
        }
        // A waived list is legitimately empty for most schools; store whatever
        // came back (including []) so the header can say "none" rather than
        // fall back to a previous year's figure.
        setWaived(state => ({ ...state, [yearKey]: _waived || [] }));
        statusHandler.toggleSearching();
    }

    const statusLabel = STATUS_FILTER_OPTIONS.find(
        o => String(o.value) === String(searchInput?.status)
    )?.name || "all statuses";
    const waivedRows = waived?.[yearKey] || [];
    const waivedTotal = sumTotals(waivedRows);
    const rows = data?.[cacheKey];

    return (
        <>
            <form onSubmit={searchReport}>
                <Section>
                    <SearchInput input={{ name: 'academic_year', label: "Running Academic Year", options: (years?.academicYears || []) }}
                        value={searchInput?.academic_year} onChange={onChange}
                    />
                    <SelectInput input={{ name: 'status', label: "Status", options: STATUS_FILTER_OPTIONS }}
                        value={searchInput?.status} onChange={onChange}
                    />
                    <Checkbox name="include_zero" text="Include students with no balance"
                        description={"A year-close stamps an opening balance for every student,\nincluding those who owed nothing. Off by default."}
                        checked={searchInput?.include_zero}
                        onClick={() => onChange({ name: 'include_zero', value: !searchInput?.include_zero })}
                    />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
            {
                rows ?
                    <>
                        {waivedRows.length > 0 &&
                            <Checkbox name="show_waived" inline={true}
                                text={`Waived (deleted) opening balances: ${waivedRows.length} students, ${waivedTotal.toFixed(2)}`}
                                description={"Balances staff cleared by deleting the opening-balance row.\nThe same amount still shows in the closed year it came from —\nwhich is why the two years' figures differ.\nTick to list them."}
                                checked={showWaived}
                                onClick={() => setShowWaived(v => !v)}
                            />
                        }
                        {showWaived ?
                            <BasicTable name={"Waived Opening Balances"} data={waivedRows}
                                columns={[
                                    ['student_name', 'student name'], ['classname', 'class'],
                                    ['status'], ['total'], ['waived_on', 'waived on'], ['remarks']
                                ]} header={
                                    <div className="flex flex-col gap-y-1 font-semibold my-1">
                                        <span className="text-base">
                                            Academic Year : {getNameFromAcademicYear(searchInput?.academic_year)}
                                        </span>
                                        <span className="text-base">
                                            Waived : {waivedRows.length} students
                                        </span>
                                        <span className="text-base">
                                            Total : {waivedTotal.toFixed(2)}
                                        </span>
                                    </div>
                                } allowExport={true} print={true} showSelected={false} onSelect={() => null} />
                            :
                            <BasicTable name={"Opening Balance Report"} data={rows}
                                columns={[
                                    ['student_name', 'student name'], ['classname', 'class'],
                                    ['status'], ['total']
                                ]} header={
                                    <div className="flex flex-col gap-y-1 font-semibold my-1">
                                        <span className="text-base">
                                            Academic Year : {getNameFromAcademicYear(searchInput?.academic_year)}
                                        </span>
                                        <span className="text-base">
                                            Students : {summary?.[cacheKey]?.count ?? 0} ({statusLabel})
                                        </span>
                                        <span className="text-base">
                                            Total : {(summary?.[cacheKey]?.total ?? 0).toFixed(2)}
                                        </span>
                                    </div>
                                } allowExport={true} print={true} showSelected={false} onSelect={() => null} />
                        }
                    </> :
                    <>
                        {
                            searching ? <Loader /> : <NotFound />
                        }
                    </>
            }
        </>
    )
}

export default OpeningBalanceReport;
