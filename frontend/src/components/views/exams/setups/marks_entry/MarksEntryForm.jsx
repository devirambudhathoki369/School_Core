import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import ExamInput from "@/components/inputs/ExamInput";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { toggleAction } from "@/components/tables/actions";
import useRequestStatus from "@/hooks/requestStatus";
import { criteriaSchema, marksEntrySchema, studentResultSchema } from "@/schemas/exam";
import { searchStudents } from "@/services/functions/students";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import { BookmarkIcon } from "@heroicons/react/24/outline";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { useAppContext } from "@/contexts/AppContext";
import { deleteExamResult, fetchExamResults, saveExamResult } from "@/services/functions/exams/results";
import { hasDifferences } from "@/methods/FlattenSchema";
import Warning from "@/components/Warning";
import clone from "@/methods/clone";
import MarksEntryAttendanceSearchForm from "./AttendanceSearchForm";
import { __search } from "@/services/functions";
import { handleEmptyValues } from "@/methods/cleanEmptyFields";
import { hasPassed, isMarksEntryValid } from "@/methods/exams/entryValidations";
import safeDecimal from "@/methods/safeDecimal";
import CSVFileUpload from "@/components/inputs/CSVFileUpload";
import ClosedAcademicYearSelectInput from "@/components/inputs/ClosedAcademicYearSelectInput";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";

const _toggleAction = toggleAction("Absent?", "Toggle absent/present");
const defaultColumns = [
    ['name'], ['roll_no', 'Roll No.'], ['symbol_no', 'Symbol No.'],
    ['theory', 'Th.'], ['practical', 'Pr.'], ['total'], /* ['attendance'], */['inclusion'],
    ['result_str', 'result'], ['absence_str', 'absent']
    // keep attendance at index 6;
];
const defaultEditableColumns = [['theory'], ['practical']];
const attendanceSearchSchema = { school: '', class_info: '', start_date: '', end_date: '' };
const ATTENDANCE_SEARCH_API = "/api/search/attendance";

