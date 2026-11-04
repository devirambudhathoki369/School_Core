import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { Card, Button, Typography } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import { XMarkIcon, CheckBadgeIcon } from "@heroicons/react/24/outline";
import { useAppContext } from "@/contexts/AppContext";
import { fetchSubjects } from "@/services/functions/subjects";
import { fetchStaffs } from "@/services/functions/staffs";
import useRequestStatus from "@/hooks/requestStatus";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { fetchClassPeriod, saveClassPeriods } from "@/services/functions/classes";
import Loader from "@/components/Loader";
import SearchDialog from "@/components/inputs/SearchDialog";
import AttentionBox from "@/components/AttentionBox";

const SEARCH_VIEWS = {
    subjects: "SVIEW",
    teachers: "TVIEW",
};

const classPeriodSchema = { class_info: '', academic_year: '', period_count: '', teachers: {}, subjects: {} };
const displaySchema = { teachers: {}, subjects: {} };
function ClassDetails({ selectedClass }) {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    classPeriodSchema["class_info"] = selectedClass.class_info.id;
    classPeriodSchema["academic_year"] = year?.academic_year;
    const [data, setData] = useState(() => ({ ...classPeriodSchema }));
    const [displayData, setDisplayData] = useState({ ...displaySchema });
    const [openSearch, setOpenSearch] = useState({ view: '', period: '' });
    const [subjects, setSubjects] = useState([]);
    const [teachers, setTeachers] = useState([]);
    const { fetching, uploading, statusHandler } = useRequestStatus();
    const [prevClass, setPrevClass] = useState(null);
    const [error, setError] = useState(null);
    // 
    function onReset(period = null) {
        if (period) {
            setData(state => {
                const { [period]: _, ...newSubjects } = state.subjects;
                const { [period]: __, ...newTeachers } = state.teachers;
                return {
                    ...state,
                    subjects: newSubjects,
                    teachers: newTeachers,
                };
            });
            setDisplayData(state => {
                const { [period]: _, ...newSubjects } = state.subjects;
                const { [period]: __, ...newTeachers } = state.teachers;
                return {
                    ...state,
                    subjects: newSubjects,
                    teachers: newTeachers,
                };
            });
            return;
        }
        // whole reset! TODO: reset with loaded data !
        setData(state => ({ ...classPeriodSchema, id: state.id, period_count: 0 }));
        setDisplayData({ ...displaySchema });
    }
    function onChange({ name, value }) {
        if (name === "teachers" || name === "subjects") {
            const period = openSearch?.period;
            if (period) {
                setData(state => {
                    const ns = ({ ...state, [name]: { ...state[name], [period]: value?.value } })
                    const _err = findPeriodIssue(ns);
                    if (_err) setError(_err);
                    return ns;
                });
                setDisplayData(state => ({ ...state, [name]: { ...state[name], [period]: value?.name } }))
            } else {
                updateNotification("No period was selected!");
            }
        }
        else setData(state => {
            const next = { ...state, [name]: value };
            if (name === "period_count") setError(findPeriodIssue(next));
            return next;
        });
    }
    function handleSearchView(view, period) {
        setOpenSearch({ view, period });
    }
    function isInputValid(data) {
        const periodCount = Number(data.period_count);
        const isValid = (periodCount > 0 || data?.id) && periodCount <= 15 &&
            Object.keys(data?.teachers || {})?.length === periodCount &&
            Object.keys(data?.subjects || {})?.length === periodCount;

        return isValid;
    }
    async function onClassPeriodsSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        if (isInputValid(data)) {
            // TODO: ALSO MUST HAVE DIFFERENCE BETWEEN PREVIOUS AND UPLOADING DATA;
            const [status, message, _] = await saveClassPeriods({
                ...data,
                is_active: data?.period_count === 0 ? false : true,
            });
            updateNotification(status, message);
        } else updateNotification('', "Assign a subject and teacher to every period before saving.");
        statusHandler.toggleUploading();
    }
    //
    function getDisplayData(classPeriod, subjects, teachers) {
        subjects = subjects.reduce((acc, subject) => {
            acc[subject.value] = subject.name;
            return acc;
        }, {});
        teachers = teachers.reduce((acc, teacher) => {
            acc[teacher.value] = teacher.name;
            return acc;
        }, {});
        const periodSubjects = Object.keys(classPeriod?.subjects || {})
            .reduce((acc, period) => {
                const subject = subjects[classPeriod.subjects[period]];
                acc[period] = subject;
                return acc;
            }, {});
        const periodTeachers = Object.keys(classPeriod?.teachers || {})
            .reduce((acc, period) => {
                const teacher = teachers[classPeriod.teachers[period]];
                acc[period] = teacher;
                return acc;
            }, {});
        return { teachers: periodTeachers, subjects: periodSubjects };
    }
    useEffect(() => {
        setError(null);
        if (selectedClass.class_info.id !== prevClass) {
            (async () => {
                statusHandler.toggleFetching();
                const _classPeriod = await fetchClassPeriod(selectedClass.class_info.id, null, true, true, year?.academic_year || '');
                let _subjects = await fetchSubjects(user?.profile?.school || user?.profile?.id, false, '', true, selectedClass.class_info.id);
                const _teachers = await fetchStaffs(user?.profile?.school || user?.profile?.id, true);
                // format subject as options;
                _subjects = _subjects.reduce((acc, sub) => {
                    let name = `${sub.subject} [CH: ${sub.credit_hours}]`;
                    if (sub?.credit_hours_pr) name += ` [CH_PR: ${sub.credit_hours_pr}]`;
                    acc.push({ value: sub.id, name });
                    return acc;
                }, []);
                if (_classPeriod) {
                    setData({ ...classPeriodSchema, ..._classPeriod });
                    const displayData = getDisplayData(_classPeriod, _subjects, _teachers);
                    const _err = findPeriodIssue(_classPeriod);
                    if (_err) setError(_err);
                    setDisplayData({ ...displaySchema, ...displayData });
                } else {
                    setData({ ...classPeriodSchema });
                    setDisplayData({ ...displaySchema });
                }
                setSubjects(_subjects);
                setTeachers(_teachers);
                setPrevClass(selectedClass.class_info.id);
                statusHandler.toggleFetching();
            })();
        }
    }, [user, selectedClass.class_info.id]);
    function findPeriodIssue({ period_count, teachers, subjects }) {
        const expected = Number(period_count) || 0;
        const t = Object.values(teachers || {});
        const s = Object.values(subjects || {});
        if (!expected) return null;
        if (t.length !== expected || s.length !== expected) {
            return `${expected - s.length} subject assignment(s) and ${expected - t.length} teacher assignment(s) remaining.`;
        }
        return null;
    }
    // 
    return (
        <>
            {fetching ? <Loader /> :
                <form onSubmit={onClassPeriodsSave} className="my-5 flex flex-col">
                    <Section title={`Periods for ${selectedClass.classname}`}
                        description="Set the number of periods, then assign one subject and one teacher to each card.">
                        <TextInput input={{ name: 'period_count', label: 'Number of periods', type: 'number', required: true, placeholder: 'Example: 8' }}
                            value={data?.period_count} onChange={onChange} info="Maximum 15 periods." />
                    </Section>
                    <>
                        {data?.period_count > 0 ?
                            <>
                                <Typography variant="h5" className="my-2">
                                    Assign periods
                                </Typography>
                                <>
                                    {error &&
                                        <AttentionBox title={"Setup incomplete"} description={error} />
                                    }
                                </>
                                <Card className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 p-3 rounded-md bg-transparent shadow-default">
                                    {
                                        Array.from({ length: data?.period_count }, (_, index) => index + 1)
                                            .map((period, pi) => (
                                                <DashedBox key={pi} period={period}
                                                    subject={displayData.subjects?.[period]} teacher={displayData.teachers?.[period]}
                                                    onClick={handleSearchView} onReset={() => { onReset(period) }} />
                                            ))
                                    }
                                </Card>
                            </> :
                            <div className="rounded-lg border border-dashed border-blue-gray-200 bg-blue-gray-50/40 p-5 text-center text-blue-gray-600">
                                Enter the number of daily periods above to start assigning subjects and teachers.
                            </div>
                        }
                    </>
                    <>
                        <SearchDialog name={"subjects"} open={openSearch.view === SEARCH_VIEWS.subjects}
                            title={`Assign a subject · Period ${openSearch.period || ''}`} data={subjects} hideOptionsUntilSearch={false}
                            emptyMessage="No subjects are set up for this class yet. Add them from School setup → Courses & subjects → Subjects by class."
                            handler={handleSearchView} onSelect={(name, value) => {
                                onChange({ name, value });
                                handleSearchView('', '');
                            }} />
                        <SearchDialog name={"teachers"} open={openSearch.view === SEARCH_VIEWS.teachers}
                            title={`Assign a teacher · Period ${openSearch.period || ''}`} data={teachers} hideOptionsUntilSearch={false}
                            emptyMessage="No teachers are available yet. Enroll staff before assigning a period teacher."
                            handler={handleSearchView} onSelect={(name, value) => {
                                onChange({ name, value });
                                handleSearchView('', '');
                            }} />
                    </>
                    <ButtonsSecion className={"my-1"}>
                        <Button type="button" variant="outlined" onClick={() => {
                            onReset(null);
                        }}>Reset</Button>
                        <FormSaveButton saving={uploading} isUpdate={data?.id} />
                    </ButtonsSecion>
                </form>
            }
        </>
    )
}

