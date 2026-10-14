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
        else setData(state => ({ ...state, [name]: value }));
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
        } else updateNotification('', "Invalid input!");
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
        const t = Object.values(teachers || {});
        const s = Object.values(subjects || {});
        // count mismatch
        if (t.length !== period_count || s.length !== period_count) {
            return `Invalid count! teachers ${t.length}, subjects ${s.length}, expected ${period_count}`;
        }
        // duplicates
        function findDuplicatePeriods(arr) {
            const map = {};
            for (let i = 0; i < arr.length; i++) {
                const val = arr[i];
                if (!map[val]) map[val] = [];
                map[val].push(i + 1);
            }
            const dups = Object.values(map).filter(v => v.length > 1);
            return dups.flat();
        }

        const tDup = findDuplicatePeriods(t);
        const sDup = findDuplicatePeriods(s);
        if (tDup.length && sDup.length)
            return `Duplicate teachers in periods ${tDup.join(", ")} and duplicate subjects in periods ${sDup.join(", ")}.`;
        if (tDup.length)
            return `Duplicate teachers found in periods ${tDup.join(", ")}.`;
        if (sDup.length)
            return `Duplicate subjects found in periods ${sDup.join(", ")}.`;
        //   
        return null;
    }
    // 
    return (
        <>
            {fetching ? <Loader /> :
                <form onSubmit={onClassPeriodsSave} className="my-5 flex flex-col">
                    <Section title={"Manage Class details"}>
                        <TextInput input={{ name: 'period_count', label: 'No. of Period', type: 'number' }} value={data?.period_count} onChange={onChange} />
                    </Section>
                    <>
                        {data?.period_count > 0 ?
                            <>
                                <Typography variant="h5" className={`my-2 text-center`}>
                                    Periods
                                </Typography>
                                <>
                                    {error &&
                                        <AttentionBox title={"Warning"} description={error} />
                                    }
                                </>
                                <Card className="grid grid-cols-3 gap-3 p-3 rounded-md bg-transparent shadow-default">
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
                            <span className="text-red-500 text-base">Enter number of periods for class <span className="font-semibold text-lg capitalize">{selectedClass.classname}</span>!</span>
                        }
                    </>
                    <>
                        <SearchDialog name={"subjects"} open={openSearch.view === SEARCH_VIEWS.subjects}
                            title={"subjects"} data={subjects} hideOptionsUntilSearch={false}
                            handler={handleSearchView} onSelect={(name, value) => {
                                onChange({ name, value });
                                handleSearchView('', '');
                            }} />
                        <SearchDialog name={"teachers"} open={openSearch.view === SEARCH_VIEWS.teachers}
                            title={"teachers"} data={teachers}
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
    const classes = {
        dashed: "px-8 py-3 m-1 border border-dashed border-gray-700 rounded-sm flex justify-around items-center cursor-pointer uppercase"
    }
    return (
        <span className={`${classes.dashed} !p-2 relative`}>
            <>
                <button type="button" className="w-5 h-5 absolute top-0 right-0 hover:bg-gray-300"
                    onClick={onReset}>
                    <XMarkIcon className="icon" />
                </button>
            </>
            <div className="flex flex-col w-full">
                <span className={`flex items-center justify-center gap-x-2 text-lg font-bold ${(period && subject) && 'text-green-700'}`}>
                    {(period && subject) && <CheckBadgeIcon className="w-6 h-6" />}
                    Period {period}
                </span>
                <div className="flex flex-col m-3">
                    <span className={`${classes.dashed} ${subject && 'font-bold text-green-700'}`} onClick={() => { onClick(SEARCH_VIEWS.subjects, period) }}>
                        {subject || `Subject ${period}`}
                    </span>
                    <span className={`${classes.dashed} ${teacher && 'font-bold text-green-700'}`} onClick={() => { onClick(SEARCH_VIEWS.teachers, period) }}>
                        {teacher || `Teacher ${period}`}
                    </span>
                </div>
            </div>
        </span>
    )
}

export default ClassDetails;