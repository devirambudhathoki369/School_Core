import Loader from "@/components/Loader";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { fetchGradingRules } from "@/services/functions/exams/gradingRules";
import { fetchExamResults } from "@/services/functions/exams/results";
import { Fragment, useEffect, useRef, useState } from "react";
import { GRADING_RULE_TYPES } from "../../setups/grading_rules";
import ReportHeader from "@/components/tables/ReportHeader";
import ReportActionBar from "@/components/tables/ReportActionBar";
import { Button, Typography } from "@material-tailwind/react";
import { useReactToPrint } from "react-to-print";
import ChooseClass, { getKey } from "@/components/inputs/ChooseClass";
import { selectAction } from "@/components/tables/actions";
import useClassResult from "@/hooks/classResult";
import formatSubjectName from "@/methods/formatSubjectName";
import Signatures from "../Signatures";
import ResultViewFilters, { filtersSchema } from "../ResultViewFilters";
import showOnlyClass from "@/methods/showOnlyClass";
import { NSResultPrep } from "./NSResultPrep";
import { finalResultExam } from "../CommonResultPrep";
import ResultTypeInput, { ResultTypeOptions } from "../ResultTypeInput";
import useClosedAcademicYear from "@/hooks/closedAcademicYear";
import ClosedAcademicYearSelectInput from "@/components/inputs/ClosedAcademicYearSelectInput";
import { SelectInput } from "@/components/inputs";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";

