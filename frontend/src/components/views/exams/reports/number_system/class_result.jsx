import Loader from "@/components/Loader";
import ExamInput from "@/components/inputs/ExamInput";
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
import { NSResultPrep } from "./NSResultPrep.js";
import ResultTypeInput, { ResultTypeOptions } from "../ResultTypeInput";
import ClosedAcademicYearSelectInput from "@/components/inputs/ClosedAcademicYearSelectInput";
import useClosedAcademicYear from "@/hooks/closedAcademicYear";
import { SelectInput } from "@/components/inputs";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";
import useDocumentStyle from "@/hooks/documentStyle";

function NSClassResult() {
    const { user: { user },
        fiscalYear: { year, getYearFromAcademicYear },
        class: { classes },
        notification: { updateNotification } } = useAppContext();
    // Presentation only — never touches what is printed.
    const docStyle = useDocumentStyle("class_result");
    const [selectedClass, setSelectedClass] = useState('');
    const [examName, setExamName] = useState('');
    const [filters, setFilters] = useState({ ...filtersSchema });
    const { closedAcademicYear, onClosedAcademicYearSelect, resetClosedAcademicYear } = useClosedAcademicYear();
    // 
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
    const { fetching, statusHandler } = useRequestStatus();
    // 
    function onSelect(action, id, item) {
        setSelectedClass(item);
        resetClosedAcademicYear();
    }
    function onExamSelect({ name, value, examName }) {
        setExamName(examName);
        onChange({ name, value });
    }
    function onFilterChange({ name, value }) {
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
        const result = await fetchExamResults(classIds, data.exam, null, null, null, null, null, true, closedAcademicYear || year?.academic_year, null, data?.student_status);
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
            const examIds = [data.exam];
            const tableData = NSResultPrep.prepareClassLedger(result, _remarks || remarks, _divisions || divisions, examIds);
            const {
                _subjects, _totals,
                averages, total_students, average_total, average_percentage, average_attendance,
                _studentResults,
            } = tableData;
            // console.log(tableData);
            setSubjects(_subjects);
            setTotals(_totals);
            setExtraActivities(result.extraActivities);
            setExtraActivitiesEntries(result.extraActivitiesEntries);
            setSummary(state => ({
                ...state,
                averages, total_students, average_total, average_percentage, average_attendance,
            }));
            setStudentResults(_studentResults);
        }
        statusHandler.toggleFetching();
    }

    useEffect(() => {
        onReset();
        setFilters({ ...filtersSchema });
    }, [selectedClass?.class_info?.id]);

    useEffect(() => {
        setStudentResults([]);
    }, [data?.exam]);

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
                <div className="my-2 flex flex-col gap-y-2">
                    <>
                        <Section title={"Enter details"} >
                            <ClosedAcademicYearSelectInput value={closedAcademicYear} onChange={onClosedAcademicYearSelect} />
                            <ExamInput academic_year={closedAcademicYear || year?.academic_year} schoolId={user?.profile?.school || user?.profile?.id}
                                value={data?.exam} onChange={onExamSelect} getExamName={true} />
                            <SelectInput input={{ name: "student_status", label: "Student Status", options: STUDENT_STATUS_OPTIONS }}
                                value={data?.student_status} onChange={onChange} />
                        </Section>
                        <ResultViewFilters filters={filters} onFilterChange={onFilterChange}
                            action={
                                <Button variant="filled" color="teal" className="w-full sm:w-auto"
                                    onClick={fetchClassResult} disabled={fetching || !data?.exam}>
                                    {fetching ? "Displaying..." : "Display result"}
                                </Button>
                            } />
                    </>
                    {data?.exam && <>
                        {
                            fetching ? <Loader /> :
                                <>
                                    {(studentResults?.length > 0) &&
                                        <><ReportActionBar onPrint={printResult} reportRef={resultRef}
                                            exportName={`Class Result - ${showOnlyClass(selectedClass?.classname) || ''}`}
                                            exportTitles={[`Exam : ${examName || ''}`]} />
                                            <div ref={resultRef} className={`w-full flex flex-col bg-white py-2 rounded-sm ${docStyle.className}`} style={docStyle.css}>
                                                <ReportHeader />
                                                <div className="flex justify-between w-1/2 mx-auto capitalize">
                                                    <Typography variant="h6">Class : {showOnlyClass(selectedClass?.classname) || ''}</Typography>
                                                    <Typography variant="h6">Exam : {examName || ''}</Typography>
                                                    <Typography variant="h6">
                                                        Year : {getYearFromAcademicYear(closedAcademicYear || year?.academic_year)}
                                                    </Typography>
                                                </div>
                                                <div className="overflow-x-auto">
                                                    <table className="result mt-2 w-max">
                                                        <TableHeaderNS subjects={subjects} extraActivities={extraActivities} totals={totals} filters={filters} />
                                                        <TableBodyNS examId={data.exam} studentResults={studentResults} summary={summary} subjects={subjects} extraActivities={extraActivities} filters={filters} />
                                                    </table>
                                                </div>
                                                <Signatures schoolProfile={user?.profile || {}} issueDate={user?.today || ''} />
                                            </div>
                                        </>
                                    }
                                </>
                        }
                    </>
                    }
                </div>
            </ChooseClass>
        </>
    )
}

