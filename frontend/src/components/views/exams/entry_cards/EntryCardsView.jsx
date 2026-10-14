import useRequestStatus from "@/hooks/requestStatus";
import { Fragment, useEffect, useRef, useState } from "react";
import EntryCard from "./EntryCard";
import Loader from "@/components/Loader";
import { useAppContext } from "@/contexts/AppContext";
import NotFound from "@/components/NotFound";
import { fetchExamSchedule } from "@/services/functions/exams/examSchedule";
import scheduleAsArray from "@/methods/exams/scheduleAsArray.js";
import { fetchClassPeriodSubjects } from "@/services/functions/classes";
import { ButtonsSecion, Section } from "@/components/sections";
import { Button } from "@material-tailwind/react";
import { useReactToPrint } from "react-to-print";
import ExamInput from "@/components/inputs/ExamInput";
import { OPTION_ALL, SearchInput, SelectInput, TextInput } from "@/components/inputs";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { ENTRY_CARD_VIEW_OPTIONS, LAYOUT_STYLES } from "./layouts";

const inputSchema = { students: [], student: '', note: '', view: 1 };
function EntryCardsView({ selectedClass, students, schoolProfile }) {
    const { user: { user }, fiscalYear: { year } } = useAppContext();
    const [selectedExam, setSelectExam] = useState('');
    const [examName, setExamName] = useState('');
    const [schedule, setSchedule] = useState({});
    const [studentCards, setStudentCards] = useState({});
    const [studentImages, setStudentImages] = useState({});
    const [input, setInput] = useState({ ...inputSchema });
    const { fetching, statusHandler } = useRequestStatus();
    // 
    const cardsRef = useRef(null);
    // 
    const printEntryCards = useReactToPrint({
        content: () => cardsRef.current
    });
    // 
    function onExamSelect({ _, value, examName }) {
        setSelectExam(value);
        setExamName(examName);
    }
    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }
    async function prefetchImages(paths) {
        const images = {};
        const requests = paths.filter(path => path?.image)
            .map(async path => {
                try {
                    const imageURL = process.env.NEXT_PUBLIC_BASE_URL + '/media/' + path.image;
                    const res = await fetch(imageURL, { mode: 'no-cors' });
                    const blob = await res.blob();
                    images[path.id] = URL.createObjectURL(blob);
                } catch (e) { }
            });
        Promise.all(requests);
        setStudentImages(images);
    }
    async function prepareEntryCards(data, subjects, schedule) {
        await prefetchImages(data.map(({ id, image }) => ({ id, image })));
        return data
            .reduce((acc, std) => {
                const bill = {};
                bill["studentId"] = std.id;
                bill["studentName"] = std.name;
                bill["rollNo"] = std.roll_no;
                bill["symbolNo"] = std.symbol_no;
                bill["regdNo"] = std.regd_no;
                bill["time"] = `${schedule?.start_time || ''} to ${schedule?.end_time || ''}`
                bill["schedule"] = scheduleAsArray(subjects, schedule?.schedule || {});
                bill["studentImage"] = std?.image || '';
                acc.push(bill);
                return acc;
            }, []);
    }
    // 
    function updateSchedule(cls, exam, data) {
        setSchedule(state => {
            const ns = { ...state };
            ns[cls] = ns?.[cls] || {};
            ns[cls][exam] = data;
            return ns;
        });
    }
    function updateStudentCards(cls, exam, data) {
        setStudentCards(state => {
            const ns = { ...state };
            ns[cls] = ns?.[cls] || {};
            ns[cls][exam] = data;
            return ns;
        });
    }
    async function displayEntryCards(e) {
        e.preventDefault();
        if (selectedExam && selectedClass?.class_info?.id) {
            statusHandler.toggleFetching();
            let _schedule = await fetchExamSchedule(selectedClass.class_info.id, selectedExam);
            if (_schedule) {
                const strict = selectedClass?.class_info?.section ? true : false;
                const { data: _subjects } = await fetchClassPeriodSubjects(selectedClass.class_info.id, true, '', '', strict, true);
                const _studentCards = await prepareEntryCards(students, _subjects, _schedule);
                updateStudentCards(selectedClass.class_info.id, selectedExam, _studentCards);
                updateSchedule(selectedClass.class_info.id, selectedExam, _schedule);
            } else {
                updateStudentCards(selectedClass.class_info.id, selectedExam, []);
                updateSchedule(selectedClass.class_info.id, selectedExam, {});
            }
            statusHandler.toggleFetching();
        }
    }
    useEffect(() => {
        setInput(state => ({
            ...state, students: students.reduce((acc, std) => {
                acc.push({ name: std.name, value: std.id });
                return acc;
            }, [])
        }))
    }, [students]);
    // 
    return (
        <>
            <form onSubmit={displayEntryCards}>
                <Section>
                    <ExamInput academic_year={year.academic_year} schoolId={user?.profile?.school || user?.profile?.id}
                        value={selectedExam} onChange={onExamSelect} getExamName={true} />
                    <SearchInput input={{ name: 'student', label: 'Student', options: [OPTION_ALL, ...(input?.students || [])] }}
                        value={input?.student} onChange={onChange} />
                    <span></span>
                    <TextInput input={{ name: 'note', label: "Short note" }} value={input?.note} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton disabled={!selectedExam} custom={[fetching, "Display", "Displaying"]} />
                </ButtonsSecion>
            </form>
            <div className="my-5 flex flex-col">
                <Section>
                    <SelectInput input={{ name: 'view', label: "View", options: ENTRY_CARD_VIEW_OPTIONS }} value={input?.view} onChange={onChange} />
                </Section>
                <>
                    {fetching ? <Loader /> :
                        <>
                            {schedule?.[selectedClass?.class_info?.id]?.[selectedExam] ?
                                <>
                                    {
                                        studentCards?.[selectedClass?.class_info?.id]?.[selectedExam]?.length > 0 ?
                                            <>
                                                <div ref={cardsRef} id="entry-cards-view"
                                                    className={`${LAYOUT_STYLES?.[input?.view]} mx-5 print:mx-0 justify-start items-start gap-3`}>
                                                    {
                                                        (studentCards[selectedClass.class_info.id][selectedExam] || [])
                                                            .map((std, si) => (
                                                                <Fragment key={si}>
                                                                    {
                                                                        (!input?.student || std?.studentId === input?.student) &&
                                                                        <EntryCard card={std} profileImage={studentImages?.[std.id]}
                                                                            schoolProfile={schoolProfile} examName={examName} classname={selectedClass?.classname} note={input?.note || ''} />
                                                                    }
                                                                </Fragment>
                                                            ))
                                                    }
                                                </div>
                                                <ButtonsSecion>
                                                    <Button variant="outlined" onClick={printEntryCards}>Print</Button>
                                                </ButtonsSecion>
                                            </> :
                                            <NotFound />
                                    }
                                </> :
                                <NotFound error="No exam schedule found!" />
                            }
                        </>}
                </>
            </div>
        </>
    )
}

export default EntryCardsView;