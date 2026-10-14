import Loader from "@/components/Loader";
import { OPTION_ALL, SearchInput, SelectInput } from "@/components/inputs";
import ChooseClass from "@/components/inputs/ChooseClass";
import { ButtonsSecion, Section } from "@/components/sections";
import ReportHeader from "@/components/tables/ReportHeader";
import { selectAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { fetchExamResults } from "@/services/functions/exams/results";
import { searchStudents } from "@/services/functions/students";
import { Button, Card, Typography } from "@material-tailwind/react";
import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { fetchGradingRules } from "@/services/functions/exams/gradingRules";
import { GRADING_RULE_TYPES } from "../../setups/grading_rules";
import NotFound from "@/components/NotFound";
import Signatures from "../Signatures";
import WaterMark from "../WaterMark";
import GradingGuide from "../letter_system/GradingGuide";
import ResultCardStudentInfo from "../ResultCardStudentInfo";
import Warning from "@/components/Warning";
import ResultViewFilters, { filtersSchema } from "../ResultViewFilters";
import CombinedResultPrep from "./CombinedResultPrep";
import FailedStar from "../FailedStar";
import useClosedAcademicYear from "@/hooks/closedAcademicYear";
import ClosedAcademicYearSelectInput from "@/components/inputs/ClosedAcademicYearSelectInput";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";
import useDocumentStyle from "@/hooks/documentStyle";

const isFinalResult = true;
const examName = "Final Result";
const VIEWS = { SINGLE: 1, BULK: 2 };
const inputSchema = { exam: '', student_status: '', student: '', type: '' };

function CombinedMarksheetFinal() {
    const { user: { user },
        fiscalYear: { year, getYearFromAcademicYear },
        notification: { updateNotification } } = useAppContext();
    const [selectedClass, setSelectedClass] = useState('');
    const [students, setStudents] = useState([]);
    const [data, setData] = useState({ ...inputSchema });
    const [result, setResult] = useState({});
    const [remarks, setRemarks] = useState({});
    const [divisions, setDivisions] = useState({});
    const [divisionGuide, setDivisionGuide] = useState([]);
    const { fetching, searching, statusHandler } = useRequestStatus();
    const [view, setView] = useState('');
    const [filters, setFilters] = useState({ ...filtersSchema });
    const [isHigherSecondaryResult, setIsHigherSecondaryResult] = useState(null);
    const { closedAcademicYear, onClosedAcademicYearSelect, resetClosedAcademicYear } = useClosedAcademicYear();

    const schoolId = user?.profile?.school || user?.profile?.id;

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

    async function fetchStudentReult() {
        statusHandler.toggleFetching();
        let result = await fetchExamResults(selectedClass.class_info.id, null, null, data.student, '', '', '', '', closedAcademicYear || year?.academic_year, schoolId, data?.student_status);
        if (result?.status === 404) {
            updateNotification(result.status, result.message);
            statusHandler.toggleFetching();
            return;
        }
        if (result) {
            let _remarks, _divisions;
            if (!remarks?.id) {
                const grading_rules_type = data?.type === "per" ? GRADING_RULE_TYPES.number : GRADING_RULE_TYPES.grading;
                _remarks = await fetchGradingRules(user?.profile?.school || user?.profile?.id, grading_rules_type);
                setRemarks(_remarks);
            }
            if (!divisions?.id) {
                _divisions = await fetchGradingRules(user?.profile?.school || user?.profile?.id, GRADING_RULE_TYPES.division);
                setDivisions(_divisions);
                const _divisionGuide = [];
                (_divisions?.rules || []).map((rule) => {
                    const percentage = `${rule?.min} - ${rule?.max}`, division = rule.remarks;
                    _divisionGuide.push({ percentage, division });
                })
                setDivisionGuide(_divisionGuide);
            }
            //
            if (result) {
                const examYear = getYearFromAcademicYear(closedAcademicYear || year?.academic_year);
                const examIds = Object.keys(result?.exams || {});
                const {
                    _view, _isHigherSecondaryResult,
                    _result
                } = CombinedResultPrep.prepareCombinedMarkSheet(result, data?.type, _remarks || remarks, _divisions || divisions, selectedClass?.classname, examName, examYear, examIds, isFinalResult, students);
                // console.log(_result);
                setView(_view);
                setIsHigherSecondaryResult(_isHigherSecondaryResult);
                setResult(_result);
            }
        }
        statusHandler.toggleFetching();
    }
    function resetSearch() {
        setData({ ...inputSchema });
        setFilters({ ...filtersSchema });
        onReset();
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
                    _students = _students.reduce((acc, std, index) => {
                        acc.push({ name: std?.name, value: std?.id });
                        return acc;
                    }, []);
                    setStudents(_students);
                    updateNotification(200, "Student search completed!");
                } else {
                    setStudents([]);
                    updateNotification(status, msg);
                }
                statusHandler.toggleSearching();
            })();
        }
    }

    useEffect(() => {
        setRemarks({});
    }, [data?.type]);

    return (
        <>
            <ChooseClass selectedClass={selectedClass} actions={[selectAction]} onSelect={onSelect}>
                <div className="my-5 flex flex-col">
                    <>
                        <Section title={"Enter details"}>
                            <ClosedAcademicYearSelectInput value={closedAcademicYear} onChange={onClosedAcademicYearSelect} />
                            <SelectInput input={{ name: "student_status", label: "Student Status", options: STUDENT_STATUS_OPTIONS }}
                                value={data?.student_status} onChange={onChange} />
                            <SelectInput value={data?.type} onChange={onChange}
                                input={{
                                    name: 'type', label: "Percentage or GPA", readOnly: data?.type,
                                    options: [{ name: 'Percentage', value: 'per' }, { name: 'GPA', value: 'gpa' }]
                                }} />
                        </Section>
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={loadStudents}>
                                {searching ? "Searching..." : "Search"}
                            </Button>
                        </ButtonsSecion>
                        <Section title={"Select student"}>
                            <SearchInput value={data?.student} onChange={onChange}
                                input={{ name: 'student', label: 'Student', options: [OPTION_ALL, ...students], readOnly: fetching }} />
                        </Section>
                        <ResultViewFilters filters={filters} onFilterChange={onFilterChange} />
                        <Warning warning={"Select Percentage or GPA before search!"} />
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={resetSearch}>Reset</Button>
                            <Button variant="outlined" onClick={fetchStudentReult} disabled={!data?.type || fetching}>
                                {fetching ? "Loading..." : "Display"}</Button>
                        </ButtonsSecion>
                    </>
                    <>
                        {view ?
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
                                                    {
                                                        (view === VIEWS.SINGLE && result?.[data.student]) ?
                                                            <>
                                                                <ResultCardCR student={result?.[data.student]?.student || {}} result={result?.[data.student]?.result || []}
                                                                    summary={result?.[data.student]?.summary || {}} divisionGuide={divisionGuide} remarks={remarks?.rules || []}
                                                                    issueDate={user?.today || ''} searchData={data} filters={filters} isHigherSecondaryResult={isHigherSecondaryResult} />
                                                            </>
                                                            :
                                                            <>
                                                                {
                                                                    (students || []).map(({ value: stdId }) => (
                                                                        <ResultCardCR key={stdId} student={result?.[stdId]?.student || {}} result={result?.[stdId]?.result || []}
                                                                            summary={result?.[stdId]?.summary || {}} divisionGuide={divisionGuide} remarks={remarks?.rules || []}
                                                                            issueDate={user?.today || ''} searchData={data} filters={filters} isHigherSecondaryResult={isHigherSecondaryResult} />
                                                                    ))
                                                                }
                                                            </>
                                                    }
                                                </div>
                                            </div>
                                        </>
                                }
                            </> :
                            <NotFound error="No result found!" />
                        }
                    </>
                </div>
            </ChooseClass>
        </>
    )
}

