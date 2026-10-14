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
import LSResultFilters, { letterGradingFiltersSchema } from "./LSResultFilters";
import showOnlyClass from "@/methods/showOnlyClass";
import { LGSResultPrep } from "./LGSResultPrep";
import { finalResultExam } from "../CommonResultPrep";
import ResultTypeInput, { ResultTypeOptions } from "../ResultTypeInput";
import useClosedAcademicYear from "@/hooks/closedAcademicYear";
import ClosedAcademicYearSelectInput from "@/components/inputs/ClosedAcademicYearSelectInput";
import { SelectInput } from "@/components/inputs";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";

const LSFiltersSchema = { ...filtersSchema, ...letterGradingFiltersSchema };
// 
function getSubjectColSpan(filters, defaultSpan, grade_cols, gp_cols) {
    let colSpan = defaultSpan;
    if (filters?.grade) colSpan += grade_cols;
    if (filters?.gp) colSpan += gp_cols;
    return colSpan;
}
// 
function LGSFinalClassResult() {
    const { user: { user },
        fiscalYear: { year, getYearFromAcademicYear },
        class: { classes },
        notification: { updateNotification } } = useAppContext();
    const [selectedClass, setSelectedClass] = useState('');
    const [filters, setFilters] = useState({ ...LSFiltersSchema });
    const [isHigherSecondaryResult, setIsHigherSecondaryResult] = useState(null); // secondary and higher secondary +;
    const { closedAcademicYear, onClosedAcademicYearSelect, resetClosedAcademicYear } = useClosedAcademicYear();
    // 
    const {
        resultType, setResultType,
        data,
        subjects, setSubjects,
        studentResults, setStudentResults,
        remarks, setRemarks,
        extraActivities, setExtraActivities,
        extraActivitiesEntries, setExtraActivitiesEntries,
        methods: { onChange, onReset }
    } = useClassResult();
    const [examsBackup, setExamsBackup] = useState([]);
    const [exams, setExams] = useState([]);
    const { fetching, statusHandler } = useRequestStatus();
    // 
    const schoolId = user?.profile?.school || user?.profile?.id;
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
        const result = await fetchExamResults(classIds, null, null, null, "letter", null, null, true, closedAcademicYear || year?.academic_year, schoolId, data?.student_status);
        if (result?.status === 404) {
            updateNotification(result.status, result.message);
            statusHandler.toggleFetching();
            return;
        }
        let _remarks;
        if (!remarks?.id) {
            _remarks = await fetchGradingRules(schoolId, GRADING_RULE_TYPES.grading);
            setRemarks(_remarks);
        }
        // 
        if (result) {
            // setExtraActivities(result.extraActivities);
            // setExtraActivitiesEntries(result.extraActivitiesEntries);
            const examIds = Object.keys(result?.student_results || {});
            const _exams = Object.values(result?.exams || {})
                .filter(exam => examIds.includes(`${exam.id}`));
            toggleExams(filters?.termwise, _exams);
            setExamsBackup(_exams);
            const tableData = LGSResultPrep.prepareClassLedger(result, _remarks || remarks, examIds, true);
            const {
                _subjects, _isHigherSecondaryResult,
                _studentResults
            } = tableData;
            // console.log(tableData);
            setSubjects(_subjects);
            setIsHigherSecondaryResult(_isHigherSecondaryResult);
            setStudentResults(_studentResults);
        }
        statusHandler.toggleFetching();
    }

    useEffect(() => {
        onReset();
        setIsHigherSecondaryResult(null);
        setFilters({ ...LSFiltersSchema });
        setStudentResults([]);
    }, [selectedClass?.class_info?.id]);
    useEffect(() => {
        setStudentResults([]);
    }, [data?.exam]);
    useEffect(() => {
        onReset();
        setIsHigherSecondaryResult(null);
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
                <div className="my-5 flex flex-col gap-y-2">
                    <>
                        <Section>
                            <ClosedAcademicYearSelectInput value={closedAcademicYear} onChange={onClosedAcademicYearSelect} />
                            <SelectInput input={{ name: "student_status", label: "Student Status", options: STUDENT_STATUS_OPTIONS }}
                                value={data?.student_status} onChange={onChange} />
                        </Section>
                        <ResultViewFilters filters={filters} onFilterChange={onFilterChange} isFinalResult={true} />
                        <LSResultFilters filters={filters} onFilterChange={onFilterChange} />
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={fetchClassResult} disabled={fetching}>{fetching ? "Displaying..." : "Display"}</Button>
                        </ButtonsSecion>
                    </>
                    {studentResults?.length > 0 && <>
                        {
                            fetching ? <Loader /> :
                                <>
                                    <ReportActionBar onPrint={printResult} reportRef={resultRef}
                                        exportName={`Final Class Result - ${showOnlyClass(selectedClass?.classname) || ''}`} />
                                    <div ref={resultRef} className="w-full flex flex-col bg-white py-2 rounded-sm">
                                        <ReportHeader />
                                        <div className="flex justify-between w-1/2 mx-auto capitalize">
                                            <Typography variant="h6">Class : {showOnlyClass(selectedClass?.classname) || ''}</Typography>
                                            <Typography variant="h6">Exam : Final Result</Typography>
                                            <Typography variant="h6">Year : {getYearFromAcademicYear(closedAcademicYear || year?.academic_year)}</Typography>
                                        </div>
                                        <div className="overflow-x-auto">
                                            {isHigherSecondaryResult !== null &&
                                                <table className="result mt-2 w-max">
                                                    <TableHeaderLGS exams={exams} subjects={subjects} extraActivities={extraActivities} filters={filters} higherSecondaryResult={isHigherSecondaryResult === true} />
                                                    <TableBodyLGS studentResults={studentResults} exams={exams} subjects={subjects} extraActivities={extraActivities} higherSecondaryResult={isHigherSecondaryResult === true} filters={filters} />
                                                </table>
                                            }
                                        </div>
                                        <Signatures schoolProfile={user?.profile || {}} issueDate={user?.today || ''} />
                                    </div>
                                </>
                        }
                    </>
                    }
                </div>
            </ChooseClass>
        </>
    )
}

