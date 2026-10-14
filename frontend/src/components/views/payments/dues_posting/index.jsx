import ClassPicker from "@/components/inputs/ClassPicker";
import { ButtonsSecion, Section } from "@/components/sections";
import { useEffect, useState } from "react";
import classPickerSchema from "@/schemas/class-picker";
import { Button, Typography } from "@material-tailwind/react";
import { searchStudents } from "@/services/functions/students";
import HeaderCard from "@/components/tables/HeaderCard";
import { useAppContext } from "@/contexts/AppContext";
import AmountInput from "@/components/tables/AmountInput";
import RowCard from "@/components/tables/RowCard";
import { saveLedgers } from "@/services/functions/ledgers";
import { OLD_DUES } from "@/configs/payment";
import cleanClassInfo from "@/methods/cleanClassInfo";
import useRequestStatus from "@/hooks/requestStatus";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import CSVFileUpload from "@/components/inputs/CSVFileUpload";

function DuesPosting() {
    const { user: { user }, fiscalYear, notification: { updateNotification } } = useAppContext();
    classPickerSchema['school'] = user?.profile?.school || user?.profile?.id;
    classPickerSchema['academic_year'] = fiscalYear?.year?.academic_year;
    const [searchInput, setSearchInput] = useState(() => ({ ...classPickerSchema })); // search input!
    const [students, setStudents] = useState([]);
    const [form, setForm] = useState([]);
    const [status, setStatus] = useState(false);
    const { searching, statusHandler } = useRequestStatus();
    // 
    // The initial state is snapshotted from classPickerSchema on the FIRST render,
    // when the fiscal-year context may not have resolved yet — leaving
    // academic_year undefined for the whole session. It then gets stripped from
    // the payload (empty values are cleaned) and the posting fails server-side.
    // Re-sync once the context lands.
    useEffect(() => {
        if (!fiscalYear?.year?.academic_year) return;
        setSearchInput(state => (state.academic_year ? state
            : { ...state, academic_year: fiscalYear.year.academic_year }));
    }, [fiscalYear?.year?.academic_year]);
    // 
    function updateSearchInput({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }
    function onDueAmountChange(id, due) {
        // console.log(id, due);
        setForm(state => ({ ...state, [id]: due }));
    }
    function onFileRead(data) {
        setForm(state => {
            return students.reduce((acc, { id: studentId }, index) => {
                acc[studentId] = data?.[index]?.[0] ?? '';
                return acc;
            }, {});
        })
    }
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const [, , _students] = await searchStudents(cleanClassInfo(searchInput));
        setForm(_students.reduce((acc, val) => {
            acc[val.id] = 0;
            return acc;
        }, {}))
        setStudents(_students);
        statusHandler.toggleSearching();
    }
    function prepareUploadData() {
        return {
            ledgerPosting: { months: [], class_info: { ...searchInput } },
            studentLedgers: Object.entries(form)
                .reduce((acc, [studentId, dueAmount]) => {
                    if (dueAmount && dueAmount != 0) acc.push(
                        {
                            student: parseInt(studentId),
                            details: { [OLD_DUES]: dueAmount },
                            total: dueAmount
                        }
                    );
                    return acc;
                }, []),
            ...fiscalYear.year
        };
    }
    async function postDues(e) {
        e.preventDefault();
        setStatus(true);
        const uploadData = prepareUploadData();
        const [status, message,] = await saveLedgers(uploadData);
        updateNotification(status, message);
        if (status === 200) reset();
        setStatus(false);
    }
    function reset() {
        setForm([]);
        setStudents([]);
        setSearchInput({ ...classPickerSchema });
    }
    return (
        <>
            <>
                <form onSubmit={onSearch}>
                    <Section>
                        <ClassPicker data={searchInput} onChange={updateSearchInput} classwise={true} />
                    </Section>
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={reset}>Reset</Button>
                        <FormSaveButton isSearch={true} searching={searching} disabled={searching} />
                    </ButtonsSecion>
                </form>
            </>
            <>
                {
                    students?.length > 0 ?
                        <>
                            <form onSubmit={postDues}>
                                <CSVFileUpload hasHeaders={false} onReadComplete={onFileRead} />
                                <HeaderCard grid={2} className={"bg-table-header"}>
                                    <span className="font-semibold">student's name</span>
                                    <span className="font-semibold">due amount</span>
                                </HeaderCard>
                                {
                                    students?.map((student, sk) => (
                                        <RowCard key={sk} grid={2} className={"bg-teal-100 rounded-none"}>
                                            <Typography variant="paragraph"
                                                color="blue-gray"
                                                className="font-normal capitalize">
                                                {student.name}
                                            </Typography>
                                            <span>
                                                <AmountInput id={student.id} value={form?.[student.id]} onChange={onDueAmountChange} />
                                            </span>
                                        </RowCard>
                                    ))
                                }
                                <ButtonsSecion>
                                    <FormSaveButton custom={[status, "Post", "Posting..."]} disabled={status} />
                                </ButtonsSecion>
                            </form>
                        </>
                        : <></>
                }   
            </>
        </>
    )
}

export default DuesPosting;