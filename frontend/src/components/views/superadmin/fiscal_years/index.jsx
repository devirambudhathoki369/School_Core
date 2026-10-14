import { useEffect, useMemo, useState } from "react";
import { Button, Tab, TabPanel, Tabs, TabsBody, TabsHeader } from "@material-tailwind/react";

import { useAppContext } from "@/contexts/AppContext";
import { SearchInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import BasicTable from "@/components/tables/BasicTable";
import AttentionBox from "@/components/AttentionBox";
import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";

import { fetchSchools } from "@/services/functions/schools";
import { getAcademicYears, saveAcademicYear } from "@/services/functions/fiscalYear";
import {
    getAccountingEconomicYears,
    saveAccountingEconomicYear,
} from "@/services/functions/accounting/accounting_economic_year";
import { academicYearValidationSchema } from "@/schemas/validations/fiscal-year";
import { accountingEconomicYearValidationSchema } from "@/schemas/accounting/validations/accountingEconomicYear";

/**
 * Fiscal-year setup for a school — the superadmin side of it.
 *
 * Schools no longer add their own academic or accounting years. They move into
 * the next one by CLOSING the running one, which creates the year and carries
 * the balances into it in a single transaction; everything else lands here.
 *
 * That is the whole point of the screen: a year typed by hand is not wired to
 * anything. It is not mapped to a class-group, it holds no opening balances,
 * and it is indistinguishable in a dropdown from the real one beside it — so
 * the school picks it, files a term of work under it, and the repair is a
 * database job. Both lists below therefore show OPEN AND CLOSED years: seeing
 * that `SCHOOL 2083` already exists is what stops the second one being made.
 */

const TABS = {
    academic: "academic",
    accounting: "accounting",
};

const emptyYear = { name: '', start_date: '', end_date: '' };

function SchoolFiscalYears() {
    const [schools, setSchools] = useState([]);
    const [school, setSchool] = useState('');

    useEffect(() => {
        (async () => {
            const data = await fetchSchools({}, true);
            setSchools(Array.isArray(data) ? data : []);
        })();
    }, []);

    return (
        <>
            <AttentionBox title={NOTE.title} description={NOTE.description}
                dismissable={false} />
            <Section title={"School"} grid>
                <SearchInput input={{ name: 'school', label: 'School', options: schools }}
                    value={school} onChange={({ value }) => setSchool(value)} />
            </Section>
            {!school ?
                <NotFound error="Choose a school to see and set up its years." /> :
                <Tabs value={TABS.academic} key={school}>
                    <TabsHeader className="border-b-2 border-blue-gray-50 p-0 bg-transparent"
                        indicatorProps={{
                            className: "bg-transparent border-b-2 border-gray-900 shadow-none rounded-none",
                        }}>
                        <Tab className="bg-table-header font-semibold" value={TABS.academic}>
                            Academic Years
                        </Tab>
                        <Tab className="bg-table-header font-semibold" value={TABS.accounting}>
                            Accounting Economic Years
                        </Tab>
                    </TabsHeader>
                    <TabsBody>
                        <div>
                            <TabPanel value={TABS.academic}>
                                <YearSetup
                                    school={school}
                                    label="Academic year"
                                    tableName="Academic Years"
                                    namePlaceholder="SCHOOL 20XX"
                                    getYears={getAcademicYears}
                                    saveYear={saveAcademicYear}
                                    validationSchema={academicYearValidationSchema}
                                />
                            </TabPanel>
                            <TabPanel value={TABS.accounting}>
                                <YearSetup
                                    school={school}
                                    label="Accounting economic year"
                                    tableName="Accounting Economic Years"
                                    namePlaceholder="AFY 20XX/0XX"
                                    getYears={getAccountingEconomicYears}
                                    saveYear={saveAccountingEconomicYear}
                                    validationSchema={accountingEconomicYearValidationSchema}
                                />
                            </TabPanel>
                        </div>
                    </TabsBody>
                </Tabs>
            }
        </>
    )
}

/**
 * One school's years of one kind: the list first, then the form.
 *
 * List above form on purpose — the mistake this screen exists to prevent is
 * creating a year that is already there, and you cannot avoid it if you have to
 * scroll past your own typing to check.
 */
function YearSetup({ school, label, tableName, namePlaceholder,
    getYears, saveYear, validationSchema }) {
    const { notification: { updateNotification } } = useAppContext();

    const [years, setYears] = useState([]);
    const [fetching, setFetching] = useState(true);
    const [year, setYear] = useState({ ...emptyYear });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    async function load() {
        setFetching(true);
        // 'all' — closed years count as taken names too.
        const data = await getYears(school, '', 'all');
        setYears(Array.isArray(data) ? data : []);
        setFetching(false);
    }

    useEffect(() => { load(); }, [school]);

    function onChange({ name, value }) {
        setYear(state => ({ ...state, [name]: value }));
    }

    async function onBlur({ name, value }) {
        try {
            await validationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...rest }) => rest);
        } catch ({ message }) {
            setErrors(errs => ({ ...errs, [name]: message }));
        }
    }

    function reset() {
        setYear({ ...emptyYear });
        setErrors({});
    }

    // Same-name check in the browser as well as on the server. The server is
    // the one that counts; this one is here so the operator is told before
    // submitting rather than after.
    const duplicate = useMemo(() => {
        const wanted = normalizeName(year?.name);
        if (!wanted) return null;
        return years.find(y => normalizeName(y?.name) === wanted) || null;
    }, [year?.name, years]);

    async function onSubmit(e) {
        e.preventDefault();
        if (saving) return;
        if (duplicate) {
            updateNotification(400, `'${duplicate.name}' already exists for this school.`);
            return;
        }
        setSaving(true);
        try {
            await validationSchema.validate(year);
            const [status, message] = await saveYear({ ...year, school });
            updateNotification(status, message);
            if (status === 200) {
                reset();
                await load();
            }
        } catch ({ message }) {
            updateNotification(400, message);
        }
        setSaving(false);
    }

    const incomplete = !year?.name || !year?.start_date || !year?.end_date;

    return (
        <>
            {fetching ? <Loader /> :
                <BasicTable name={tableName} data={years} columns={[
                    ['name'],
                    ['start_date', 'start date'],
                    ['end_date', 'end date'],
                    ['status'],
                ]} onSelect={() => null} showSelected={false} />
            }
            <form onSubmit={onSubmit}>
                <Section title={`New ${label.toLowerCase()}`} grid
                    description={`Dates are B.S. (YYYY-MM-DD). Check the month's real length — Ashad has 32 days in some years, and a year that ends a day early hides that day's entries from every report.`}>
                    <TextInput value={year?.name}
                        input={{ label: 'Name', name: 'name', placeholder: namePlaceholder, required: true }}
                        error={errors?.name} onChange={onChange} onBlur={onBlur} />
                    <TextInput value={year?.start_date}
                        input={{ label: 'Start date (BS)', name: 'start_date', required: true }}
                        error={errors?.start_date} onChange={onChange} onBlur={onBlur} />
                    <TextInput value={year?.end_date}
                        input={{ label: 'End date (BS)', name: 'end_date', required: true }}
                        error={errors?.end_date} onChange={onChange} onBlur={onBlur} />
                </Section>
                {duplicate &&
                    <p role="alert" className="mb-3 text-sm font-semibold text-amber-800">
                        {`'${duplicate.name}' (${duplicate.start_date} — ${duplicate.end_date}) already exists for this school.`}
                    </p>
                }
                <ButtonsSecion>
                    <Button variant="outlined" onClick={reset} disabled={saving}>Reset</Button>
                    <FormSaveButton saving={saving} disabled={saving || incomplete || !!duplicate} />
                </ButtonsSecion>
            </form>
        </>
    )
}

function normalizeName(name) {
    return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const NOTE = {
    title: "Years are created here, not by the school",
    description: `Schools move into their next year by CLOSING the running one — that carries the balances across.
    Create one here only for a school's first year, a parallel calendar, or a correction.`,
};

export default SchoolFiscalYears;
