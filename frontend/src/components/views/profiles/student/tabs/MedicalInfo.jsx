import { ALL_SECTIONS } from "..";
import { useEffect, useState } from "react";
import { Button, Textarea, Chip } from "@material-tailwind/react";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";
import { Section, ButtonsSecion } from "@/components/sections";
import { SelectInput } from "@/components/inputs";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import { useAppContext } from "@/contexts/AppContext";
import { useStudentProfile } from "@/contexts/StudentProfile";
import useRequestStatus from "@/hooks/requestStatus";
import {
    getStudentMedicalInfo,
    saveStudentMedicalInfo,
    deleteStudentMedicalInfo,
} from "@/services/functions/students";

const YES_NO_OPTIONS = [
    { value: false, name: "No" },
    { value: true, name: "Yes" },
];

const emptyForm = {
    id: null,
    has_chronic_illness: false,
    chronic_illness_details: "",
    allergies: "",
    previous_surgeries: "",
    physical_disability: "",
    has_vision_problem: false,
    vision_problem_details: "",
    has_hearing_problem: false,
    hearing_problem_details: "",
    current_medication: "",
    remarks: "",
};

const MODE = { VIEW: "view", EDIT: "edit", CREATE: "create" };

function asBool(v) {
    if (v === true || v === false) return v;
    return v === "true";
}

function normalizeRecord(data) {
    return {
        id: data?.id || null,
        has_chronic_illness: !!data?.has_chronic_illness,
        chronic_illness_details: data?.chronic_illness_details || "",
        allergies: data?.allergies || "",
        previous_surgeries: data?.previous_surgeries || "",
        physical_disability: data?.physical_disability || "",
        has_vision_problem: !!data?.has_vision_problem,
        vision_problem_details: data?.vision_problem_details || "",
        has_hearing_problem: !!data?.has_hearing_problem,
        hearing_problem_details: data?.hearing_problem_details || "",
        current_medication: data?.current_medication || "",
        remarks: data?.remarks || "",
    };
}

function YesNoChip({ value }) {
    const yes = asBool(value);
    return (
        <Chip
            value={yes ? "Yes" : "No"}
            color={yes ? "red" : "green"}
            variant="ghost"
            size="sm"
            className="w-fit"
        />
    );
}

function DataRow({ label, value, isBool = false, multiline = true }) {
    const empty = value === null || value === undefined || value === "";
    return (
        <div className="grid grid-cols-12 gap-4 py-3 border-b border-gray-200 last:border-b-0">
            <div className="sm:col-span-4 text-sm font-semibold text-gray-700">
                {label}
            </div>
            <div className="sm:col-span-8 text-sm text-gray-900">
                {isBool ? (
                    <YesNoChip value={value} />
                ) : empty ? (
                    <span className="italic text-gray-400">— not provided —</span>
                ) : multiline ? (
                    <p className="whitespace-pre-wrap break-words">{value}</p>
                ) : (
                    value
                )}
            </div>
        </div>
    );
}