function ResultCardCR({ student, result, summary, remarks, profileImage, divisionGuide, issueDate, searchData, filters, isHigherSecondaryResult = null }) {
    const { user: { user } } = useAppContext();
    // Presentation only — never touches what is printed.
    const docStyle = useDocumentStyle("marksheet_combined");
    return (
        <>
            <div className={`flex flex-col w-[80%] print:w-screen mx-auto bg-white border-2 border-black border-solid print:h-screen print-border relative overflow-hidden ${docStyle.className}`}
                    style={docStyle.css}
                onContextMenu={(e) => { e.preventDefault() }}>
                <div className="m-5">
                    <ReportHeader hidden={false} documentKey="marksheet_combined" title="MARKS-SHEET" />
                    <Card className="shadow-none text-center">
                        {!docStyle.className && <Typography color="black" variant="h3">MARKS-SHEET</Typography>}
                        <div className="text-black font-semibold mt-2 px-10">
                            <ResultCardStudentInfo reportType={"MARKS"} student={student} profileImage={profileImage} filters={filters} />
                            <div className="py-2">
                                <table className="result">
                                    <>
                                        {isHigherSecondaryResult === true ?
                                            <thead>
                                                <tr>
                                                    <th rowSpan={2}>S.N</th>
                                                    <th rowSpan={2} className="w-[14rem] max-w-[14rem]">SUBJECTS</th>
                                                    <th colSpan={2} >FULL <br /> MARKS</th>
                                                    <th colSpan={2}>PASS <br /> MARKS</th>
                                                    <th colSpan={2}>OBTAINED <br /> MARKS</th>
                                                    <th rowSpan={2}>TOTAL</th>
                                                    <th rowSpan={2}>GRADE</th>
                                                    <th rowSpan={2}>GRADE <br /> POINT</th>
                                                    <th rowSpan={2}>REMARKS</th>
                                                </tr>
                                                <tr>
                                                    <th>TH.</th>
                                                    <th>{filters?.practical}</th>
                                                    <th>TH.</th>
                                                    <th>{filters?.practical}</th>
                                                    <th>TH.</th>
                                                    <th>{filters?.practical}</th>
                                                </tr>
                                            </thead>
                                            :
                                            // -----
                                            <thead>
                                                <tr>
                                                    <th rowSpan={2}>S.N</th>
                                                    <th rowSpan={2} className="w-[15rem] max-w-[15rem]">SUBJECTS</th>
                                                    <th rowSpan={2}>FULL <br /> MARKS</th>
                                                    <th rowSpan={2}>PASS <br /> MARKS</th>
                                                    <th colSpan={2}>OBTAINED <br /> MARKS</th>
                                                    <th rowSpan={2}>TOTAL</th>
                                                    <th rowSpan={2}>GRADE</th>
                                                    <th rowSpan={2}>GRADE <br /> POINT</th>
                                                    <th rowSpan={2}>REMARKS</th>
                                                </tr>
                                                <tr>
                                                    <th>TH.</th>
                                                    <th>{filters?.practical}</th>
                                                </tr>
                                            </thead>
                                        }
                                    </>
                                    <>
                                        {isHigherSecondaryResult === true ?
                                            <tbody>
                                                {
                                                    result?.map((res, ri) => (
                                                        <tr key={ri}>
                                                            <td>{ri + 1}</td>
                                                            <td className="capitalize text-[1.1rem] text-left font-semibold">{res?.subject || ''}</td>
                                                            <td>{res?.criteria?.fm_th || ''}</td>
                                                            <td>{res?.criteria?.fm_pr || ''}</td>
                                                            <td>{res?.criteria?.pm_th || ''}</td>
                                                            <td>{res?.criteria?.pm_pr || ''}</td>
                                                            <td>{res?.theory || ''}</td>
                                                            <td>{res?.practical || ''}</td>
                                                            <td>{res?.total || ''}</td>
                                                            <td>{res?.grade || ''}</td>
                                                            <td>{res?.gp || 0}</td>
                                                            <td>{res?.isFail ? <FailedStar /> : ''}</td>
                                                        </tr>
                                                    ))
                                                }
                                                <>
                                                    <tr>
                                                        <td colSpan={7} rowSpan={4} className="capitalize text-left">
                                                            Remarks : {summary?.remarks || ''}
                                                        </td>
                                                        <td colSpan={3}>Total </td>
                                                        <td colSpan={2}>{summary?.total || ''}</td>
                                                    </tr>
                                                    <>
                                                        {searchData?.type === "per" &&
                                                            <tr>
                                                                <td colSpan={3}>Percentage </td>
                                                                <td colSpan={2}>{summary?.percentage || ''}</td>
                                                            </tr>
                                                        }
                                                        {searchData?.type === "gpa" &&
                                                            <tr>
                                                                <td colSpan={3}>GPA </td>
                                                                <td colSpan={2}>{summary?.gpa || ''}</td>
                                                            </tr>
                                                        }
                                                    </>
                                                    <tr className="capitalize">
                                                        <td colSpan={3}>Result </td>
                                                        <td colSpan={2}>{summary?.position || ''}</td>
                                                    </tr>
                                                    <tr>
                                                        <td colSpan={3}>Attendance </td>
                                                        <td colSpan={2}>{summary?.attendance || ''}</td>
                                                    </tr>
                                                </>
                                            </tbody> :
                                            // -------------
                                            <tbody>
                                                {
                                                    result?.map((res, ri) => (
                                                        <tr key={ri}>
                                                            <td>{ri + 1}</td>
                                                            <td className="capitalize text-[1.1rem] text-left font-semibold">{res?.subject || ''}</td>
                                                            <td>{res?.criteria?.fm || ''}</td>
                                                            <td>{res?.criteria?.pm || ''}</td>
                                                            <td>{res?.theory || ''}</td>
                                                            <td>{res?.practical || ''}</td>
                                                            <td>{res?.total || ''}</td>
                                                            <td>{res?.grade || ''}</td>
                                                            <td>{res?.gp || 0}</td>
                                                            <td>{res?.isFail ? <FailedStar /> : ''}</td>
                                                        </tr>
                                                    ))
                                                }
                                                <>
                                                    <tr>
                                                        <td colSpan={5} rowSpan={4} className="capitalize text-left">
                                                            Remarks : {summary?.remarks || ''}
                                                        </td>
                                                        <td colSpan={3}>Total </td>
                                                        <td colSpan={2}>{summary?.total || ''}</td>
                                                    </tr>
                                                    <>
                                                        {searchData?.type === "per" &&
                                                            <tr>
                                                                <td colSpan={3}>Percentage </td>
                                                                <td colSpan={2}>{summary?.percentage || ''}</td>
                                                            </tr>
                                                        }
                                                        {searchData?.type === "gpa" &&
                                                            <tr>
                                                                <td colSpan={3}>GPA </td>
                                                                <td colSpan={2}>{summary?.gpa || ''}</td>
                                                            </tr>
                                                        }
                                                    </>
                                                    <tr className="capitalize">
                                                        <td colSpan={3}>Result </td>
                                                        <td colSpan={2}>{summary?.position || ''}</td>
                                                    </tr>
                                                    <tr>
                                                        <td colSpan={3}>Attendance </td>
                                                        <td colSpan={2}>{summary?.attendance || ''}</td>
                                                    </tr>
                                                </>
                                            </tbody>
                                        }
                                    </>
                                </table>
                                {
                                    summary?.extra_activities?.length > 0 &&
                                    <table className="w-full my-3 result">
                                        <thead>
                                            <th>Extra Activities</th>
                                            <th>Remarks</th>
                                        </thead>
                                        <tbody>
                                            {
                                                summary.extra_activities.map((ea, ai) => (
                                                    <tr key={ai}>
                                                        <td className="capitalize">{ea.name}</td>
                                                        <td className="capitalize">{ea.data}</td>
                                                    </tr>
                                                ))
                                            }
                                        </tbody>
                                    </table>
                                }
                                <div className="w-[95%] h-max mx-auto mt-3 grid grid-cols-3 gap-x-1 items-start">
                                    <table className="sm:col-span-1 result my-3 h-full">
                                        <thead>
                                            <tr>
                                                <th>Percentage</th>
                                                <th>Division</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {
                                                (divisionGuide || []).map((guide, gi) => (
                                                    <tr key={gi}>
                                                        <td>{guide?.percentage || ''}</td>
                                                        <td>{guide?.division || ''}</td>
                                                    </tr>
                                                ))
                                            }
                                        </tbody>
                                    </table>
                                    <div className="sm:col-span-2">
                                        <GradingGuide remark_rules={remarks} resultType={searchData?.type || null} />
                                    </div>
                                </div>
                                <Signatures schoolProfile={user?.profile || {}} issueDate={issueDate} />
                            </div>
                        </div>
                    </Card >
                </div>
                {docStyle.showWatermark && <WaterMark name={user?.profile?.school_name || user?.profile?.name} />}
            </div >
        </>
    )
}

export default CombinedMarksheetFinal;