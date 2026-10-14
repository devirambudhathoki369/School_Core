import { SelectInput } from "@/components/inputs";
import ChooseClass from "@/components/inputs/ChooseClass";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { selectAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import { fetchExams } from "@/services/functions/exams/exam";
import { searchStudents } from "@/services/functions/students";
import { Accordion, AccordionBody, AccordionHeader, Button } from "@material-tailwind/react";
import { FunnelIcon } from "@heroicons/react/24/solid";
import { useEffect, useState } from "react";
import ExtraActivityPicker from "./ExtraActivityPicker";
import { fetchExtraActivities, fetchExtraActivitiesEntries, saveExtraActivitiesEntry } from "@/services/functions/exams/extraActivities";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import { hasDifferences } from "@/methods/FlattenSchema";
import AcademicYearNotice from "@/components/AcademicYearNotice";

const CUSTOM_ANIMATION = {
    mount: { scale: 1 },
    unmount: { scale: 0.9 },
};

const inputSchema = { exam: '', extra_activities: [] }; // activities are selected-activities;
function ExtraActivitiesEntry() {
    const { user: { user }, fiscalYear: { year },
        notification: { updateNotification } } = useAppContext();
    const [selectedClass, setSelectedClass] = useState('');
    const [exams, setExams] = useState([]);
    const [students, setStudents] = useState({}); // backup for students;
    const [activities, setActivities] = useState([]); // backup for extra-activities;
    const [activitiesMapping, setActivitiesMapping] = useState({}); // {id: name};
    const [input, setInput] = useState({ ...inputSchema });
    const [pickedAllActivities, setPickedAllActivities] = useState(false);
    const [activitiesEntry, setActivitiesEntry] = useState([]);
    const [uploadedEntries, setUploadedEntries] = useState({});
    const [cols, setCols] = useState([]);
    const [editableCols, setEditableCols] = useState([]);
    // 
    const [searchOpened, setSearchOpened] = useState(false);
    const { uploading, statusHandler } = useRequestStatus();

    function onClassSelect(action, id, cls) {
        setSelectedClass(cls);
    }
    function updateEditableCols(cols) {
        cols = new Set(cols, editableCols.map(e => e[0]));
        cols = Array.from(cols);
        const extra_activities = cols.map(e => parseInt(e, 10));
        setInput(state => ({ ...state, extra_activities }));
        cols = cols.map(e => [e, activitiesMapping?.[e] || '']);
        setCols(cols);
        setEditableCols(cols);
    }
    function onChange({ name, value }) {
        if (name === "extra_activities") {
            updateEditableCols(value);
            // this is on-extra-activities-picked;
            // add extra-activities-ids to activitiesEntry and
            // also add them in editable columns;
            // name was assigned in ExtraActivityPicker;
            setActivitiesEntry(state => {
                const ns = state.reduce((acc, act) => {
                    const cols = value.reduce((acc2, eaId) => {
                        acc2[eaId] = '';
                        return acc2;
                    }, {});
                    const { student, name, class_info } = act;
                    acc.push({ student, name, class_info, ...cols });
                    return acc;
                }, []);
                return ns;
            });
        }
        setInput(state => ({ ...state, [name]: value }));
    }
    function onExtraActivityEntry(index, col, value) {
        setActivitiesEntry(state => {
            const ns = [...state];
            ns[index] = { ...ns[index], [col]: value };
            return ns;
        });
    }
    function prepareAndValidate(data, school) {
        if (!input?.exam) {
            updateNotification(404, "Exam must be selected");
            return;
        }
        let storedData = uploadedEntries?.[selectedClass?.class_info?.id] || {};
        data = data.reduce((acc, val) => {
            let { id, student, class_info, extra_activities, name, ...others } = val;
            let KEYS = Object.keys(others);
            KEYS = new Set(KEYS, input?.extra_activities || []);
            KEYS = Array.from(KEYS);
            // 
            extra_activities = KEYS.reduce((acc2, ea) => {
                const value = others[ea];
                if (value) acc2[ea] = value; // there must be a value;
                return acc2;
            }, {});
            const stdData = storedData?.[student];
            if (storedData && stdData) {
                const hasChanges = hasDifferences(stdData, { ...extra_activities, id });
                if (!hasChanges) extra_activities = {};
            }
            if (Object.keys(extra_activities).length > 0) {
                acc.push({ school, exam: input.exam, class_info, student, extra_activities });
            }
            return acc;
        }, []);
        return data?.length > 0 ? data : null;
    }
    async function uploadExtraActivityEntries(e) {
        const schoolId = user?.profile?.school || user?.profile?.id;
        e.preventDefault();
        const uploadData = prepareAndValidate(activitiesEntry, schoolId);
        if (uploadData) {
            statusHandler.toggleUploading();
            const [status, msg, res] = await saveExtraActivitiesEntry(uploadData);
            updateNotification(status, msg);
            if (status === 200) {
                if (res?.data && res?.data?.length > 0) {
                    updateLocalEntries(res.data);
                }
            }
            statusHandler.toggleUploading();
        } else {
            updateNotification(400, 'Invalid entries!');
        }
    }
    function updateLocalEntries(data) {
        const updates = data.reduce((acc, val) => {
            const { id, extra_activities } = val;
            acc[val.student] = { id, ...extra_activities };
            return acc;
        }, {});
        setUploadedEntries(state => {
            const ns = { ...state };
            const classData = ns?.[selectedClass.class_info.id] || {};
            ns[selectedClass.class_info.id] = { ...classData, ...updates };
            // console.log(ns);
            return ns;
        })
    }

    useEffect(() => {
        if (selectedClass?.class_info && year?.academic_year) {
            const schoolId = user?.profile?.school || user?.profile?.id;
            (async () => {
                let _activities = activities?.length > 0 ? activities : null,
                    _exams = exams?.[year.academic_year]?.length > 0 ? exams[year.academic_year] : null;
                if (!_activities) {
                    _activities = await fetchExtraActivities(schoolId);
                    if (_activities) {
                        setActivities(_activities);
                        setActivitiesMapping(_activities.reduce((acc, act) => {
                            acc[act.id] = act.name;
                            return acc;
                        }, {}));
                    } else {
                        setActivities([]);
                        setActivitiesMapping({});
                    }
                }
                if (!_exams) {
                    _exams = await fetchExams(schoolId, year.academic_year, true);
                    if (_exams) setExams(state => ({ ...state, [year.academic_year]: _exams }));
                }
            })();
        }
    }, [selectedClass?.class_info, input?.exam]);
    useEffect(() => {
        if (selectedClass?.class_info && input?.exam) {
            const schoolId = user?.profile?.school || user?.profile?.id;
            (async () => {
                let _uploadedEntries = uploadedEntries?.[selectedClass.class_info.id] || null;
                let status, message,
                    _students = students?.[selectedClass.class_info.id] || null;
                if (!_students) {
                    ([status, message, _students] = await searchStudents({ ...selectedClass.class_info }));
                    if (_students) setStudents(state => ({ ...state, [selectedClass.class_info.id]: _students }));
                    else setStudents(state => ({ ...state, [selectedClass.class_info.id]: [] }));
                }
                if (_students && !_uploadedEntries) {
                    _uploadedEntries = await fetchExtraActivitiesEntries(schoolId, input.exam, selectedClass.class_info.id, '');
                    const { entries } = _uploadedEntries;
                    _uploadedEntries = entries.reduce((acc, val) => {
                        acc[val.student] = { id: val.id, ...val?.extra_activities || {} };
                        return acc;
                    }, {});
                    _uploadedEntries = Object.keys(_uploadedEntries)?.length > 0 ? _uploadedEntries : null;
                    setUploadedEntries(state => ({ ...state, [selectedClass.class_info.id]: _uploadedEntries }));
                }
                // 
                if (_students) {
                    const KEYS = [];
                    const _activitiesEntry = _students.reduce((acc, std) => {
                        let id,
                            prevEntries = _uploadedEntries?.[std.id] || {}; // uploaded activities for student;
                        ({ id, ...prevEntries } = prevEntries);
                        KEYS.push(...Object.keys(prevEntries));
                        // 
                        const { name, class_info } = std;
                        // id is student-extra-activities-entry-id AND
                        // std has std.id passing as student alongside name, class_info AND
                        // already uploaded extra-activities-entries for student i.e. prevEntries;
                        const entry = { name, class_info, student: std.id, ...prevEntries };
                        if (id) entry['id'] = id;
                        acc.push(entry);
                        return acc;
                    }, []);
                    updateEditableCols(KEYS);
                    setActivitiesEntry(_activitiesEntry);
                } else {
                    updateEditableCols([]);
                    setActivitiesEntry([]);
                }
            })();
        }
    }, [selectedClass?.class_info, input?.exam]);

    return (
        <>
            <AcademicYearNotice />
            <ChooseClass selectedClass={selectedClass}
                info={""}
                actions={[selectAction]}
                onSelect={onClassSelect}>
                <>
                    <Section>
                        <SelectInput input={{ name: 'exam', label: 'Exam', options: exams?.[year?.academic_year] || [] }} value={input?.exam} onChange={onChange} />
                    </Section>
                </>
                <>
                    <Accordion className="z-10 sm:col-span-12 mb-5" open={searchOpened} animate={CUSTOM_ANIMATION}>
                        <AccordionHeader className="my-0 py-0 px-0 mx-0" onClick={() => {
                            setSearchOpened(state => !state);
                        }}>
                            <div className="flex items-center gap-x-3">
                                <FunnelIcon className="icon" />
                                <span>Choose extra activities before entry</span>
                            </div>
                        </AccordionHeader>
                        <AccordionBody className="py-0 ">
                            <div className={`bg-gray-300 p-3 rounded-md !m-0 overflow-y-scroll`}>
                                <ExtraActivityPicker activities={activities || []}
                                    data={input || {}} previousData={[]}
                                    onSelect={onChange} onSelectAll={onChange}
                                    allActivities={{ pickedAllActivities, setPickedAllActivities }} />
                                <ButtonsSecion>
                                    <Button variant="outlined" onClick={() => {
                                        setSearchOpened(false);
                                    }}>Close</Button>
                                </ButtonsSecion>
                            </div>
                        </AccordionBody>
                    </Accordion>
                </>
                <form onSubmit={uploadExtraActivityEntries}>
                    <BasicTable name={"Extra Activities Entry"} data={activitiesEntry || []}
                        columns={[['name'], ...cols]}
                        editable={true} editableColumns={editableCols}
                        onChange={onExtraActivityEntry} onBlur={() => null}
                        onSelect={() => null} showSelected={false}
                    />
                    <ButtonsSecion>
                        <FormSaveButton isUpdate={uploadedEntries?.[selectedClass?.class_info?.id]} saving={uploading} />
                    </ButtonsSecion>
                </form>
            </ChooseClass>
        </>
    )
}

export default ExtraActivitiesEntry;