function MarksEntryForm({ selectedClass, userProfile, subjects = [], firstPeriodSubject,
    closedAcademicYear: { closedAcademicYear, onClosedAcademicYearSelect } }) {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    marksEntrySchema['school'] = userProfile?.school || userProfile?.id;
    marksEntrySchema['class_info'] = selectedClass.class_info.id;
    attendanceSearchSchema['school'] = userProfile?.school || userProfile?.id;
    attendanceSearchSchema['class_info'] = selectedClass.class_info.id;
    attendanceSearchSchema["start_date"] = user?.today;
    attendanceSearchSchema["end_date"] = user?.today;
    // 
    const [dataKey, setDataKey] = useState('');
    const [resultBackup, setResultBackup] = useState({});
    const [data, setData] = useState({ ...marksEntrySchema });
    const [students, setStudents] = useState({}); // upload data;
    const { fetching, uploading, statusHandler } = useRequestStatus();
    const [prevClass, setPrevClass] = useState('');
    const [columns, setColumns] = useState([]);
    const [editableColumns, setEditableColumns] = useState([]);
    const [recalculationRequired, setRecalculationRequired] = useState(false);
    const [attendanceSearchData, setAttendanceSearchData] = useState({ ...attendanceSearchSchema });
    const [isAttendanceSearching, setIsAttendanceSearching] = useState(false);
    // 
    const safeParseFloat = num => parseFloat(num) || 0;

    function onChange({ name, value }) {
        if (name in criteriaSchema) {
            setData(state => {
                const ns = { ...state };
                ns.criteria = { ...ns.criteria, [name]: value };
                const { fm_th, fm_pr, pm_th, pm_pr } = ns.criteria;
                if ((fm_th && pm_th) || (fm_pr && pm_pr)) {
                    ns.criteria.fm = safeParseFloat(fm_th) + safeParseFloat(fm_pr);
                    ns.criteria.pm = safeParseFloat(pm_th) + safeParseFloat(pm_pr);
                    setRecalculationRequired(true);
                }
                return ns;
            });
        }
        else setData(state => ({ ...state, [name]: value }));
    }
    function getStdResult(stdResult, criteria, recalculate) {
        if (recalculate) {
            const result = hasPassed(stdResult?.total || 0, stdResult?.theory || 0, stdResult?.practical || null, criteria);
            stdResult["result"] = result;
        }
        stdResult["result_str"] = stdResult?.result === true ? "pass" : "fail";
        stdResult["absence_str"] = stdResult?.absent === true ? "absent" : "";
        stdResult["color"] = (stdResult?.result === false || stdResult?.absent === true) ? "red" : null;
        return stdResult;
    }
    function getKey(class_id, academic_year, subject_id) {
        return `cls_${class_id}__acay_${academic_year}__sub_${subject_id}`;
    }
    async function showResultEntryForm(studentResults, criteria = null, recalculate = false) {
        studentResults = clone(studentResults);
        statusHandler.toggleFetching();
        const KEY = getKey(selectedClass?.class_info?.id, closedAcademicYear || year?.academic_year, data.subject);
        let _students = resultBackup?.[KEY]?.students;
        if (!_students) {
            /** 
             * pass closed-academic-year as result-academic-year
             * to search students from results
             * if closed-academic-year != running-academic-year!
             */
            const result_academic_year = closedAcademicYear != year?.academic_year ? closedAcademicYear : '';
            let res = await searchStudents({
                school: userProfile?.school || userProfile?.id,
                class_info: selectedClass?.class_info?.id,
                result: true,
                academic_year: year?.academic_year,
                result_academic_year,
                // the search API reads `status`; `student_status` was ignored,
                // so the dropdown never narrowed the roster.
                status: data?.student_status,
                subject: data?.subject,
                include_identities: true,
            });
            _students = res?.[2];
            if (_students) {
                // students-backup;
                setResultBackup(state => {
                    const ns = { ...state };
                    ns[KEY] = { ...ns?.[KEY] || {}, students: _students };
                    return ns;
                });
            } else {
                setStudents([]);
            }
        }
        _students = (_students || []).reduce((acc, std) => {
            // std contains student/id which is student-id;
            const stdId = std?.student || std.id;
            acc.push({
                ...studentResultSchema,
                ...std, // student-info
                // student's uploaded result;
                ...(studentResults?.[stdId] ?
                    getStdResult(studentResults[stdId], criteria, recalculate) : {}),
                // FAKE DATA BELOW;
                /* ...{
                    theory: 30,
                    practical: 30,
                    total: 60,
                    result: true,
                    result_str: 'pass',
                    absence_str: '',
                } */
            });
            return acc;
        }, []);
        setStudents(state => {
            const ns = { ...state };
            ns[KEY] = _students;
            return ns;
        });
        setDataKey(KEY);
        setRecalculationRequired(false);
        statusHandler.toggleFetching();
    }
    function handleStudentResult(student, col, value) {
        if (col === 'absent' && value === true) {
            student[col] = value; // means absent;
            student['theory'] = '';
            student['practical'] = '';
            student['total'] = 0;
            student['inclusion'] = '';
            student['attendance'] = '';
            student['result'] = false; // means fail;
            student['result_str'] = 'Fail';
            student['absence_str'] = 'Absent';
            student['color'] = 'red';
            return student;
        }
        if (typeof value === "string" && !value.endsWith('.')) {
            try {
                value = value.trim();
                value = parseFloat(value) || null;
            } catch (e) { }
        }
        student[col] = value || null;
        if (typeof value === "number" || value === null) {
            student['total'] = safeDecimal((student?.theory || 0) + (student?.practical || 0));
        }
        const _criteria = data?.criteria ||
            resultBackup?.[selectedClass?.class_info?.id]?.[data?.subject]?.class_result?.criteria || {};
        const passed = hasPassed(student?.total, student?.theory, student?.practical, _criteria);
        student['result'] = passed;
        student['result_str'] = passed ? "Pass" : "Fail";
        student['absence_str'] = student?.absent === true ? "Absent" : "";
        student['color'] = (student?.absent === true || !passed) ? "red" : null;
        return student;
    }
    function onMarksEntry(index, col, value) {
        const KEY = getKey(selectedClass.class_info.id, closedAcademicYear || year?.academic_year, data.subject);
        setStudents(state => {
            const ns = { ...state };
            const student = handleStudentResult(ns[KEY][index], col, value);
            ns[KEY][index] = student;
            return ns;
        });
    }
    function onBulkMarksEntry(student_marks) {
        const KEY = getKey(selectedClass.class_info.id, closedAcademicYear || year?.academic_year, data.subject);
        setStudents(state => {
            const ns = { ...state };
            let student, col, value;
            student_marks.map((stdData, index) => {
                const [theory, practical] = stdData;
                student = ns[KEY]?.[index];
                if (student) {
                    const isAbsent = theory === "" && practical === "";
                    // 
                    /** practical is already handled, 
                     * theory is handle hardcoded if isAbsent, then absence field executes handleStudentResult
                     * else theory executes handleStudentResult function! */
                    student["practical"] = parseFloat(practical) || null;
                    if (isAbsent) {
                        student["theory"] = parseFloat(theory) || null;
                        // 
                        col = "absent";
                        value = true; //means absent!
                    } else {
                        col = "theory";
                        value = theory;
                    }
                    // 
                    student = handleStudentResult(ns[KEY][index], col, value);
                    ns[KEY][index] = student;
                }
            });
            return ns;
        })
    }
    function onBlur(index, col, value) {
        if (col === "attendance") return;
        if (!value.endsWith('.') && !value.endsWith('-') && value?.length > 0) value = parseFloat(value);
        else if (value === "") return;
        else {
            updateNotification("", `Invalid marks at S.N. ${index + 1} in "${col}"!!`);
            return;
        }
        const fm_th = parseFloat(data?.criteria?.fm_th), fm_pr = parseFloat(data?.criteria?.fm_th);
        if ((col === 'theory' && value > fm_th) || (col === 'practical' && (fm_pr && value > fm_pr)) || value < 0) {
            updateNotification('', `Invalid marks at S.N. ${index + 1} in "${col}"!!`);
        }
    }
    function formatStudentsResult(data) {
        /* ISSUE: FIXED: 
        id means student-result-id and student means student-id;
        during update student has student-id, and id has student-result-id;
        during create student is empty and id means student-id;
         */
        const student_names = {};
        const student_marks = data.reduce((acc, _result) => {
            let confusedData = {};
            let { id, name, student, theory, practical, attendance, inclusion, total, result, absent } = _result;
            if (!student) {
                // means marks entry;
                confusedData = { student: id };
            } else {
                // means marks update;
                confusedData = { id, student };
            }
            _result = ({ ...confusedData, theory, practical, attendance, inclusion, total, result, absent });
            student_names[_result.student] = name;
            _result = handleEmptyValues(_result, '', null);
            acc.push(_result);
            return acc;
        }, []);
        return { student_marks, student_names };
    }
    function prepareUploadData(classResult, studentResults, subject_id) {
        if (classResult?.id) {
            // FOR UPDATE;
            // CLASS-RESULT
            let { id, class_info, exam, school, criteria } = classResult;
            let data = {
                id, class_info, exam, school,
            }
            const KEY = getKey(selectedClass?.class_info?.id, closedAcademicYear || year?.academic_year, subject_id);
            if (hasDifferences(resultBackup?.[KEY]?.class_result?.criteria || {}, criteria)) {
                data['criteria'] = criteria;
            }
            // STUDENTS-RESULT
            data['student_marks'] = studentResults.reduce((acc, res) => {
                const stdBackupResult = resultBackup?.[KEY]?.student_results?.[res.student] || {};
                if (hasDifferences(stdBackupResult, res)) {
                    acc.push(res);
                }
                return acc;
            }, []);
            return data;
        }
        return {
            ...classResult,
            student_marks: studentResults
        }
    }
    async function onSaveEnteredMarks(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const KEY = getKey(selectedClass?.class_info?.id, closedAcademicYear || year?.academic_year, data.subject);
        const { student_marks, student_names } = formatStudentsResult(students[KEY]);
        const { isValid, errorEntry } = isMarksEntryValid(student_marks, data?.criteria || {});
        if (isValid) {
            let result = prepareUploadData(data, student_marks, data.subject);
            if (result?.criteria || result?.student_marks?.length > 0) {
                // statusHandler.toggleUploading();
                // console.log("SAVED!!!");
                // return;
                const [status, message, _] = await saveExamResult(result);
                updateNotification(status, message);
                if (status === 200) {
                    onReset();
                }
            } else {
                updateNotification('', 'Nothing changed!');
            }
        } else {
            if (errorEntry) {
                const studentName = student_names?.[errorEntry?.student];
                updateNotification('', `Invalid marks entries found for ${studentName}!`);
            } else {
                updateNotification('', "Invalid marks entries found!")
            }
        }
        statusHandler.toggleUploading();
    }
    // Remove a subject's marks header entirely. Use after clearing marks when
    // the subject should no longer appear as a column on the gradesheet.
    async function onDeleteHeader() {
        if (!data?.id) return;
        const [status, message] = await deleteExamResult({
            id: data.id,
            school: userProfile?.school || userProfile?.id,
            exam: data.exam,
            class_info: selectedClass.class_info.id,
        });
        if (!status) return; // cancelled at the confirm prompt;
        updateNotification(status, message);
        if (status === 200) {
            const KEY = getKey(selectedClass?.class_info?.id, closedAcademicYear || year?.academic_year, data.subject);
            setResultBackup(state => {
                const ns = { ...state };
                delete ns[KEY];
                return ns;
            });
            setStudents(state => {
                const ns = { ...state };
                delete ns[KEY];
                return ns;
            });
            setDataKey('');
            // keep the chosen exam, drop the deleted subject/header;
            setData(state => ({ ...marksEntrySchema, exam: state.exam }));
        }
    }
    // get attendance report generated from the app and fill in the marks entry form.
    function onAttendanceSearchChange({ name, value }) {
        setAttendanceSearchData(state => ({ ...state, [name]: value }));
    }
    async function onAttendanceSearch(e) {
        e.preventDefault();
        setIsAttendanceSearching(state => !state);
        const [status, msg, data] = await __search(ATTENDANCE_SEARCH_API, {
            ...attendanceSearchData,
            count: true,
        });
        if (data?.total_days) {
            updateFormWithAttendance(data);
        } else {
            updateNotification(status, msg);
        }
        setIsAttendanceSearching(state => !state);
    }
    function updateFormWithAttendance(attendanceData) {
        // update attendance field (i.e. total attendance days) in criteria.
        setData(state => {
            const ns = { ...state };
            ns.criteria.attendance = attendanceData.total_days.toString();
            return ns;
        });
        // 
        const KEY = getKey(selectedClass?.class_info?.id, closedAcademicYear || year?.academic_year, data.subject);
        setStudents(state => {
            const ns = { ...state };
            let students = ns?.[KEY] || [];
            if (students?.length > 0) {
                students = students.reduce((acc, std) => {
                    const studentID = std?.student || std?.id;
                    std.attendance = attendanceData?.data?.[studentID];
                    acc.push(std);
                    return acc;
                }, []);
                ns[KEY] = students;
            }
            return ns;
        });
    }
    // 
    function onReset() {
        if (prevClass) {
            setStudents(state => {
                const ns = { ...state };
                const KEY = getKey(prevClass, closedAcademicYear || year?.academic_year, data.subject);
                ns[KEY] = ns[KEY]?.reduce((acc, std) => {
                    acc.push({ ...std, ...studentResultSchema });
                    return acc;
                }, []);
                return ns;
            })
        }
        setPrevClass(selectedClass.class_info.id);
        setData({ ...marksEntrySchema });
    }

    useEffect(() => {
        onReset();
    }, [selectedClass.class_info.id]);
    // 
    function toggleAttendanceColumn() {
        const attendanceIndex = 6;
        let columns = [...defaultColumns];
        let editableColumns = [...defaultEditableColumns];
        if (data.subject === firstPeriodSubject) {
            columns.splice(attendanceIndex, 0, ['attendance']);
            editableColumns.push(['attendance']);
        }
        setColumns(columns);
        setEditableColumns(editableColumns);
    }
    function mapResultsByStudentIds(data) {
        const student_results = (data || []).reduce((acc, res) => {
            acc[res.student] = res;
            return acc;
        }, {});
        return student_results;
    }
    useEffect(() => {
        if (data?.exam && data?.subject) {
            toggleAttendanceColumn();
            // 
            setData(state => ({ ...marksEntrySchema, 'exam': state.exam, 'subject': state.subject }));
            // 
            (async () => {
                statusHandler.toggleFetching();
                const result = await fetchExamResults(selectedClass.class_info.id, data.exam, data.subject, null, null, null, null, null, closedAcademicYear || year?.academic_year, null);
                if (result) {
                    setData(state => ({ ...state, ...result?.class_result || {} }));
                    // MAPPED FOR EASY/FAST ACCESS;
                    const student_results = mapResultsByStudentIds(result?.student_results);
                    // backing-up;
                    const KEY = getKey(selectedClass?.class_info?.id, closedAcademicYear || year?.academic_year, data.subject);
                    setResultBackup(state => {
                        const ns = { ...state };
                        ns[KEY] = { ...ns?.[KEY] || {}, ...result, student_results };
                        return ns;
                    });
                    // 
                    showResultEntryForm(student_results, result?.class_result?.criteria || {});
                }
                statusHandler.toggleFetching();
            })();
        }
    }, [data?.exam, data?.subject]);
    // 
    return (
        <div className="my-5 flex flex-col">
            <>
                <>
                    <Section title={"Enter details"} description={"Must enter the data before marks entry!"}>
                        <>
                            <ClosedAcademicYearSelectInput value={closedAcademicYear} onChange={onClosedAcademicYearSelect} />
                            <ExamInput academic_year={closedAcademicYear || year?.academic_year} schoolId={user?.profile?.school || user?.profile?.id}
                                value={data?.exam} onChange={onChange} />
                            <span className="sm:col-span-4" />
                        </>
                        <>
                            <SelectInput input={{ name: "student_status", label: "Student Status", options: STUDENT_STATUS_OPTIONS }}
                                value={data?.student_status} onChange={onChange} />
                            <SearchInput input={{ name: 'subject', label: 'Subject', options: subjects }} value={data?.subject} onChange={onChange} />
                        </>
                    </Section>
                </>
                {/* criteria-inputs */}
                <div className="flex flex-col">
                    <span className="mb-5 flex gap-x-3 text-base items-center font-semibold">
                        <BookmarkIcon className="icon" />
                        Don't miss these fields! Enter criteria below to see marks entry form!
                    </span>
                    <div className="flex justify-around">
                        <div className="flex flex-col">
                            <span className="font-semibold underline mb-2">Theoretical (Th.)</span>
                            <TextInput input={{ name: 'fm_th', label: 'F.M.', type: 'number', preventWheel: true }} value={data?.criteria?.fm_th} onChange={onChange} />
                            <TextInput input={{ name: 'pm_th', label: 'P.M.', type: 'number', preventWheel: true }} value={data?.criteria?.pm_th} onChange={onChange} />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-semibold underline mb-2">Practical/Internal (Pr.)</span>
                            <TextInput input={{ name: 'fm_pr', label: 'F.M.', type: 'number', preventWheel: true }} value={data?.criteria?.fm_pr} onChange={onChange} />
                            <TextInput input={{ name: 'pm_pr', label: 'P.M.', type: 'number', preventWheel: true }} value={data?.criteria?.pm_pr} onChange={onChange} />
                        </div>
                        <div className="flex flex-col">
                            <span className="font-semibold underline mb-2">Total</span>
                            <TextInput input={{ name: 'fm', label: 'F.M.', type: 'number', preventWheel: true }} value={data?.criteria?.fm} onChange={onChange} />
                            <TextInput input={{ name: 'pm', label: 'P.M.', type: 'number', preventWheel: true }} value={data?.criteria?.pm} onChange={onChange} />
                        </div>
                        <div className="flex flex-col">
                            {firstPeriodSubject === data.subject &&
                                <>
                                    <span className="font-semibold underline mb-2">Attendance</span>
                                    <TextInput input={{ name: 'attendance', label: 'Total days', type: 'number' }} value={data?.criteria?.attendance} onChange={onChange} />
                                </>
                            }
                        </div>
                    </div>
                </div>
                <Warning warning={"Do Recalculate after criteria change."} />
                <ButtonsSecion>
                    {data?.id &&
                        <Button variant="outlined" color="red" onClick={onDeleteHeader}>
                            Delete Header
                        </Button>
                    }
                    <Button variant="outlined" onClick={() => {
                        const KEY = getKey(selectedClass?.class_info?.id, closedAcademicYear || year?.academic_year, data.subject);
                        const studentResults = mapResultsByStudentIds(students?.[KEY]);
                        const criteria = data?.criteria || {};
                        showResultEntryForm(studentResults, criteria, true);
                    }}
                        disabled={!data?.exam || !data?.subject || !data?.criteria?.fm || !data?.criteria?.pm}
                    >
                        {
                            fetching ? "Loading..." :
                                data?.id ? "Recalculate" : "Show Form"
                        }
                    </Button>
                </ButtonsSecion>
            </>
            <>
                {firstPeriodSubject === data.subject &&
                    <MarksEntryAttendanceSearchForm data={attendanceSearchData} onChange={onAttendanceSearchChange}
                        onSearch={onAttendanceSearch} isSearching={isAttendanceSearching} />
                }
            </>
            <div className="mt-2">
                <>
                    {
                        fetching ?
                            <Loader /> :
                            <>
                                {
                                    (students?.[dataKey]?.length > 0 &&
                                        data?.criteria?.fm &&
                                        data?.criteria?.pm &&
                                        !recalculationRequired) ?
                                        <form onSubmit={onSaveEnteredMarks}>
                                            <BasicTable showSelected={false} includeSN={true} name={"Marks Entry"} scroll={false}
                                                data={students[dataKey]}
                                                columns={columns} editable={true} editableColumns={editableColumns}
                                                onChange={onMarksEntry} onBlur={onBlur}
                                                onSelect={(action, id, _) => {
                                                    if (action === _toggleAction.action) {
                                                        const KEY = dataKey;
                                                        const index = students[KEY].findIndex(e => e.id === id);
                                                        if (index > -1) {
                                                            const status = students[KEY][index]?.absent || false;
                                                            onMarksEntry(index, 'absent', !status);
                                                        }
                                                    }
                                                }} actions={[_toggleAction]} header={
                                                    <CSVFileUpload hasHeaders={false} onReadComplete={onBulkMarksEntry} />
                                                } />
                                            <ButtonsSecion>
                                                <Button variant="outlined" onClick={onReset}>Reset</Button>
                                                <FormSaveButton saving={uploading} isUpdate={data?.id} disabled={!students?.[dataKey]} />
                                            </ButtonsSecion>
                                        </form> :
                                        <NotFound error="No students found!" />
                                }
                            </>
                    }
                </>
            </div>
        </div>
    )
}

export default MarksEntryForm;