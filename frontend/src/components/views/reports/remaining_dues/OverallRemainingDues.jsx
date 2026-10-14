import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import Warning from "@/components/Warning";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import ClosedAcademicYearSelectInput from "@/components/inputs/ClosedAcademicYearSelectInput";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import safeDecimal from "@/methods/safeDecimal";
import { __search } from "@/services/functions";
import { Button } from "@material-tailwind/react";
import { useEffect, useRef, useState } from "react";

const STATUS_RUNNING = "1";
const searchInputSchema = { school: "", academic_year: "", from: "", to: "", status: STATUS_RUNNING };
function OverallRemainingDues() {
    const { status: { setupDone }, user: { user },
        fiscalYear: { year, years, getAcademicYearObject },
        class: { classesBackup: classes },
        notification: { updateNotification } } = useAppContext();
    searchInputSchema["school"] = user?.profile?.school || user?.profile?.id;
    // academic_year is prefilled once via the mount effect below — do not bind
    // module-level schema to the live global fiscal year context.
    searchInputSchema["to"] = user?.today;
    const [searchInput, setSearchInput] = useState({ ...searchInputSchema });
    const prefilled = useRef(false);
    const [dues, setDues] = useState([]); // actually classwise trial balance!
    const [totalBalance, setTotalBalance] = useState(0);
    const { searching, statusHandler } = useRequestStatus();
    // 
    function onReset() {
        setSearchInput({ ...searchInputSchema });
    }
    function onChange({ name, value }) {
        if (["academic_year", "closed_academic_year"].includes(name)) {
            /* set user selected academic year's date */
            const ayObj = getAcademicYearObject(value) || {};
            const updatedInput = {
                ...searchInput,
                academic_year: value,
                from: ayObj?.start_date || "",
                to: (name === "closed_academic_year") ? (ayObj?.end_date || "") : user?.today,
            };
            setSearchInput(updatedInput);
            return;
        }
        setSearchInput(state => ({ ...state, [name]: value }));
    }
    async function searchData(input = null) {
        statusHandler.toggleSearching();
        let [status, message, data] = await __search("/api/dues", input || searchInput);
        updateNotification(status, message);
        let _tb = 0, _td = 0, _tc = 0;
        const response = (data && data.constructor === Object) ? data : {};
        const taken = new Set();
        function addRow(acc, classname, item) {
            const debit_amount = Number(item?.debit_amount) || 0;
            const credit_amount = Number(item?.credit_amount) || 0;
            const balance = safeDecimal(debit_amount - credit_amount);
            _td += debit_amount;
            _tc += credit_amount;
            _tb += balance;
            acc.push({ classname, debit_amount, credit_amount, balance });
        }
        // the school's own class order first...
        data = (classes || []).reduce((acc, cls) => {
            const [classname, { id },] = cls;
            const item = response?.[id];
            if (item) {
                taken.add(String(id));
                addRow(acc, classname, item);
            }
            return acc;
        }, []);
        /* ...then anything the aggregation found that the class list could not
         * name — a class deactivated since, or a list that had not finished
         * loading. Those dues used to vanish from the rows AND the Total while
         * Overall Student Ledgers still counted the same students, so the two
         * reports disagreed with nothing on screen to say why. */
        Object.entries(response).forEach(([id, item]) => {
            if (taken.has(String(id))) return;
            addRow(data, item?.classname || `Class #${id}`, item);
        });
        if (data.length > 0) {
            data.push({ classname: "Total", debit_amount: safeDecimal(_td), credit_amount: safeDecimal(_tc), balance: safeDecimal(_tb) });
        }
        setDues(data);
        setTotalBalance(_tb);
        statusHandler.toggleSearching();
    }
    async function onSearch(e) {
        e.preventDefault();
        // Backfill missing date bounds with (academic-year start, today) so
        // hitting Search without touching dates still scopes the report.
        const ayStart = getAcademicYearObject(searchInput?.academic_year)?.start_date || '';
        const fromDate = searchInput?.from || ayStart;
        const toDate = searchInput?.to || user?.today || '';
        await searchData({ ...searchInput, from: fromDate, to: toDate });
    }
    //
    useEffect(() => {
        /* one-time prefill from global fiscal year. Subsequent changes to the
         * header fiscal-year dropdown must NOT silently re-run this report —
         * the user explicitly drives reports from the form.
         * `classes` is loaded AFTER setupDone is raised, so the opening search
         * waits for it: without the class list this report had no rows to build
         * and opened on an empty table.
         */
        if (!setupDone || !year?.academic_year || prefilled.current) return;
        if (!(classes?.length > 0)) return;
        prefilled.current = true;
        const ayObj = getAcademicYearObject(year.academic_year) || {};
        const updatedInput = {
            ...searchInput,
            academic_year: searchInput?.academic_year || year.academic_year,
            from: searchInput?.from || ayObj?.start_date || "",
            to: searchInput?.to || user?.today || "",
        };
        setSearchInput(updatedInput);
        (async () => {
            await searchData(updatedInput);
        })();
    }, [setupDone, year?.academic_year, classes?.length]);
    return (
        <>
            <Warning warning={"Select running academic year or closed academic year"} />
            <form onSubmit={onSearch} className="my-2">
                <Section>
                    <SelectInput value={searchInput?.status} input={{ name: 'status', label: "Status", options: STUDENT_STATUS_OPTIONS }}
                        onChange={onChange} />
                    <>
                        <SelectInput input={{
                            name: 'academic_year', label: "Running Academic year",
                            options: (years?.academicYears || [])
                        }} value={searchInput?.academic_year || ''} onChange={onChange} />
                        <ClosedAcademicYearSelectInput value={searchInput?.academic_year || ''} onChange={onChange} />
                        <TextInput input={{ name: 'from', label: "From (BS)" }} value={searchInput?.from} onChange={onChange} />
                        <TextInput input={{ name: 'to', label: "To (BS)" }} value={searchInput?.to} onChange={onChange} />
                    </>
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                    <FormSaveButton isSearch={true} searching={searching} disabled={searching || !searchInput?.academic_year} />
                </ButtonsSecion>
            </form>
            <>
                {
                    searching ? <Loader /> :
                        <>
                            {dues?.length > 0 ?
                                <BasicTable name={"Overall remaining dues"} columns={[
                                    ['classname'],
                                    ['debit_amount', 'debit'],
                                    ['credit_amount', 'credit'],
                                    ['balance'],
                                ]} data={dues} onSelect={() => null}
                                    showSelected={false} print={true} allowExport highLightLast={true} /> :
                                <NotFound />
                            }
                        </>
                }
            </>
        </>
    )
}

export default OverallRemainingDues;