function ExamNamesHeaderLGS({ exams, colSpan = 1 }) {
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

function TableHeaderLGS({ exams = [], subjects = [], extraActivities = [], filters, higherSecondaryResult = null }) {
    const examsCount = exams?.length || 1;
    const defaultColSpan = higherSecondaryResult ? 2 : 1,
        grade_cols = 2,
        gp_cols = defaultColSpan;
    let subjectColspan = getSubjectColSpan(filters, defaultColSpan, grade_cols, gp_cols);
    subjectColspan = subjectColspan * examsCount;

    return (
        <>
            {higherSecondaryResult ?
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
                                            <th key={si} className="capitalize whitespace-pre" colSpan={subjectColspan}>{subjectname}</th>
                                        )
                                    })
                                }
                            </>
                        }
                        <th rowSpan={5}>GPA</th>
                        <th rowSpan={4}>Grade</th>
                        <th rowSpan={5}>Att.</th>
                        {/* extra activities here */}
                        <th rowSpan={5}>Remarks</th>
                    </tr>
                    {filters?.subjectwise_result &&
                        <>
                            <tr>
                                <th></th>
                                <>
                                    {
                                        subjects.map((_, si) => (
                                            // colSpan: 6
                                            <ExamNamesHeaderLGS key={si} exams={exams} colSpan={subjectColspan / examsCount} />
                                        ))
                                    }
                                </>
                            </tr>
                            <tr>
                                <th>C.H (Th.)</th>
                                <>
                                    {
                                        subjects.map((subject, si) => {
                                            return (
                                                <Fragment key={si}>
                                                    <th colSpan={subjectColspan}>{subject?.credit_hours || ''}</th>
                                                </Fragment>
                                            )
                                        })
                                    }
                                </>
                            </tr>
                            <tr>
                                <th>C.H ({filters?.practical})</th>
                                <>
                                    {
                                        subjects.map((subject, si) => {
                                            return (
                                                <Fragment key={si}>
                                                    <th colSpan={subjectColspan}>{subject?.credit_hours_pr || ''}</th>
                                                </Fragment>
                                            )
                                        })
                                    }
                                </>
                            </tr>
                            <tr>
                                <th></th>
                                {
                                    subjects.map((_, si) => (
                                        <Fragment key={si}>
                                            {
                                                exams.map((exam, ei) => (
                                                    <Fragment key={ei}>
                                                        {/* <th></th> */}
                                                        {filters?.grade &&
                                                            <>
                                                                <th>Th.</th>
                                                                <th>{filters?.practical}</th>
                                                            </>
                                                        }
                                                        <th>F.G.</th>
                                                        {filters?.gp &&
                                                            <>
                                                                <th>G.P <br /> (Th.)</th>
                                                                <th>G.P <br /> ({filters?.practical})</th>
                                                            </>
                                                        }
                                                        <th>G.P <br /> (F.G.)</th>
                                                    </Fragment>
                                                ))
                                            }
                                        </Fragment>
                                    ))
                                }
                            </tr>
                        </>
                    }
                </thead>
                :
                // --- secondary classes result;
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
                                            <th key={si} className="capitalize whitespace-pre" colSpan={subjectColspan}>{subjectname}</th>
                                        )
                                    })
                                }
                            </>
                        }
                        <th rowSpan={4}>GPA</th>
                        <th rowSpan={4}>Grade</th>
                        <th rowSpan={4}>Att.</th>
                        {/* extra activities here */}
                        <th rowSpan={4}>Remarks</th>
                    </tr>
                    {filters?.subjectwise_result &&
                        <>
                            <tr>
                                <th></th>
                                <>
                                    {
                                        subjects.map((_, si) => (
                                            // colSpan: 6
                                            <ExamNamesHeaderLGS key={si} exams={exams} colSpan={subjectColspan / examsCount} />
                                        ))
                                    }
                                </>
                            </tr>
                            <tr>
                                <th></th>
                                <>
                                    {
                                        subjects.map((subject, si) => {
                                            return (
                                                <Fragment key={si}>
                                                    <th colSpan={subjectColspan}>C.H [{subject?.credit_hours || ''}]</th>
                                                </Fragment>
                                            )
                                        })
                                    }
                                </>
                            </tr>
                            <tr>
                                <th></th>
                                <>
                                    {
                                        subjects.map((_, si) => {
                                            return (
                                                <Fragment key={si}>
                                                    {
                                                        Array.from({ length: examsCount }).map((_, ei) => (
                                                            <Fragment key={ei}>
                                                                {filters?.grade &&
                                                                    <>
                                                                        <th>Th.</th>
                                                                        <th>{filters?.practical}</th>
                                                                    </>
                                                                }
                                                                <th>F.G.</th>
                                                                {
                                                                    filters?.gp &&
                                                                    <th>GP</th>
                                                                }
                                                            </Fragment>
                                                        ))
                                                    }
                                                </Fragment>
                                            )
                                        })
                                    }
                                </>
                            </tr>
                        </>
                    }
                </thead>
            }
        </>
    )
}

