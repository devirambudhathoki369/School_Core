import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import ClassPicker from "@/components/inputs/ClassPicker";
import MonthPicker from "@/components/inputs/MonthPicker";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import TableHeaderFooter from "@/components/tables/TableHeaderFooter";
import LP_VIEW_FORMATTER from "@/components/views/reports/recent_postings/history_formatter";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import cleanClassInfo from "@/methods/cleanClassInfo";
import safeDecimal from "@/methods/safeDecimal";
import { searchLedgerPostingHistory } from "@/services/functions/ledgers";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";

const VIEWS = {
    DETAILED: 1,
    INTERMEDIATE: 2,
    OVERALL_TITLEWISE: 3,
}, VIEW_OPTIONS = Object.entries(VIEWS).map(e => ({ value: e[1], name: e[0] }));

const schema = {
    school: '', class_info: '', start_date: '', end_date: '', status: true, student_status: '',
    education_level: null, grade: null, faculty: '', year: null, semester: null, course: null, school: '',
    months: [],
};
function LedgerPostingHistoryView() {
    const { user: { user }, fiscalYear: { year, mappedYears }, class: { classesBackup }, notification: { updateNotification } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    schema['school'] = schoolId;
    schema['end_date'] = user?.today;
    const [input, setInput] = useState({ ...schema });
    const [backup, setBackup] = useState({});
    const [view, setView] = useState(VIEWS.INTERMEDIATE);
    const [data, setData] = useState({});
    const [columns, setColumns] = useState([]);
    const [total, setTotal] = useState(0);
    const [working, setWorking] = useState(false);
    const { searching, statusHandler } = useRequestStatus();

    const classesMap = classesBackup.reduce((acc, [, cls,]) => {
        acc[cls.id] = cls.name;
        return acc;
    }, {});

    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }
    function onViewChange({ name, value }) {
        setView(parseInt(value));
    }
    function handleView(key = null, data = null, titles = null) {
        key = key || backup?.key;
        if (view === VIEWS.DETAILED)
            return LP_VIEW_FORMATTER.detailed(key, data, titles, classesMap);
        else if (view === VIEWS.INTERMEDIATE)
            return LP_VIEW_FORMATTER.intermediate(key, data, classesMap);
        else if (view === VIEWS.OVERALL_TITLEWISE)
            return LP_VIEW_FORMATTER.overall_titlewise(key, data, titles);
    }

    async function onSubmit(e) {
        e.preventDefault();
        if (!input?.school) {
            return;
        }
        setBackup({});
        setData({});
        setColumns([])
        // 
        statusHandler.toggleSearching();
        const searchInput = cleanClassInfo(input);
        // Filter postings by the fee months they cover.
        if (input?.months?.length) searchInput.months = input.months;
        const [status, , res] = await searchLedgerPostingHistory(searchInput);
        if (status === 200 && res?.data?.length) {
            let { data, fee_titles } = res, columns = [];
            const fee_titles_map = (fee_titles || []).reduce((acc, val) => {
                acc[val.id] = val.title;
                return acc;
            }, {});
            const timestamp = Date.now();
            setBackup({ data: data, titles: fee_titles_map, key: timestamp });
            [columns, data] = handleView(timestamp, data, fee_titles_map);
            setColumns(columns);
            setData(data);
            // 
            setTotal(safeDecimal(data.reduce((acc, item) => {
                acc += item?.total || 0;
                return acc;
            }, 0)));
        } else {
            updateNotification(404, "No data found!");
        }
        statusHandler.toggleSearching();
    }

    function onReset() {
        setInput({ ...schema });
    }

    useEffect(() => {
        if (view && backup?.titles && backup?.data) {
            setWorking(true);
            const [columns, data] = handleView(backup.key, backup.data, backup.titles);
            setColumns(columns);
            setData(data);
            setWorking(false);
        }
    }, [view]);

    useEffect(() => {
        if (year?.academic_year) {
            const cay = mappedYears?.academicYears?.[year.academic_year];
            if (cay) {
                schema['start_date'] = cay.start_date;
                setInput({ ...schema });
            }
        } else {
            updateNotification(404, "Please select an academic year first!");
        }
    }, [year?.academic_year]);

    return (
        <>
            <SearchForm input={input} onChange={onChange}
                onSubmit={onSubmit} onReset={onReset} searching={searching} />

            {searching ? <Loader /> :
                <>
                    <Section>
                        <SelectInput input={{ name: 'view', label: "View", options: VIEW_OPTIONS }} value={view} onChange={onViewChange} />
                    </Section>
                    {data?.length > 0 ?
                        <>
                            <BasicTable name={"Ledger Posting History"} data={data} columns={columns}
                                showSelected={false} print={true} allowExport loading={working} includeSN={false}
                                header={
                                    <>
                                        <span className="m-1">
                                            <span className="font-semibold">From</span> : {input.start_date}
                                            &nbsp;
                                            <span className="font-semibold">To</span> : {input.end_date}
                                        </span>
                                        <TableHeaderFooter label={"Total"} value={`Rs. ${total}`} />
                                    </>
                                }
                                footer={<TableHeaderFooter label={"Total"} value={`Rs. ${total}`} />} />
                        </> :
                        <NotFound />
                    }
                </>
            }
        </>
    )
}

function SearchForm({ input, onChange, onSubmit, onReset, searching }) {
    const [pickedAllMonths, setPickedAllMonths] = useState(false);
    function allowSearch() {
        return (
            !searching && input?.start_date && input?.end_date && input?.school
        )
    }
    return (
        <form onSubmit={onSubmit}>
            <ClassPicker data={input} onChange={onChange} classwise={true} />
            <Section>
                <TextInput input={{ name: 'start_date', label: "Date (From)" }} value={input?.start_date} onChange={onChange} />
                <TextInput input={{ name: 'end_date', label: "Date (To)" }} value={input?.end_date} onChange={onChange} />
                <SelectInput value={input?.student_status} onChange={onChange}
                    input={{
                        name: 'student_status', label: 'Student Status',
                        options: STUDENT_STATUS_OPTIONS
                    }} />
                <SelectInput value={input?.status} onChange={onChange}
                    input={{
                        name: 'status', label: 'Active status',
                        options: [
                            { value: true, name: 'Active' },
                            { value: false, name: 'Deleted' },
                        ]
                    }} />
            </Section>
            {/* View postings by the fee months they cover (independent of created date) */}
            <Section title={"Filter by months (optional)"}
                description={"Show postings that cover any of the selected fee-months."}>
                <div className="sm:col-span-12">
                    <MonthPicker data={input?.months || []} previousData={[]}
                        onSelect={({ value }) => onChange({ name: 'months', value })}
                        onSelectAll={(months) => onChange({ name: 'months', value: months })}
                        allMonths={{ pickedAllMonths, setPickedAllMonths }} />
                </div>
            </Section>
            <ButtonsSecion>
                <Button variant="outlined" onClick={onReset}>Reset</Button>
                <FormSaveButton isSearch={true} searching={searching} disabled={!allowSearch()} />
            </ButtonsSecion>
        </form>
    )
}

export default LedgerPostingHistoryView;