function TableHeaderNS({ subjects = [], extraActivities = [], totals = {}, filters }) {
    return (
        <thead>
            <tr>
                {filters?.roll_no && <th rowSpan={4}>Roll No.</th>}
                {filters?.symbol_no && <th rowSpan={4}>Symbol No.</th>}
                {filters?.regd_no && <th rowSpan={4}>Registration No.</th>}
                <th rowSpan={4}>Name</th>
                <th></th>
                {filters?.subjectwise_result &&
                    <>
                        {
                            subjects.map((subject, si) => {
                                const subjectname = formatSubjectName(subject.subject);
                                return (
                                    <th key={si} className="capitalize whitespace-pre" colSpan={3}>{subjectname}</th>
                                )
                            })
                        }
                    </>
                }
                <th rowSpan={2}>Total</th>
                <th rowSpan={4}>%</th>
                <th rowSpan={4}>Att.</th>
                {filters?.subjectwise_result &&
                    <>
                        {/* extra-activities-headers */}
                        {
                            extraActivities.map((act, ai) => {
                                const actname = formatSubjectName(act.name);
                                return (
                                    <th rowSpan={4} key={ai} className="capitalize whitespace-pre">{actname}</th>
                                )
                            })
                        }
                    </>
                }
                <th rowSpan={4}>Remarks</th>
                <th rowSpan={4}>Result</th>
                <th rowSpan={4} className="whitespace-pre">Position</th>
                {/* <th rowSpan={4} className="whitespace-pre">Position {'\n'} in {'\n'} section</th> */}
                {/* <th rowSpan={4} className="whitespace-pre">Position {'\n'} in {'\n'} class</th> */}
            </tr>
            {filters?.subjectwise_result &&
                <>
                    <tr>
                        <th></th>
                        <>
                            {
                                subjects.map((_, si) => (
                                    <Fragment key={si}>
                                        <th>Th.</th>
                                        <th>{filters?.practical}</th>
                                        <th>Total</th>
                                    </Fragment>
                                ))
                            }
                        </>
                    </tr>
                    <tr>
                        <th>F.M.</th>
                        <>
                            {
                                subjects.map((subject, si) => {
                                    const { fm, fm_th, fm_pr } = subject.criteria;
                                    return (
                                        <Fragment key={si}>
                                            <th>{fm_th || ''}</th>
                                            <th>{fm_pr || ''}</th>
                                            <th>{fm || ''}</th>
                                        </Fragment>
                                    )
                                })
                            }
                        </>
                        <th>{totals?.fm_total}</th>
                    </tr>
                    <tr>
                        <th>P.M.</th>
                        <>
                            {
                                subjects.map((subject, si) => {
                                    const { pm, pm_th, pm_pr } = subject.criteria;
                                    return (
                                        <Fragment key={si}>
                                            <th>{pm_th || ''}</th>
                                            <th>{pm_pr || ''}</th>
                                            <th>{pm || ''}</th>
                                        </Fragment>
                                    )
                                })
                            }
                        </>
                        <th>{totals?.pm_total}</th>
                    </tr>
                </>
            }
        </thead>
    )
}

