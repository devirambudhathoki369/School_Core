import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { Button, Tooltip } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import { ArrowLeftIcon, TrashIcon } from "@heroicons/react/24/outline";
import BasicTable from "@/components/tables/BasicTable";
import Link from "next/link";
import { examScheduleSchema } from "@/schemas/exam";
import { deleteExamSchedule, fetchExamSchedule, saveExamSchedule } from "@/services/functions/exams/examSchedule";
import { useAppContext } from "@/contexts/AppContext";
import ExamInput from "@/components/inputs/ExamInput";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import Loader from "@/components/Loader";
import scheduleAsArray, { sortSchedule } from "@/methods/exams/scheduleAsArray.js";
import { fetchClassPeriodSubjects } from "@/services/functions/classes";
import AttentionBox from "@/components/AttentionBox";

const DateRegex = /^\d{4}([^\d])\d{2}\1\d{2}$/;
export function RoutineSetupForm({ selectedClass, setSelectedClass }) {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    const [data, setData] = useState({ ...examScheduleSchema });
    const [subjectsBackup, setSubjectsBackup] = useState([]);
    const [scheduleBackup, setScheduleBackup] = useState({});
    const { fetching, uploading, statusHandler } = useRequestStatus();
    // 
    function onDataChange({ name, value }) {
        if (name === "exam") {
            const classSchedule = scheduleBackup?.[value] || null;
            if (classSchedule) {
                const schedule = scheduleAsArray(subjectsBackup, classSchedule.schedule, false);
                setData({ ...examScheduleSchema, ...classSchedule, schedule });
            } else {
                setData({ ...examScheduleSchema, schedule: subjectsBackup });
            }
        }
        setData(state => ({ ...state, [name]: value }));
    }
    function onRoutineDataChange(index, name, value) {
        setData(state => {
            const newState = { ...state };
            newState.schedule[index] = { ...newState.schedule[index], [name]: value };
            return newState;
        });
    }
    function onRoutineDataBlur(index, col, value) {
        if (col === "date") {
            setData(state => {
                const newState = { ...state };
                if (value && !DateRegex.test(value)) {
                    newState.schedule[index].date = "";
                    const subjectName = newState?.schedule?.[index]?.subject;
                    if (subjectName) {
                        updateNotification(400, `Invalid date for subject ${subjectName}!`);
                    } else {
                        updateNotification(400, `Invalid date at row ${index + 1}!`);
                    }
                } else {
                    newState.schedule = sortSchedule(newState?.schedule || []);
                }
                return newState;
            });
        }
    }
    // 
    function onReset() {
        setData({ ...examScheduleSchema });
        if (data?.exam) setScheduleBackup(state => ({ ...state, [data.exam]: null }));
        setSelectedClass('');
    }
    function formatScheduleAndValidate(schedule) {
        // return null if is invalid;
        // schedule.length === subjects.length;
        // and each id and date should be valid and not empty!
        if (!schedule.every(item => item?.date ? DateRegex.test(item.date) : true)) {
            updateNotification(400, "Invalid dates!");
            return null;
        }
        return schedule.reduce((acc, _sub) => {
            acc[_sub.id] = _sub.date;
            return acc;
        }, {});
    }
    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const schedule = formatScheduleAndValidate(data.schedule);
        if (schedule) {
            const uploadData = {
                ...data,
                schedule,
                class_info: selectedClass.class_info.id
            };
            const [status, message,] = await saveExamSchedule(uploadData);
            updateNotification(status, message);
            if (status === 200) {
                onReset();
            }
        }
        statusHandler.toggleUploading();
    }
    async function onExamScheduleDelete() {
        const [status, message,] = await deleteExamSchedule(data.id, data.class_info);
        updateNotification(status, message);
        if (status === 200) {
            onReset();
        }
    }
    // 
    useEffect(() => {
        if (selectedClass?.class_info?.id) {
            statusHandler.toggleFetching();
            (async () => {
                const { data: _subjects } = await fetchClassPeriodSubjects(selectedClass.class_info.id, true, '', '', false, true);
                if (_subjects?.length > 0) {
                    setSubjectsBackup(_subjects);
                    const schedule = scheduleAsArray(_subjects, {}, false);
                    setData({ ...examScheduleSchema, schedule });
                    setScheduleBackup(state => ({ ...state, [data.exam]: schedule }));
                } else {
                    updateNotification(404, "Subjects not found!");
                }
            })();
            statusHandler.toggleFetching();
        }

        return () => {
            setSubjectsBackup([]);
            setScheduleBackup(state => ({ ...state, [data.exam]: [] }));
            setData({ ...examScheduleSchema });
        };
    }, [selectedClass.class_info.id]);
    useEffect(() => {
        let classSchedule = scheduleBackup?.[data?.exam] || null;
        let _subjects = subjectsBackup?.length > 0 ? subjectsBackup : null;
        if (_subjects && !classSchedule && data?.exam) {
            statusHandler.toggleFetching();
            (async () => {
                classSchedule = await fetchExamSchedule(selectedClass.class_info.id, data.exam);
                // ---
                if (classSchedule) {
                    const schedule = scheduleAsArray(_subjects, classSchedule.schedule, false);
                    setData({ ...examScheduleSchema, ...classSchedule, schedule });
                    setScheduleBackup(state => ({ ...state, [classSchedule.exam]: classSchedule }));
                } else {
                    setData(state => ({ ...state, schedule: _subjects }));
                }
            })();
            statusHandler.toggleFetching();
        }
    }, [data.exam]);
    // 
    return (
        <div className="my-5 flex flex-col">
            {fetching ? <Loader /> :
                <>
                    {data?.schedule?.length > 0 ?
                        <>
                            <AttentionBox title={"NOTE"} description={
                                `Make sure you've set up [Manage > Classes/Periods > Manage Class/Periods] before proceeding.`
                            } dismissable={false} />
                            <ButtonsSecion>
                                <Tooltip content="Delete this schedule">
                                    <Button disabled={!data?.id} variant="outlined" onClick={onExamScheduleDelete}>
                                        <TrashIcon className="icon" />
                                    </Button>
                                </Tooltip>
                            </ButtonsSecion>
                            <form onSubmit={onSave}>
                                <Section>
                                    <ExamInput academic_year={year.academic_year} schoolId={user?.profile?.school || user?.profile?.id} value={data?.exam} onChange={onDataChange} />
                                    <TextInput input={{ name: 'start_time', label: 'Start time', placeholder: '10:00' }}
                                        value={data?.start_time} onChange={onDataChange} />
                                    <TextInput input={{ name: 'end_time', label: 'End time', placeholder: '1:00' }}
                                        value={data?.end_time} onChange={onDataChange} />
                                </Section>
                                <>
                                    <BasicTable name={"Exam Schedule Setup"} columns={[['subject'], ['date']]} data={data.schedule}
                                        editable={true} editableColumns={[['date']]}
                                        onSelect={() => null}
                                        onChange={onRoutineDataChange}
                                        onBlur={onRoutineDataBlur}
                                        showSelected={false}
                                        footer={<ButtonsSecion>
                                            <Button onClick={onReset} variant="outlined">Reset</Button>
                                            <FormSaveButton saving={uploading} isUpdate={data?.id} disabled={!data.exam || uploading} />
                                        </ButtonsSecion>} />
                                </>
                            </form>
                        </>
                        :
                        <Link href={'admin#manage.classes'} className="flex items-center gap-x-2 bg-blue-gray-100 w-max p-2 rounded-md mx-auto">
                            <ArrowLeftIcon className="icon" />
                            No, subjects found!, Go to manage class teachers and subjects
                        </Link>
                    }
                </>
            }
        </div>
    );
}
