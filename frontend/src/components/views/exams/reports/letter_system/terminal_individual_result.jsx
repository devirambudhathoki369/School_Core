import Loader from "@/components/Loader";
import { OPTION_ALL, SearchInput, SelectInput } from "@/components/inputs";
import ChooseClass from "@/components/inputs/ChooseClass";
import ExamInput from "@/components/inputs/ExamInput";
import { ButtonsSecion, Section } from "@/components/sections";
import { selectAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { fetchExamResults } from "@/services/functions/exams/results";
import { searchStudents } from "@/services/functions/students";
import { Button } from "@material-tailwind/react";
import { useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { fetchGradingRules } from "@/services/functions/exams/gradingRules";
import { GRADING_RULE_TYPES } from "../../setups/grading_rules";
import NotFound from "@/components/NotFound";
import ResultViewFilters, { filtersSchema } from "../ResultViewFilters";
import { LGSResultPrep, VIEWS } from "./LGSResultPrep";
import ResultCardLGS from "./ResultCardLGS";
import ClosedAcademicYearSelectInput from "@/components/inputs/ClosedAcademicYearSelectInput";
import useClosedAcademicYear from "@/hooks/closedAcademicYear";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";

const inputSchema = { exam: '', student: '', student_status: '' };
function LGSTerminalIndividualResult() {
    const { user: { user },
        fiscalYear: { year, getYearFromAcademicYear },
        notification: { updateNotification } } = useAppContext();
    const [selectedClass, setSelectedClass] = useState('');
    const [examName, setExamName] = useState('');
    const [students, setStudents] = useState([]);
    const [data, setData] = useState({ ...inputSchema });
    const [result, setResult] = useState({});
    const [remarks, setRemarks] = useState({});
    const { fetching, searching, statusHandler } = useRequestStatus();
    const [view, setView] = useState('');
    const [filters, setFilters] = useState({ ...filtersSchema });
    const [isHigherSecondaryResult, setIsHigherSecondaryResult] = useState(null);
    const [showSubjectCodes, setShowSubjectCodes] = useState(false);
    // Which of the two documents is on screen. Both are built from exactly the
    // same fetched result — only the wording of the printed sheet differs — so
    // switching between them costs nothing once the data is loaded.
    const [reportVariant, setReportVariant] = useState("gradesheet");
    const { closedAcademicYear, onClosedAcademicYearSelect, resetClosedAcademicYear } = useClosedAcademicYear();

    const resultRef = useRef(null);
    const printResult = useReactToPrint({
        content: () => resultRef.current,
    });

    function onReset() {
        setResult({});
        setView('');
    }

    function onSelect(action, id, item) {
        setSelectedClass(item);
        resetClosedAcademicYear();
    }
    const onChange = ({ name, value }) => {
        setData(state => ({ ...state, [name]: value }));
    }
    function onFilterChange({ name, value }) {
        setFilters(state => ({ ...state, [name]: value }));
    }

    function onExamSelect({ name, value, examName }) {
        setExamName(examName);
        onChange({ name, value });
    }

    async function fetchStudentReult() {
        if (!data?.exam) {
            updateNotification('', "Please select exam!");
            return;
        }
        statusHandler.toggleFetching();
        let result = await fetchExamResults(selectedClass.class_info.id, data.exam, null, data.student, "letter", null, null, null, closedAcademicYear || year?.academic_year, null, data?.student_status);
        if (result?.status === 404) {
            updateNotification(result.status, result.message);
            statusHandler.toggleFetching();
            return;
        }
        if (result) {
            let _remarks;
            if (!remarks?.id) {
                _remarks = await fetchGradingRules(user?.profile?.school || user?.profile?.id, GRADING_RULE_TYPES.grading);
                setRemarks(_remarks);
            }
            // 
            const examYear = getYearFromAcademicYear(closedAcademicYear || year?.academic_year);
            const examIds = [data.exam];
            const tableData = LGSResultPrep.prepareGradesheet(result, _remarks || remarks || {}, selectedClass?.classname, examName, examYear, examIds, false, students);
            const {
                _view, _isHigherSecondaryResult, _showSubjectCodes,
                _result
            } = tableData;
            setIsHigherSecondaryResult(_isHigherSecondaryResult);
            setShowSubjectCodes(_showSubjectCodes);
            setView(_view);
            setResult(_result);
        }
        statusHandler.toggleFetching();
    }

    async function loadStudents() {
        const acay = closedAcademicYear || year?.academic_year;
        if (selectedClass?.class_info?.id && acay) {
            setStudents([]);
            setView('');
            (async () => {
                statusHandler.toggleSearching();
                let [status, msg, _students] = await searchStudents({
                    school: user?.profile?.school || user?.profile?.id,
                    class_info: selectedClass.class_info.id,
                    result_academic_year: closedAcademicYear,
                    status: data?.student_status,
                });
                if (_students) {
                    updateNotification(200, "Students search completed!");
                    _students = _students.reduce((acc, std, index) => {
                        acc.push({ name: std?.name, value: std?.id });
                        return acc;
                    }, []);
                    setStudents(_students);
                } else {
                    updateNotification(status, msg);
                    setStudents([]);
                }
                statusHandler.toggleSearching();
            })();
        }
    }

    return (
        <>
            <ChooseClass selectedClass={selectedClass} actions={[selectAction]} onSelect={onSelect}>
                <div className="my-5 flex flex-col">
                    <>
                        <Section title={"Enter exam details"} description={"Select the exam!"}>
                            <ClosedAcademicYearSelectInput value={closedAcademicYear} onChange={onClosedAcademicYearSelect} />
                            <ExamInput academic_year={closedAcademicYear || year?.academic_year} schoolId={user?.profile?.school || user?.profile?.id}
                                value={data?.exam} onChange={onExamSelect} getExamName={true} />
                            <SelectInput input={{ name: "student_status", label: "Student Status", options: STUDENT_STATUS_OPTIONS }}
                                value={data?.student_status} onChange={onChange} />
                        </Section>
                        <ButtonsSecion className="!justify-start">
                            <Button variant="outlined" color="teal" className="w-full sm:w-auto"
                                onClick={loadStudents} disabled={!data?.exam}>
                                {searching ? "Searching..." : "Search students"}
                            </Button>
                        </ButtonsSecion>
                        <Section title={"Select student"}>
                            <SearchInput value={data?.student} onChange={onChange}
                                input={{ name: 'student', label: 'Student', options: [OPTION_ALL, ...students], readOnly: fetching }} />
                        </Section>
                        <ResultViewFilters filters={filters} onFilterChange={onFilterChange}
                            action={
                                <>
                                    <Button color="teal" variant={reportVariant === "gradesheet" ? "filled" : "outlined"}
                                        className="w-full sm:w-auto py-3 px-6"
                                        disabled={fetching || !data?.exam}
                                        onClick={() => { setReportVariant("gradesheet"); fetchStudentReult(); }}>
                                        {fetching && reportVariant === "gradesheet" ? "Loading..." : "Show Grade-sheet"}
                                    </Button>
                                    <Button color="teal" variant={reportVariant === "progress" ? "filled" : "outlined"}
                                        className="w-full sm:w-auto py-3 px-6"
                                        disabled={fetching || !data?.exam}
                                        onClick={() => { setReportVariant("progress"); fetchStudentReult(); }}>
                                        {fetching && reportVariant === "progress" ? "Loading..." : "Show Progress Report"}
                                    </Button>
                                </>
                            } />
                    </>
                    <>
                        {(data?.exam && view) ?
                            <>
                                {
                                    fetching ? <Loader /> :
                                        <>
                                            <div className="mt-5">
                                                <ButtonsSecion>
                                                    <Button className="py-2 px-4 h-max" variant="outlined" onClick={printResult}>Print</Button>
                                                    {/* <Button className="py-2 px-4 h-max" variant="outlined">Export</Button> */}
                                                </ButtonsSecion>
                                                <div ref={resultRef} className="w-full flex flex-col">
                                                    {(view === VIEWS.SINGLE && result?.[data.student]?.result) ?
                                                        <>
                                                            <ResultCardLGS student={result?.[data.student]?.student || {}} result={result[data.student]?.result || []}
                                                                summary={result?.[data.student]?.summary || {}} remarks={remarks?.rules || []} issueDate={user?.today || ''} filters={filters}
                                                                isHigherSecondaryResult={isHigherSecondaryResult} showSubjectCodes={showSubjectCodes} variant={reportVariant} />
                                                        </>
                                                        :
                                                        <>
                                                            {
                                                                (students || []).map(({ value: stdId }) => (
                                                                    <ResultCardLGS key={stdId} student={result?.[stdId]?.student || {}} result={result?.[stdId]?.result || []}
                                                                        summary={result?.[stdId]?.summary || {}} remarks={remarks?.rules || []} issueDate={user?.today || ''} filters={filters}
                                                                        isHigherSecondaryResult={isHigherSecondaryResult} showSubjectCodes={showSubjectCodes} variant={reportVariant} />
                                                                ))
                                                            }
                                                        </>}
                                                </div>
                                            </div>
                                        </>
                                }
                            </> :
                            <NotFound error="No result found!" />
                        }
                    </>
                </div>
            </ChooseClass >
        </>
    )
}

export default LGSTerminalIndividualResult;