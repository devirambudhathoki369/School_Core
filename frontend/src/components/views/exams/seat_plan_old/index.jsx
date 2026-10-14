import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import ClassPicker from "@/components/inputs/ClassPicker";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import cleanClassInfo from "@/methods/cleanClassInfo";
import { searchStudents } from "@/services/functions/students";
import { useRef, useState } from "react";
import Image from "next/image";
import { formatImagePath } from "@/methods/formatMediaPath";
import Checkbox from "@/components/inputs/Checkbox";
import { useReactToPrint } from "react-to-print";
import { Button } from "@material-tailwind/react";

const schema = { education_level: null, grade: null, faculty: '', year: null, semester: null, course: null, school: '' }
function SeatPlan() {
    const { user: { user }, class: { classesBackup }, notification: { updateNotification } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    schema['school'] = schoolId;
    const [input, setInput] = useState({ ...schema });
    const [students, setStudents] = useState([]);
    const { searching, statusHandler } = useRequestStatus();

    const classesMap = classesBackup.reduce((acc, [, cls,]) => {
        const { id, name } = cls;
        acc[id] = name;
        return acc;
    }, {});

    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }

    async function onSearch(e) {
        e.preventDefault();
        const searchInput = {
            ...cleanClassInfo(input),
            include_identities: true,
            include_images: true,
        };
        statusHandler.toggleSearching();
        const [status, msg, data] = await searchStudents(searchInput);
        if (data?.length) {
            setStudents(data);
        } else {
            updateNotification(status, msg);
            setStudents([]);
        }
        statusHandler.toggleSearching();
    }

    function allowSearch() {
        return (
            input?.school && input?.education_level && !searching
        )
    }

    return (
        <>
            <form onSubmit={onSearch}>
                <ClassPicker data={input} onChange={onChange} classwise={true} />
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} disabled={!allowSearch()} />
                </ButtonsSecion>
            </form>

            <>
                {
                    searching ? <Loader /> :
                        <>
                            {students?.length ?
                                <>
                                    <SeatPlanView students={students} classes={classesMap} />
                                </>
                                :
                                <NotFound />
                            }
                        </>
                }
            </>
        </>
    )
}

const filtersSchema = { show_rollno: true, show_symbol_no: false, show_regd_no: false, autofill_rollno: false };
function SeatPlanView({ students, classes }) {
    const [filters, setFilters] = useState({ ...filtersSchema });

    function onClick(e) {
        const { name } = e.target;
        setFilters(state => ({ ...state, [name]: !state[name] }));
    }

    const printRef = useRef(null);
    const onPrint = useReactToPrint({
        content: () => printRef.current,
    })

    return (
        <>
            <Section>
                <Checkbox name={"show_rollno"} text={"Toggle Roll No."} checked={filters?.show_rollno} onClick={onClick} />
                <Checkbox name={"autofill_rollno"} text={"Auto fill Roll No."} checked={filters?.autofill_rollno} onClick={onClick} />
                <Checkbox name={"show_symbol_no"} text={"Toggle Symbol No."} checked={filters?.show_symbol_no} onClick={onClick} />
                <Checkbox name={"show_regd_no"} text={"Toggle Regd. No."} checked={filters?.show_regd_no} onClick={onClick} />
            </Section>
            <div ref={printRef}>
                <textarea className="w-full outline-none my-1 print:placeholder-shown:hidden" rows={3} placeholder="Note : "></textarea>
                <div className={`grid grid-cols-3 justify-center items-start gap-4`} >
                    {
                        students.map((student, index) => (
                            <div key={student.id} className="bg-white/50 py-2 px-3 rounded-md flex flex-col gap-y-2 border border-gray-400 break-inside-avoid font-semibold text-[14px]">
                                <SeatLine label="Name" value={student.name} capitalize />
                                <div className="flex items-start gap-x-2.5">
                                    {
                                        (student?.image) ?
                                            <Image unoptimized className="border border-gray-400 rounded-md shrink-0 h-[85px] w-[85px] object-cover"
                                                src={formatImagePath(student.image)}
                                                alt={student.name} width={85} height={85} quality={70} onContextMenu={(e) => { e.preventDefault() }} /> :
                                            <div className="border border-gray-400 h-[85px] w-[85px] rounded-md shrink-0"></div>
                                    }
                                    <div className="flex flex-col gap-y-1 min-w-0 flex-1">
                                        <SeatLine label="Class" value={classes?.[student.class_info]} capitalize />
                                        {(filters?.show_rollno && !filters?.autofill_rollno) && <SeatLine label="Roll No." value={student.roll_no} />}
                                        {(filters?.show_rollno && filters?.autofill_rollno) && <SeatLine label="Roll No." value={index + 1} />}
                                        {filters?.show_symbol_no && <SeatLine label="Symbol No." value={student.symbol_no} />}
                                        {filters?.show_regd_no && <SeatLine label="Regd. No." value={student.regd_no} />}
                                    </div>
                                </div>
                            </div>
                        ))
                    }
                </div >
            </div>
            <ButtonsSecion>
                <Button variant="outlined" onClick={onPrint} >Print</Button>
            </ButtonsSecion>
        </>
    )
}

// Label and value flow as one line of text; only a value too long for the
// card wraps, and then only at word boundaries (never mid-word).
function SeatLine({ label, value, capitalize = false }) {
    return (
        <div className="leading-snug">
            <span className="whitespace-nowrap">{label}:</span>{" "}
            <span className={capitalize ? "capitalize" : ""}>{value}</span>
        </div>
    )
}

export default SeatPlan;