function NSFinalClassResult() {
    const { user: { user },
        class: { classes },
        fiscalYear: { year, getYearFromAcademicYear },
        notification: { updateNotification } } = useAppContext();
    const [selectedClass, setSelectedClass] = useState('');
    const [filters, setFilters] = useState({ ...filtersSchema });
    const { closedAcademicYear, onClosedAcademicYearSelect, resetClosedAcademicYear } = useClosedAcademicYear();
    // 
    const schoolId = user?.profile?.school || user?.profile?.id;
    const {
        resultType, setResultType,
        data,
        subjects, setSubjects,
        totals, setTotals,
        studentResults, setStudentResults,
        remarks, setRemarks,
        divisions, setDivisions,
        extraActivities, setExtraActivities,
        summary, setSummary,
        extraActivitiesEntries, setExtraActivitiesEntries,
        methods: { onChange, onReset }
    } = useClassResult();
    const [examsBackup, setExamsBackup] = useState([]);
    const [exams, setExams] = useState([]);
    const { fetching, statusHandler } = useRequestStatus();
    // 
    function onSelect(action, id, item) {
        setSelectedClass(item);
        resetClosedAcademicYear();
    }
    function toggleExams(value, exams = null) {
        if (value) {
            setExams(exams || examsBackup);
        } else {
            setExams([finalResultExam]);
        }
    }
    function onFilterChange({ name, value }) {
        if (name === "termwise") { // filtersSchema.termwise;
            toggleExams(value);
        }
        setFilters(state => ({ ...state, [name]: value }));
    }
    // 
    const resultRef = useRef(null);
    const printResult = useReactToPrint({
        content: () => resultRef.current,
    });

    function getClassIds(resultType, class_info) {
        if (resultType === ResultTypeOptions["Classwise results"]) {
            const _key = getKey(class_info?.education_level, class_info?.grade, class_info?.course);
            const _classes = classes?.[_key] || [];
            return _classes.map(([, class_info,]) => class_info?.id);
        }
        return class_info?.id;
    }

    async function fetchClassResult() {
        statusHandler.toggleFetching();
        const classIds = getClassIds(resultType, selectedClass?.class_info || {});
        const result = await fetchExamResults(classIds, null, null, null, null, null, null, true, closedAcademicYear || year?.academic_year, schoolId, data?.student_status);
        if (result?.status === 404) {
            updateNotification(result.status, result.message);
            statusHandler.toggleFetching();
            return;
        }
        let _remarks, _divisions;
        if (!remarks?.id) {
            _remarks = await fetchGradingRules(user?.profile?.school || user?.profile?.id, GRADING_RULE_TYPES.number);
            setRemarks(_remarks);
        }
        if (!divisions?.id) {
            _divisions = await fetchGradingRules(user?.profile?.school || user?.profile?.id, GRADING_RULE_TYPES.division);
            setDivisions(_divisions);
        }
        // 
        if (result) {
            const examIds = Object.keys(result?.student_results || {});
            const _exams = Object.values(result?.exams || {})
                .filter(exam => examIds.includes(`${exam.id}`));
            toggleExams(filters?.termwise, _exams);
            setExamsBackup(_exams);
            const tableData = NSResultPrep.prepareClassLedger(result, _remarks || remarks, _divisions || divisions, examIds, true);
            const {
                _subjects, _totals,
                averages, total_students, average_total, average_percentage, average_attendance,
                _studentResults,
            } = tableData;
            // console.log(tableData);
            if (_studentResults?.length > 0) {
                setSubjects(_subjects);
                setTotals(_totals);
                setExtraActivities(result.extraActivities);
                setExtraActivitiesEntries(result.extraActivitiesEntries);
                setSummary(state => ({ ...state, averages, total_students, average_total, average_percentage, average_attendance }));
                setStudentResults(_studentResults);
            } else {
                setExams([]);
                updateNotification(500, "Something went wrong!");
            }
        }
        statusHandler.toggleFetching();
    }

    useEffect(() => {
        onReset();
        setFilters({ ...filtersSchema });
    }, [selectedClass?.class_info?.id]);
    useEffect(() => {
        onReset();
        setFilters({ ...filtersSchema });
        setStudentResults([]);
        resetClosedAcademicYear();
    }, [resultType]);
    // 
    return (
        <>
            <ResultTypeInput value={resultType} onChange={({ name, value }) => {
                setResultType(value);
            }} />
            <ChooseClass selectedClass={selectedClass} actions={[selectAction]} onSelect={onSelect}
                hideSections={resultType === ResultTypeOptions["Classwise results"]} disabled={!resultType}>
                <div className="my-2 flex flex-col">
                    <>
                        <Section>
                            <ClosedAcademicYearSelectInput value={closedAcademicYear} onChange={onClosedAcademicYearSelect} />
                            <SelectInput input={{ name: "student_status", label: "Student Status", options: STUDENT_STATUS_OPTIONS }}
                                value={data?.student_status} onChange={onChange} />
                        </Section>
                        <ResultViewFilters filters={filters} onFilterChange={onFilterChange} isFinalResult={true} />
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={fetchClassResult} disabled={fetching}>{fetching ? "Displaying..." : "Display"}</Button>
                        </ButtonsSecion>
                    </>
                    {fetching ? <Loader /> :
                        <>
                            {studentResults?.length > 0 ?
                                <>
                                    <ReportActionBar onPrint={printResult} reportRef={resultRef}
                                        exportName={`Final Class Result - ${showOnlyClass(selectedClass?.classname) || ''}`} />
                                    <div ref={resultRef} className="w-full flex flex-col bg-white py-2 rounded-sm">
                                        <ReportHeader />
                                        <div className="flex justify-between w-1/2 mx-auto capitalize">
                                            <Typography variant="h6">Class : {showOnlyClass(selectedClass?.classname) || ''}</Typography>
                                            <Typography variant="h6">Exam : {'Final Class Result'}</Typography>
                                            <Typography variant="h6">
                                                Year : {getYearFromAcademicYear(closedAcademicYear || year?.academic_year)}
                                            </Typography>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="result mt-2 w-max">
                                                <TableHeaderNS exams={exams} subjects={subjects} extraActivities={extraActivities} totals={totals} filters={filters} />
                                                <TableBodyNS studentResults={studentResults} summary={summary} exams={exams} subjects={subjects} extraActivities={extraActivities} filters={filters} />
                                            </table>
                                        </div>
                                        <Signatures schoolProfile={user?.profile || {}} issueDate={user?.today || ''} />
                                    </div>
                                </> :
                                <></>
                            }
                        </>
                    }
                </div>
            </ChooseClass>
        </>
    )
}