function TableBodyLGS({ studentResults = [], exams = [], subjects = [], extraActivities = [], higherSecondaryResult = null, filters }) {
    return (
        <>
            {higherSecondaryResult ?
                // higher secondary result;
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
                                        color: stdResult?.color || ""
                                    }}>{stdResult?.name || ''}</td>
                                    {filters?.subjectwise_result &&
                                        <>
                                            {
                                                subjects.map((subject, si) => (
                                                    <Fragment key={si}>
                                                        {exams.map((exam, ei) => {
                                                            const subjectResult = stdResult?.[exam.id]?.[subject.id] || {};
                                                            const { theory, practical, total: fg, gp_th, gp_pr, gp,
                                                                failed, failedInTh, failedInPr } = LGSResultPrep.getResultWithStatus(subjectResult);
                                                            return (
                                                                <Fragment key={ei}>
                                                                    {filters?.grade &&
                                                                        <>
                                                                            <td style={failedInTh}>{theory || ''}</td>
                                                                            <td style={failedInPr}>{practical || ''}</td>
                                                                        </>
                                                                    }
                                                                    <td style={failed}>{fg || ''}</td>
                                                                    {filters?.gp &&
                                                                        <>
                                                                            <td>{gp_th || ''}</td>
                                                                            <td>{gp_pr || ''}</td>
                                                                        </>
                                                                    }
                                                                    <td>{gp || 0}</td>
                                                                </Fragment>
                                                            )
                                                        })
                                                        }
                                                    </Fragment>
                                                ))
                                            }
                                        </>
                                    }
                                    <td>{stdResult?.gpa || '-'}</td>
                                    <td>{stdResult?.grade || '-'}</td>
                                    <td>{stdResult?.attendance_str || ''}</td>
                                    {/* extra activities here */}
                                    <td className="capitalize">{stdResult?.remarks || ''}</td>
                                </tr>
                            )
                        })
                    }
                </tbody>
                :
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
                                        color: stdResult?.color || ""
                                    }}>{stdResult?.name || ''}</td>
                                    {filters?.subjectwise_result &&
                                        <>
                                            {
                                                subjects.map((subject, si) => (
                                                    <Fragment key={si}>
                                                        {
                                                            exams.map((exam, ei) => {
                                                                const subjectResult = stdResult?.[exam.id]?.[subject.id] || {};
                                                                const { theory, practical, total, gp,
                                                                    failed, failedInTh, failedInPr } = LGSResultPrep.getResultWithStatus(subjectResult);
                                                                return (
                                                                    <Fragment key={ei}>
                                                                        {filters?.grade &&
                                                                            <>
                                                                                <td style={failedInTh}>{theory || ''}</td>
                                                                                <td style={failedInPr}>{practical || ''}</td>
                                                                            </>
                                                                        }
                                                                        <td style={failed}>{total || ''}</td>
                                                                        {filters?.gp &&
                                                                            <td>{gp || 0}</td>
                                                                        }
                                                                    </Fragment>
                                                                )
                                                            })
                                                        }</Fragment>))
                                            }
                                        </>
                                    }
                                    <td>{stdResult?.gpa || '-'}</td>
                                    <td>{stdResult?.grade || '-'}</td>
                                    <td>{stdResult?.attendance_str || ''}</td>
                                    {/* extra activities here */}
                                    <td className="capitalize">{stdResult?.remarks || ''}</td>
                                </tr>
                            )
                        })
                    }
                </tbody>
            }
        </>
    )
}

export default LGSFinalClassResult;