function DashedBox({ period, subject, teacher, onClick, onReset }) {
    const complete = Boolean(subject && teacher);
    return (
        <div className={`relative rounded-lg border p-4 ${complete ? 'border-green-300 bg-green-50/40' : 'border-blue-gray-200 bg-white'}`}>
            <button type="button" aria-label={`Clear period ${period}`} title="Clear this period"
                className="absolute right-2 top-2 rounded p-1 text-blue-gray-500 hover:bg-blue-gray-100 hover:text-red-600"
                onClick={onReset}>
                <XMarkIcon className="h-5 w-5" />
            </button>
            <div className="flex flex-col gap-3">
                <span className={`flex items-center gap-2 text-lg font-bold ${complete ? 'text-green-700' : 'text-blue-gray-800'}`}>
                    {complete && <CheckBadgeIcon className="h-6 w-6" />}
                    Period {period}
                </span>
                <PeriodChoice label="Subject" value={subject} action="Choose subject"
                    onClick={() => onClick(SEARCH_VIEWS.subjects, period)} />
                <PeriodChoice label="Teacher" value={teacher} action="Choose teacher"
                    onClick={() => onClick(SEARCH_VIEWS.teachers, period)} />
            </div>
        </div>
    )
}

function PeriodChoice({ label, value, action, onClick }) {
    return (
        <button type="button" onClick={onClick}
            className="w-full rounded-md border border-dashed border-blue-gray-300 px-3 py-2 text-left transition hover:border-blue-500 hover:bg-blue-50">
            <span className="block text-xs font-semibold uppercase tracking-wide text-blue-gray-500">{label}</span>
            <span className={`mt-0.5 block normal-case ${value ? 'font-semibold text-blue-gray-900' : 'text-blue-600'}`}>
                {value || action}
            </span>
        </button>
    );
}

export default ClassDetails;