function TableBodyNS({ examId, studentResults = [], summary, subjects = [], extraActivities = [], filters }) {
    return (
        <tbody>
            {
                (studentResults || []).map((stdResult, si) => {
                    return (
                        <tr key={si}>
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
                                        subjects.map((subject, si) => {
                                            const subjectResult = stdResult?.[subject.id] || {};
                                            const subjectCriteria = subject?.criteria || {};
                                            const { theory, practical, total,
                                                failedInTh, failedInPr, failed } = NSResultPrep.getResultWithStatus(subjectResult, subjectCriteria);
                                            // 
                                            return (
                                                <Fragment key={si}>
                                                    <td style={failedInTh}>{theory || '-'}</td>
                                                    <td style={failedInPr}>{practical || '-'}</td>
                                                    <td style={failed}>{total || '-'}</td>
                                                </Fragment>
                                            )
                                        })
                                    }
                                </>
                            }
                            <td>{stdResult?.total || ''}</td>
                            <td>{stdResult?.percentage || ''}</td>
                            <td>{stdResult?.attendance_str || ''}</td>
                            {filters?.subjectwise_result &&
                                <>
                                    {
                                        extraActivities.map((ea, ai) => (
                                            <Fragment key={ai}>
                                                <td>{stdResult.extra_activities?.[ea.id] || ''}</td>
                                            </Fragment>
                                        ))
                                    }
                                </>
                            }
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
                <>
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
                                        <td>{(summary?.averages?.[subject.id]?.[examId]?.th / summary.total_students).toFixed(2) || ''}</td>
                                        <td>{(summary?.averages?.[subject.id]?.[examId]?.pr / summary.total_students).toFixed(2) || ''}</td>
                                        <td>{(summary?.averages?.[subject.id]?.[examId]?.total / summary.total_students).toFixed(2) || ''}</td>
                                    </Fragment>
                                ))
                            }
                        </>
                        <td>{summary.average_total}</td>
                        <td>{summary.average_percentage}</td>
                        <td>{summary.average_attendance}</td>
                        <td colSpan={6}></td>
                    </tr>
                    <tr>
                        <td colSpan={
                            countObjectValues(filters, ['roll_no', 'symbol_no', 'regd_no'], true)
                        }></td>
                        <td colSpan={
                            countObjectValues(filters, ['roll_no', 'symbol_no', 'regd_no'], true) > 0 ? 2 : 1
                        }>Total Passed</td>
                        <>
                            {
                                subjects.map((subject, si) => (
                                    <Fragment key={si}>
                                        <td>{summary?.averages?.[subject.id]?.[examId]?.passed_th || ''}</td>
                                        <td>{summary?.averages?.[subject.id]?.[examId]?.passed_pr || ''}</td>
                                        <td>{summary?.averages?.[subject.id]?.[examId]?.passed || ''}</td>
                                    </Fragment>
                                ))
                            }
                        </>
                        <td colSpan={9}></td>
                    </tr>
                    <tr>
                        <td colSpan={
                            countObjectValues(filters, ['roll_no', 'symbol_no', 'regd_no'], true)
                        }></td>
                        <td colSpan={
                            countObjectValues(filters, ['roll_no', 'symbol_no', 'regd_no'], true) > 0 ? 2 : 1
                        }>Total Failed</td>
                        <>
                            {
                                subjects.map((subject, si) => (
                                    <Fragment key={si}>
                                        <td>{summary?.averages?.[subject.id]?.[examId]?.failed_th || 0}</td>
                                        <td>{summary?.averages?.[subject.id]?.[examId]?.failed_pr || 0}</td>
                                        <td>{summary?.averages?.[subject.id]?.[examId]?.failed || 0}</td>
                                    </Fragment>
                                ))
                            }
                        </>
                        <td colSpan={9}></td>
                    </tr>
                </>
            }
        </tbody>
    )
}

function countObjectValues(obj, keys, valueToCount) {
    return keys.reduce((count, key) => count + (obj[key] === valueToCount ? 1 : 0), 0);
}

export default NSClassResult;