function MedicalInfoView({ record, onEdit, onDelete, updatedAt }) {
    return (
        <div className="bg-white/70 rounded-lg shadow-sm border border-teal-100 p-5">
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
                <div>
                    <h3 className="text-lg font-bold text-gray-800">Medical History</h3>
                    {updatedAt && (
                        <p className="text-xs text-gray-500 mt-1">
                            Last updated: {new Date(updatedAt).toLocaleString()}
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outlined"
                        size="sm"
                        onClick={onEdit}
                        className="flex items-center gap-1.5"
                    >
                        <PencilSquareIcon className="h-4 w-4" />
                        Edit
                    </Button>
                    <Button
                        variant="outlined"
                        color="red"
                        size="sm"
                        onClick={onDelete}
                        className="flex items-center gap-1.5"
                    >
                        <TrashIcon className="h-4 w-4" />
                        Delete
                    </Button>
                </div>
            </div>
            <div className="divide-y divide-gray-100">
                <DataRow label="Chronic illness?" value={record.has_chronic_illness} isBool />
                {record.has_chronic_illness && (
                    <DataRow label="Chronic illness — details" value={record.chronic_illness_details} />
                )}
                <DataRow label="Allergies (food / medicine / others)" value={record.allergies} />
                <DataRow label="Previous surgeries or hospitalization" value={record.previous_surgeries} />
                <DataRow label="Physical disability" value={record.physical_disability} />
                <DataRow label="Vision problem?" value={record.has_vision_problem} isBool />
                {record.has_vision_problem && (
                    <DataRow label="Vision problem — details" value={record.vision_problem_details} />
                )}
                <DataRow label="Hearing problem?" value={record.has_hearing_problem} isBool />
                {record.has_hearing_problem && (
                    <DataRow label="Hearing problem — details" value={record.hearing_problem_details} />
                )}
                <DataRow label="Current medication" value={record.current_medication} />
                <DataRow label="Remarks" value={record.remarks} />
            </div>
        </div>
    );
}

function MedicalInfoForm({ form, onChange, onTextareaChange, onSubmit, onCancel, uploading, isUpdate }) {
    const showChronicDetails = asBool(form.has_chronic_illness);
    const showVisionDetails = asBool(form.has_vision_problem);
    const showHearingDetails = asBool(form.has_hearing_problem);

    return (
        <form onSubmit={onSubmit}>
            <Section
                title={"Medical History"}
                description={"All fields are optional. Save to create or update."}
            >
                {/* 1. Chronic illness */}
                <SelectInput
                    input={{ name: "has_chronic_illness", label: "Has chronic illness?", options: YES_NO_OPTIONS }}
                    value={form.has_chronic_illness}
                    onChange={onChange}
                />
                {showChronicDetails && (
                    <div className="sm:col-span-8">
                        <Textarea
                            label="If yes, specify"
                            name="chronic_illness_details"
                            value={form.chronic_illness_details}
                            onChange={onTextareaChange}
                            className="!text-base"
                        />
                    </div>
                )}

                {/* 2. Allergies */}
                <div className="sm:col-span-12">
                    <Textarea
                        label="Allergies (Food / Medicine / Others)"
                        name="allergies"
                        value={form.allergies}
                        onChange={onTextareaChange}
                        className="!text-base"
                    />
                </div>

                {/* 3. Previous surgeries */}
                <div className="sm:col-span-12">
                    <Textarea
                        label="Previous surgeries or hospitalization"
                        name="previous_surgeries"
                        value={form.previous_surgeries}
                        onChange={onTextareaChange}
                        className="!text-base"
                    />
                </div>

                {/* 4. Physical disability */}
                <div className="sm:col-span-12">
                    <Textarea
                        label="Physical disability (if any)"
                        name="physical_disability"
                        value={form.physical_disability}
                        onChange={onTextareaChange}
                        className="!text-base"
                    />
                </div>

                {/* 5. Vision problem */}
                <SelectInput
                    input={{ name: "has_vision_problem", label: "Vision problem?", options: YES_NO_OPTIONS }}
                    value={form.has_vision_problem}
                    onChange={onChange}
                />
                {showVisionDetails && (
                    <div className="sm:col-span-8">
                        <Textarea
                            label="Vision problem — details"
                            name="vision_problem_details"
                            value={form.vision_problem_details}
                            onChange={onTextareaChange}
                            className="!text-base"
                        />
                    </div>
                )}

                {/* 6. Hearing problem */}
                <SelectInput
                    input={{ name: "has_hearing_problem", label: "Hearing problem?", options: YES_NO_OPTIONS }}
                    value={form.has_hearing_problem}
                    onChange={onChange}
                />
                {showHearingDetails && (
                    <div className="sm:col-span-8">
                        <Textarea
                            label="Hearing problem — details"
                            name="hearing_problem_details"
                            value={form.hearing_problem_details}
                            onChange={onTextareaChange}
                            className="!text-base"
                        />
                    </div>
                )}

                {/* 7. Current medication */}
                <div className="sm:col-span-12">
                    <Textarea
                        label="Current medication (if any)"
                        name="current_medication"
                        value={form.current_medication}
                        onChange={onTextareaChange}
                        className="!text-base"
                    />
                </div>

                {/* Free-form remarks */}
                <div className="sm:col-span-12">
                    <Textarea
                        label="Remarks"
                        name="remarks"
                        value={form.remarks}
                        onChange={onTextareaChange}
                        className="!text-base"
                    />
                </div>
            </Section>
            <ButtonsSecion>
                <Button variant="outlined" type="button" onClick={onCancel}>
                    {isUpdate ? "Cancel" : "Reset"}
                </Button>
                <FormSaveButton isUpdate={isUpdate} saving={uploading} />
            </ButtonsSecion>
        </form>
    );
}

function MedicalInfoTab({ tab }) {
    const { user: { user }, notification: { updateNotification },
        prompt: { toggleConfirmationPrompt } } = useAppContext();
    const { data: { student }, view: { currentTab } } = useStudentProfile();
    const { fetching, uploading, statusHandler } = useRequestStatus();
    const [form, setForm] = useState({ ...emptyForm });
    const [savedRecord, setSavedRecord] = useState(null);
    const [updatedAt, setUpdatedAt] = useState(null);
    const [mode, setMode] = useState(MODE.CREATE);
    const schoolId = user?.profile?.school || user?.profile?.id;
    const studentId = student?.id;

    function onChange({ name, value }) {
        setForm((s) => ({ ...s, [name]: value }));
    }

    function onTextareaChange(e) {
        const { name, value } = e.target;
        setForm((s) => ({ ...s, [name]: value }));
    }

    useEffect(() => {
        if ((currentTab !== tab.key && currentTab !== ALL_SECTIONS) || !studentId || !schoolId) return;
        (async () => {
            statusHandler.toggleFetching();
            const data = await getStudentMedicalInfo(studentId, schoolId);
            if (data && data.id) {
                const norm = normalizeRecord(data);
                setForm(norm);
                setSavedRecord(norm);
                setUpdatedAt(data.updated_at || null);
                setMode(MODE.VIEW);
            } else {
                setForm({ ...emptyForm });
                setSavedRecord(null);
                setUpdatedAt(null);
                setMode(MODE.CREATE);
            }
            statusHandler.toggleFetching();
        })();
    }, [studentId, currentTab]);

    async function onSubmit(e) {
        e.preventDefault();
        if (!studentId || !schoolId) return;
        statusHandler.toggleUploading();
        const payload = {
            ...form,
            has_chronic_illness: asBool(form.has_chronic_illness),
            has_vision_problem: asBool(form.has_vision_problem),
            has_hearing_problem: asBool(form.has_hearing_problem),
            student: studentId,
            school: schoolId,
        };
        const [status, message, data] = await saveStudentMedicalInfo(payload);
        updateNotification(status, message);
        if (status === 200 || status === 201) {
            const saved = normalizeRecord(data?.record || payload);
            setForm(saved);
            setSavedRecord(saved);
            setUpdatedAt(data?.record?.updated_at || new Date().toISOString());
            setMode(MODE.VIEW);
        }
        statusHandler.toggleUploading();
    }

    function onEdit() {
        setMode(MODE.EDIT);
    }

    function onCancel() {
        if (savedRecord) {
            setForm(savedRecord);
            setMode(MODE.VIEW);
        } else {
            setForm({ ...emptyForm });
            setMode(MODE.CREATE);
        }
    }

    function onDelete() {
        if (!form.id) return;
        toggleConfirmationPrompt({
            header: "Delete this medical record?",
            onConfirm: async () => {
                const [status, message] = await deleteStudentMedicalInfo(
                    form.id, studentId, schoolId
                );
                if (status) {
                    updateNotification(status, message);
                    if (status === 200) {
                        setForm({ ...emptyForm });
                        setSavedRecord(null);
                        setUpdatedAt(null);
                        setMode(MODE.CREATE);
                    }
                }
            },
        });
    }

    if (fetching) return <Loader />;

    // VIEW MODE: saved record exists, show tabular display + Edit / Delete
    if (mode === MODE.VIEW && savedRecord) {
        return (
            <MedicalInfoView
                record={savedRecord}
                onEdit={onEdit}
                onDelete={onDelete}
                updatedAt={updatedAt}
            />
        );
    }

    // EDIT MODE or CREATE MODE: show form
    return (
        <MedicalInfoForm
            form={form}
            onChange={onChange}
            onTextareaChange={onTextareaChange}
            onSubmit={onSubmit}
            onCancel={onCancel}
            uploading={uploading}
            isUpdate={mode === MODE.EDIT}
        />
    );
}

export default MedicalInfoTab;