function ExamNamesHeaderNS({ exams, colSpan = 1 }) {
    return (
        <Fragment>
            {
                exams.map((exam, ei) => (
                    <Fragment key={ei}>
                        <th colSpan={colSpan} className="uppercase">{exam.name}</th>
                    </Fragment>
                ))
            }
        </Fragment>
    )
}

function TableHeaderNS({ exams = [], subjects = [], extraActivities = [], totals = {}, filters }) {
    const subColSpan = 3 * (exams?.length || 1);
    return (
        <thead>
            <tr>
                {filters?.roll_no && <th rowSpan={5}>Roll No.</th>}
                {filters?.symbol_no && <th rowSpan={5}>Symbol No.</th>}
                {filters?.regd_no && <th rowSpan={5}>Registration No.</th>}
                <th rowSpan={5}>Name</th>
                <th></th>
                {filters?.subjectwise_result &&
                    <>
                        {
                            subjects.map((subject, si) => {
                                const subjectname = formatSubjectName(subject.subject);
                                return (
                                    <th key={si} className="capitalize whitespace-pre" colSpan={subColSpan}>{subjectname}</th>
                                )
                            })
                        }
                    </>
                }
                <th rowSpan={5}>Total</th>
                <th rowSpan={5}>%</th>
                <th rowSpan={5}>Att</th>
                {/* extra-activities-headers-here */}
                <th rowSpan={5}>Remarks</th>
                <th rowSpan={5}>Result</th>
                <th rowSpan={5} className="whitespace-pre">Position</th>
                {/* <th rowSpan={5} className="whitespace-pre">Position {'\n'} in {'\n'} section</th> */}
                {/* <th rowSpan={5} className="whitespace-pre">Position {'\n'} in {'\n'} class</th> */}
            </tr>
            {filters?.subjectwise_result &&
                <>
                    {/* subjects and exams */}
                    <tr>
                        <th></th>
                        <>
                            {
                                subjects.map((_, si) => (
                                    // colSpan: 3 for th,pr,total.
                                    <ExamNamesHeaderNS key={si} exams={exams} colSpan={3} />
                                ))
                            }
                        </>
                    </tr>
                    {/* Th, Pr/In, Total */}
                    <tr>
                        <th></th>
                        <>
                            {
                                subjects.map((_, si) => (
                                    <Fragment key={si}>
                                        {
                                            exams.map((_, ei) => (
                                                <Fragment key={ei}>
                                                    <th>Th.</th>
                                                    <th>{filters?.practical}</th>
                                                    <th>Total</th>
                                                </Fragment>
                                            ))
                                        }
                                    </Fragment>
                                ))
                            }
                        </>
                    </tr>
                    {/* FM */}
                    <tr>
                        <th>F.M.</th>
                        <>
                            {
                                subjects.map((subject, si) => (
                                    <Fragment key={si}>
                                        {
                                            exams.map((exam, ei) => {
                                                const { fm, fm_th, fm_pr } = subject?.criteria?.[exam.id] || {};
                                                return (
                                                    <Fragment key={ei}>
                                                        <th>{fm_th || ''}</th>
                                                        <th>{fm_pr || ''}</th>
                                                        <th>{fm || ''}</th>
                                                    </Fragment>
                                                )
                                            })
                                        }
                                    </Fragment>
                                )
                                )
                            }
                        </>
                    </tr>
                    {/* PM */}
                    <tr>
                        <th>P.M.</th>
                        <>
                            {
                                subjects.map((subject, si) => (
                                    <Fragment key={si}>
                                        {
                                            exams.map((exam, ei) => {
                                                const { pm, pm_th, pm_pr } = subject?.criteria?.[exam.id] || {};
                                                return (
                                                    <Fragment key={ei}>
                                                        <th>{pm_th || ''}</th>
                                                        <th>{pm_pr || ''}</th>
                                                        <th>{pm || ''}</th>
                                                    </Fragment>
                                                )
                                            }
                                            )
                                        }
                                    </Fragment>
                                )
                                )
                            }
                        </>
                    </tr>
                </>
            }
        </thead>
    )
}

