import Loader from "@/components/Loader";
import SearchDialog from "@/components/inputs/SearchDialog";
import { useAppContext } from "@/contexts/AppContext";
import { fetchClassesInOrder } from "@/services/functions/classes";
import { promoteClass, searchStudents } from "@/services/functions/students";
import { Button, Typography } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import StudentsPicker from "../../exams/optional_subject_assignment/StudentsPicker";
import useRequestStatus from "@/hooks/requestStatus";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";
import NotFound from "@/components/NotFound";
import { ArrowRightIcon, ArrowDownIcon, AcademicCapIcon, UsersIcon, InformationCircleIcon } from "@heroicons/react/24/outline";

// `section_change_only` = "let exam results follow the students". Ticked by
// default so results come along unless the operator clears it; the backend
// still auto-detects when the flag is absent.
const promotionSchema = { school: '', academic_year: '', from: '', from_status: '1', to: '', to_status: '1', students: [], section_change_only: true };

// Same class, only the section differs => a section change (results follow the
// students); any other difference => a real promotion. Kept in sync with the
// backend's is_section_only_change, which is the authority.
const CLASS_IDENTITY_FIELDS = ['education_level', 'grade', 'faculty', 'course', 'year', 'semester'];
function isSectionOnlyChange(from, to) {
    if (!from || !to) return false;
    if (from.section === to.section) return false;
    return CLASS_IDENTITY_FIELDS.every((f) => (from[f] ?? null) === (to[f] ?? null));
}
function ClassPromotion() {
    const { user: { user },
        fiscalYear: { year },
        notification: { updateNotification } } = useAppContext();
    promotionSchema["school"] = user?.profile?.school || user?.profile?.id;
    promotionSchema["academic_year"] = year?.academic_year;
    const [input, setInput] = useState({ ...promotionSchema });
    const [classNames, setClassNames] = useState({}); // from, to
    const [showClassPicker, setShowClassPicker] = useState(false);
    const [classes, setClasses] = useState([]);
    const [name, setName] = useState('');//dialog name;
    const [students, setStudents] = useState([]);
    const [selectedClass, setSelectedClass] = useState({});
    // Both sides are kept, not just `from`, so the two can be compared to tell a
    // section change from a real promotion.
    const [picked, setPicked] = useState({});
    const [pickedAllStudents, setPickedAllStudents] = useState(false);
    const { uploading, fetching, statusHandler } = useRequestStatus();
    const canPromote = !!input?.from && !!input?.to && input?.students?.length > 0;
    // Section-vs-class is decided from the two chosen classes, not a checkbox:
    // same class, different section => a section change; anything else => a
    // promotion. The backend derives the same thing authoritatively; this is
    // only for the button label / hint.
    const isSectionChange = isSectionOnlyChange(picked?.from?.details, picked?.to?.details);
    const actionLabel = isSectionChange ? "Change section" : "Promote students";
    const blocker = !input?.from ? "Choose the class to move students from."
        : !input?.to ? "Choose the class to move them to."
            : "Select at least one student.";

    function onClick(e, name) {
        setShowClassPicker(state => {
            state = !state;
            if (state === false) setName('');
            else {
                setName(name);
            }
            return state;
        });
    }
    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }
    async function onSelect(name, item) {
        if (name === "from") setSelectedClass(item);
        setPicked(state => ({ ...state, [name]: item }));
        setClassNames(state => ({ ...state, [name]: item.name }));
        setInput(state => ({ ...state, [name]: item.id }));
        setName('');
        setShowClassPicker(false);
    }
    async function fetchStudents(class_info) {
        statusHandler.toggleFetching();
        let [, , _students] = await searchStudents({
            class_info: class_info?.id,
            status: input.from_status,
            school: user?.profile?.school || user?.profile?.id,
        });
        if (_students && _students?.length > 0) {
            setStudents(_students);
        }
        statusHandler.toggleFetching();
    }
    function onStudentSelect({ name, value }) {
        setInput(state => ({ ...state, students: value }));
    }
    function onReset() {
        setInput({ ...promotionSchema });
        setClassNames({});
        setPicked({});
    }
    async function onClassPromote(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const [status, message,] = await promoteClass(input);
        updateNotification(status, message);
        if (status === 200) {
            if (selectedClass?.class_info?.id) {
                setStudents([]);
            }
            onReset();
        }
        statusHandler.toggleUploading();
    }
    // 
    useEffect(() => {
        if (user?.profile?.id) {
            (async () => {
                let _classes = await fetchClassesInOrder(user);
                _classes = Object.values(_classes || {}).reduce((acc, val) => {
                    const [classname, details,] = val;
                    acc.push({ name: classname, id: details.id, details });
                    return acc;
                }, []);
                setClasses(_classes);
            })();
        }
    }, []);
    useEffect(() => {
        if (selectedClass?.details) {
            (async () => {
                await fetchStudents(selectedClass.details);
            })();
        }
    }, [input?.from_status, selectedClass]);
    // 
    // A picked class is shown as a filled card; an empty one stays a dashed
    // outline, so at a glance it is obvious which side still needs choosing.
    function ClassCard({ side, label, statusName, statusLabel }) {
        const chosen = classNames?.[side];
        return (
            <div className={`flex-1 min-w-0 rounded-xl border p-4 transition-colors duration-200 ${chosen
                ? "border-teal-300 bg-teal-50/60"
                : "border-dashed border-blue-gray-200 bg-white"}`}>
                <div className="flex items-center gap-2 mb-3">
                    <AcademicCapIcon className="w-5 h-5 text-teal-600 shrink-0" />
                    <span className="text-[0.7rem] font-bold uppercase tracking-widest text-blue-gray-500">{label}</span>
                </div>
                <SelectInput input={{ name: statusName, label: statusLabel, hideLabel: false, options: STUDENT_STATUS_OPTIONS }}
                    value={input?.[statusName]} onChange={onChange} />
                <div className="mt-4">
                    <Button variant={chosen ? "text" : "outlined"} size="sm" className="w-full justify-center"
                        onClick={(e) => { onClick(e, side); }} disabled={showClassPicker}>
                        {chosen ? "Change class" : `Choose ${label.toLowerCase()} class`}
                    </Button>
                    <div className="mt-2 min-h-[1.75rem] flex items-center justify-center">
                        {chosen
                            ? <span className="text-base font-bold capitalize text-blue-gray-800 truncate">{chosen}</span>
                            : <span className="text-[0.8rem] text-blue-gray-400">not selected</span>}
                    </div>
                </div>
            </div>
        );
    }
    return (
        <div className="w-full">
            {classes?.length > 0 ?
                <>
                    <form onSubmit={onClassPromote} className="w-full flex flex-col gap-y-6">
                        {/* From -> To. Side by side once there is room, stacked
                            with a downward arrow on a phone. */}
                        <div className="flex flex-col sm:flex-row items-stretch gap-3">
                            <ClassCard side="from" label="From" statusName="from_status" statusLabel="From Student Status" />
                            <div className="flex sm:flex-col items-center justify-center shrink-0 text-blue-gray-400">
                                <ArrowDownIcon className="w-6 h-6 sm:hidden" />
                                <ArrowRightIcon className="w-6 h-6 hidden sm:block" />
                            </div>
                            <ClassCard side="to" label="To" statusName="to_status" statusLabel="As Student Status" />
                        </div>
                        {/* The move is auto-detected as a section change or a
                            promotion, but the operator can override whether
                            results follow via the checkbox — needed to correct a
                            mis-recorded move. Ticked by default. */}
                        {input?.from && input?.to &&
                            <div className="flex flex-col gap-2 rounded-lg border border-blue-gray-100 bg-blue-gray-50/60 p-3">
                                <div className="flex items-start gap-2">
                                    <InformationCircleIcon className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                                    <p className="text-[0.8rem] text-blue-gray-600">
                                        {isSectionChange
                                            ? "Same class, different section — this is detected as a section change."
                                            : "Different class — detected as a promotion; only dues carry forward."}
                                    </p>
                                </div>
                                <Checkbox name="section_change_only" text="Carry exam results to the new class/section"
                                    checked={!!input?.section_change_only}
                                    onClick={() => onChange({ name: "section_change_only", value: !input?.section_change_only })} />
                            </div>}
                        <div className="rounded-xl border border-blue-gray-100 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <UsersIcon className="w-5 h-5 text-teal-600 shrink-0" />
                                    <Typography variant="lead" className="capitalize font-semibold truncate">
                                        {classNames?.from ? `Students in ${classNames.from}` : "Students"}
                                    </Typography>
                                </div>
                                {students?.length > 0 && (
                                    <span className="rounded-full bg-teal-50 px-3 py-1 text-[0.75rem] font-bold text-teal-800 ring-1 ring-teal-200">
                                        {input?.students?.length || 0} of {students.length} selected
                                    </span>
                                )}
                            </div>
                            {fetching ? <Loader /> :
                                students?.length > 0
                                    ? <StudentsPicker students={students || []} data={input || {}}
                                        previousData={[]} onSelect={onStudentSelect} onSelectAll={onStudentSelect}
                                        allStudents={{ pickedAllStudents, setPickedAllStudents }} />
                                    : <NotFound error="Select class!" />
                            }
                        </div>
                        {/* The action sits directly under the form and spans it,
                            rather than hiding in the far right corner. It also
                            says what it is about to do and, when something is
                            still missing, what is missing — so nothing has to be
                            guessed from a greyed-out button. */}
                        <div className="sticky bottom-0 z-10 -mx-1 rounded-xl border border-blue-gray-100 bg-white/95 backdrop-blur px-4 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <p className="text-[0.85rem] text-blue-gray-600">
                                    {!canPromote
                                        ? blocker
                                        : <>Moving <span className="font-bold text-blue-gray-900">{input?.students?.length}</span>
                                            {" "}student{input?.students?.length === 1 ? "" : "s"} from{" "}
                                            <span className="font-semibold capitalize text-blue-gray-900">{classNames?.from}</span> to{" "}
                                            <span className="font-semibold capitalize text-blue-gray-900">{classNames?.to}</span>.</>}
                                </p>
                                <div className="w-full sm:w-auto shrink-0 [&>button]:w-full sm:[&>button]:w-auto [&>button]:py-3 [&>button]:px-8">
                                    <FormSaveButton saving={uploading} disabled={!canPromote}
                                        custom={[uploading, actionLabel, "Promoting..."]} />
                                </div>
                            </div>
                        </div>
                    </form>
                    <SearchDialog name={name} open={showClassPicker} handler={onClick}
                        title={"Class"} data={classes} onSelect={onSelect} />
                </> :
                <Loader />
            }
        </div>
    )
}

export default ClassPromotion;