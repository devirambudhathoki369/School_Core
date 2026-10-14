import ClassPicker from "@/components/inputs/ClassPicker";
import { Button, Card } from "@material-tailwind/react";
import { useEffect, useRef, useState } from "react";
import classPickerSchema from "@/schemas/class-picker";
import { ButtonsSecion } from "@/components/sections";
import { OPTION_NONE, SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { useAppContext } from "@/contexts/AppContext";
import { __search } from "@/services/functions";
import cleanEmptyFields from "@/methods/cleanEmptyFields";
import BasicTable from "@/components/tables/BasicTable";
import { fillData } from "@/methods/FlattenSchema";
import TableHeaderFooter from "@/components/tables/TableHeaderFooter";
import cleanClassInfo from "@/methods/cleanClassInfo";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";
import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import ClosedAcademicYearSelectInput from "@/components/inputs/ClosedAcademicYearSelectInput";
import Warning from "@/components/Warning";

const STATUS_RUNNING = "1";
const searchSchema = { ...classPickerSchema, status: STATUS_RUNNING, from: '', to: '', academic_year: '' };
const uploadSchema = { class_info: { ...classPickerSchema }, date_range: { from: '', to: '' }, academic_year: '', status: '' };
// 
function OverallStudentLedgers() {
    const { status: { setupDone }, user: { user },
        fiscalYear: { year, years, getAcademicYearObject },
        notification: { updateNotification } } = useAppContext();
    searchSchema['school'] = user?.profile?.school || user?.profile?.id;
    // academic_year is filled in by the prefill effect below, NOT here. Setting
    // it in the render body made that effect's "nothing filled in yet" guard
    // false before it ever ran, so the form opened with a year but an EMPTY
    // From — and this report then answered for a different date range than
    // Overall Remaining dues, whose schema never set the year this way.
    searchSchema['to'] = user?.today;
    const [input, setInput] = useState({ ...searchSchema });
    const prefilled = useRef(false);
    const [data, setData] = useState([]);
    const [totalBalance, setTotalBalance] = useState(0);
    const { searching, statusHandler } = useRequestStatus();
    // 
    function onChange({ name, value }) {
        if (["academic_year", "closed_academic_year"].includes(name)) {
            /* set user selected academic year's date */
            const ayObj = getAcademicYearObject(value) || {};
            const updatedInput = {
                ...input,
                academic_year: value,
                from: ayObj?.start_date || "",
                to: (name === "closed_academic_year") ? (ayObj?.end_date || "") : user?.today,
            };
            setInput(updatedInput);
            return;
        }
        setInput(state => ({ ...state, [name]: value }));
    }
    function onReset() {
        // Restore the visible defaults: from = academic-year start, to = today.
        const ay = year?.academic_year || '';
        const ayStart = getAcademicYearObject(ay)?.start_date || '';
        setInput({
            ...searchSchema,
            academic_year: ay,
            from: ayStart,
            to: user?.today || '',
        });
    }
    function cleanedSearchInput() {
        let inp = { ...cleanClassInfo(input) };
        inp = fillData(uploadSchema, inp);
        // Default a missing date bound to (academic-year start, today) so the
        // user can hit Search without manually typing dates.
        const ayStart = getAcademicYearObject(inp?.academic_year)?.start_date || '';
        const fromDate = inp?.date_range?.from || ayStart;
        const toDate = inp?.date_range?.to || user?.today || '';
        if (fromDate && toDate) {
            inp["date_range"] = [fromDate, toDate];
        }
        return cleanEmptyFields(inp);
    }
    async function onSubmit(e) {
        e.preventDefault();
        const searchInput = cleanedSearchInput();
        if (Object.keys(searchInput).length < 1) {
            updateNotification('', "Invalid input!");
            return null;
        }
        statusHandler.toggleSearching();
        let [status, message, data] = await __search('/api/search/overall_student_ledgers', searchInput);
        // 
        if (data) {
            if (data?.data?.length > 0) {
                let _tb = 0;
                data['data'] = data.data?.reduce((acc, std) => {
                    const dramt = std?.debit_amount || 0;
                    const cramt = std?.credit_amount || 0;
                    std['balance'] = dramt - cramt;
                    _tb += std.balance;
                    acc.push(std);
                    return acc;
                }, []);
                //
                setTotalBalance(_tb);
                setData(data);
            } else {
                updateNotification(404, "Not Found!");
                setTotalBalance(0);
                setData([]);
                statusHandler.toggleSearching();
                return;
            }
        }
        updateNotification(status, message);
        statusHandler.toggleSearching();
    }
    const academic_year_options = years?.academicYears || [];

    useEffect(() => {
        /* one-time default prefill from global fiscal year.
         * Do NOT re-sync on global year changes — report must reflect what the
         * user has selected in the form, not whatever the header is set to.
         * The "once" is held in a ref: keying it off a form value meant a value
         * that arrived some other way (the module schema) counted as a prefill
         * and left the date boxes empty.
         */
        if (!setupDone || !year?.academic_year || prefilled.current) return;
        prefilled.current = true;
        const ayObj = getAcademicYearObject(year.academic_year) || {};
        setInput(state => ({
            ...state,
            academic_year: state?.academic_year || year.academic_year,
            from: state?.from || ayObj?.start_date || "",
            to: state?.to || user?.today || "",
        }));
    }, [setupDone, year?.academic_year]);
    // 
    return (
        <>
            <>
                <form onSubmit={onSubmit}>
                    <Card className="p-3">
                        <ClassPicker data={input} onChange={onChange} classwise={true} />
                        <Warning warning={"Select running academic year or closed academic year"} />
                        <div className="flex gap-x-4">
                            <SelectInput value={input?.status} input={{ name: 'status', label: "Status", options: STUDENT_STATUS_OPTIONS }}
                                onChange={onChange} />
                            <SearchInput value={input?.academic_year || ''} onChange={onChange} input={{
                                name: 'academic_year', label: 'Running Academic year', options: academic_year_options
                            }} />
                            <ClosedAcademicYearSelectInput value={input?.academic_year || ''} onChange={onChange} />
                            <TextInput value={input?.from} onChange={onChange} input={{
                                name: 'from', label: 'From (BS)'
                            }} />
                            <TextInput value={input?.to} onChange={onChange} input={{
                                name: 'to', label: 'To (BS)'
                            }} />
                        </div>
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={onReset}>Reset</Button>
                            <FormSaveButton isSearch={true} searching={searching} disabled={searching || !input?.academic_year || !input?.education_level} />
                        </ButtonsSecion>
                    </Card>
                </form>
            </>
            <>
                {
                    searching ? <Loader /> :
                        <>
                            {data?.data?.length > 0 ?
                                <>
                                    {/* BASIC TABLE */}
                                    {/* sn, name,  address, guardian_name, contact, classname, debit, credit, balance */}
                                    <BasicTable name={"Overall Student Ledgers"} columns={[
                                        ['name'],
                                        ['location'],
                                        ['guardian_name', 'guardian name'],
                                        ['contact'],
                                        ['classname'],
                                        ['debit_amount', 'debit'],
                                        ['credit_amount', 'credit'],
                                        ['balance'],
                                    ]} data={data?.data || []} onSelect={() => null} showSelected={false} print allowExport
                                        header={
                                            <div className="flex flex-col">
                                                <span>
                                                    {
                                                        (data?.dates?.from && data?.dates?.to) &&
                                                        <span>
                                                            <span className="font-semibold">FROM</span> : {data.dates.from}
                                                            &nbsp;
                                                            <span className="font-semibold">TO</span> : {data.dates.to}
                                                        </span>
                                                    }
                                                    &nbsp;
                                                    {
                                                        data?.classname &&
                                                        <span className="uppercase"> <span className="font-semibold">CLASS</span> : {data.classname}</span>
                                                    }
                                                </span>
                                                <TableHeaderFooter label={"Total"} value={`Rs. ${totalBalance}`} />
                                            </div>
                                        }
                                        footer={
                                            <>
                                                <TableHeaderFooter label={"Total"} value={`Rs. ${totalBalance}`} />
                                            </>
                                        } />
                                </> : <NotFound />
                            }
                        </>
                }
            </>
        </>
    )
}

export default OverallStudentLedgers;