function TableBodyNS({ studentResults = [], summary, exams = [], subjects = [], extraActivities = [], filters }) {
    return (
        <tbody>
            {
                (studentResults || []).map((stdResult, si) => {
                    return (
                        <tr key={si} >
                            {filters?.roll_no &&
                                <td>{filters?.autofill_roll_no ?
                                    stdResult?.custom_roll_no :
                                    stdResult?.roll_no || ''}
                                </td>
                            }
                            {filters?.symbol_no && <td>{stdResult?.symbol_no || ''}</td>}
                            {filters?.regd_no && <td>{stdResult?.regd_no || ''}</td>}
                            <td colSpan={2} className="capitalize" style={{
                                color: stdResult?.color || '',
                            }}>{stdResult?.name || ''}</td>
                            {filters?.subjectwise_result &&
                                <>
                                    {
                                        subjects.map((subject, si) => (
                                            <Fragment key={si}>
                                                {
                                                    exams.map((exam, ei) => {
                                                        const examId = exam.id;
                                                        const subjectResult = stdResult?.[examId]?.[subject.id] || {};
                                                        const subjectCriteria = subject?.criteria?.[examId] || {};
                                                        const { theory, practical, total,
                                                            failedInTh, failedInPr, failed } = NSResultPrep.getResultWithStatus(subjectResult, subjectCriteria);
                                                        // 
                                                        return (
                                                            <Fragment key={ei}>
                                                                <td style={failedInTh}>{theory || '-'}</td>
                                                                <td style={failedInPr}>{practical || '-'}</td>
                                                                <td style={failed}>{total || '-'}</td>
                                                            </Fragment>
                                                        )
                                                    })
                                                }
                                            </Fragment>
                                        ))
                                    }
                                </>
                            }
                            <td>{stdResult?.total || ''}</td>
                            <td>{stdResult?.percentage || ''}</td>
                            <td>{stdResult?.attendance_str || ''}</td>
                            {/* extra activities here */}
                            <td className="capitalize">{stdResult?.remarks || ''}</td>
                            <td className="capitalize" style={{
                                color: stdResult?.color || '',
                            }}>{stdResult?.result || ''}</td>
                            <td>{stdResult?.position_in_section || ''}</td>
                            {/* <td>{stdResult?.position_in_class || ''}</td> */}
                        </tr>
                    )
                })
            }
            {filters?.subjectwise_result &&
                <tr>
                    <td colSpan={
                        countObjectValues(filters, ['roll_no', 'symbol_no', 'regd_no'], true)
                    }></td>
                    <td colSpan={
                        countObjectValues(filters, ['roll_no', 'symbol_no', 'regd_no'], true) > 0 ? 2 : 1
                    }>Averages</td>
                    <>
                        {
                            subjects.map((subject, si) => (
                                <Fragment key={si}>
                                    {
                                        exams.map((exam, ei) => (
                                            <Fragment key={ei}>
                                                <td>{(summary?.averages?.[subject.id][exam.id]?.th / summary.total_students).toFixed(2) || ''}</td>
                                                <td>{(summary?.averages?.[subject.id][exam.id]?.pr / summary.total_students).toFixed(2) || ''}</td>
                                                <td>{(summary?.averages?.[subject.id][exam.id]?.total / summary.total_students).toFixed(2) || ''}</td>
                                            </Fragment>
                                        ))
                                    }
                                </Fragment>
                            ))
                        }
                    </>
                    <td>{summary.average_total}</td>
                    <td>{summary.average_percentage}</td>
                    <td>{summary.average_attendance}</td>
                    <td colSpan={6}></td>
                </tr>
            }
        </tbody>
    )
}

function countObjectValues(obj, keys, valueToCount) {
    return keys.reduce((count, key) => count + (obj[key] === valueToCount ? 1 : 0), 0);
}

export default NSFinalClassResult;