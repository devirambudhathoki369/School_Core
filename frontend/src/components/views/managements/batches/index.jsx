import { useEffect, useState } from "react";

import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { Section, ButtonsSecion } from "@/components/sections";
import { SelectInput, TextInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import BasicTable from "@/components/tables/BasicTable";
import { editAction, deleteAction } from "@/components/tables/actions";
import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import { fetchCourses } from "@/services/functions/courses";
import { fetchBatches, saveBatch, deleteBatch, SEMESTER_OPTIONS, YEAR_OPTIONS, STRUCTURE_OPTIONS } from "@/services/functions/batches";

// Education levels that carry a batch/cohort dimension (higher education).
const HIGHER_ED_LABELS = { 4: "Bachelor", 5: "Master", 8: "Pre-diploma", 9: "Diploma" };
const HIGHER_ED_LEVELS = Object.keys(HIGHER_ED_LABELS).map(Number);

const emptyForm = () => ({
    id: null,
    course: "",
    year: "",
    start_academic_year: "",
    // "semester" or "year": how the program is organised. Drives which of
    // current_semester / current_year is captured & sent.
    structure: "semester",
    current_term: "",
    graduated: false,
});

function ManageBatches() {
    const {
        user: { user },
        fiscalYear: { years },
        notification: { updateNotification },
    } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [form, setForm] = useState(emptyForm());
    const [batches, setBatches] = useState([]);
    const [courses, setCourses] = useState([]);
    const { fetching, uploading, statusHandler } = useRequestStatus();

    const academicYearOptions = years?.academicYears || [];

    async function loadCourses() {
        const rows = await fetchCourses(schoolId);
        const higherEd = (Array.isArray(rows) ? rows : [])
            .filter((c) => HIGHER_ED_LEVELS.includes(c.education_level))
            .map((c) => ({ name: c.course, value: c.id, education_level: c.education_level }));
        setCourses(higherEd);
    }

    async function loadBatches() {
        statusHandler.toggleFetching();
        const data = await fetchBatches(schoolId);
        setBatches(Array.isArray(data) ? data : []);
        statusHandler.toggleFetching();
    }

    useEffect(() => {
        if (!schoolId) return;
        loadCourses();
        loadBatches();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schoolId]);

    function onChange({ name, value }) {
        setForm((s) => ({ ...s, [name]: value }));
    }

    function resetForm() {
        setForm(emptyForm());
    }

    async function onSave(e) {
        e.preventDefault();
        if (!form.year?.trim()) return updateNotification("", "Admission year is required.");
        if (!form.course) return updateNotification("", "Pick a course.");
        statusHandler.toggleUploading();
        const isYear = form.structure === "year";
        const payload = {
            id: form.id || undefined,
            school: schoolId,
            course: form.course,
            year: form.year.trim(),
            start_academic_year: form.start_academic_year || null,
            // send the term into the matching field; clear the other so a
            // structure switch never leaves a stale value behind.
            current_semester: isYear ? null : (form.current_term || null),
            current_year: isYear ? (form.current_term || null) : null,
            graduated: form.graduated,
        };
        const [status, message] = await saveBatch(payload);
        statusHandler.toggleUploading();
        if (status === 200) {
            updateNotification(200, form.id ? "Batch updated!" : "Batch added!");
            resetForm();
            loadBatches();
        } else {
            updateNotification(400, message || "Failed to save batch.");
        }
    }

    function onEdit(id) {
        const b = batches.find((x) => x.id === id);
        if (!b) return;
        const isYear = !!b.current_year && !b.current_semester;
        setForm({
            id: b.id,
            course: b.course || "",
            year: b.year || "",
            start_academic_year: b.start_academic_year || "",
            structure: isYear ? "year" : "semester",
            current_term: (isYear ? b.current_year : b.current_semester) || "",
            graduated: !!b.graduated,
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function onDelete(id) {
        // deleteBatch → __delete already prompts for confirmation; returns [] on
        // cancel, so bail quietly rather than flashing a false error.
        const [status, message] = await deleteBatch(schoolId, id);
        if (status === undefined) return;
        if (status === 200) {
            updateNotification(200, "Batch deleted!");
            loadBatches();
        } else {
            // e.g. 409 — "Cannot delete: this batch is still used by students…"
            updateNotification(400, message || "Failed to delete batch.");
        }
    }

    // display rows for the table
    const rows = batches.map((b) => ({
        id: b.id,
        year: b.year,
        course_name: b.course_name || "—",
        level: HIGHER_ED_LABELS[b.education_level] || "—",
        start_academic_year_name: b.start_academic_year_name || "—",
        term: b.current_year ? `Year ${b.current_year}` : (b.current_semester ? `Sem ${b.current_semester}` : "—"),
        graduated: b.graduated ? "Yes" : "No",
    }));

    return (
        <>
            <form onSubmit={onSave}>
                <Section title={form.id ? "Edit Batch" : "Add Batch"}
                    description="A batch is a higher-ed intake (Bachelor/Master/Diploma) identified by course and admission year. Adding one here does not change any class, student or fee.">
                    <SelectInput input={{ name: "course", label: "Course", options: courses }}
                        value={form.course} onChange={onChange} />
                    <TextInput input={{ name: "year", label: "Admission year (B.S.)", placeholder: "e.g. 2079" }}
                        value={form.year} onChange={onChange} />
                    <SelectInput input={{ name: "start_academic_year", label: "Start academic year", options: academicYearOptions }}
                        value={form.start_academic_year} onChange={onChange} />
                    <SelectInput input={{ name: "structure", label: "Program structure", options: STRUCTURE_OPTIONS }}
                        value={form.structure}
                        onChange={({ value }) => setForm((s) => ({ ...s, structure: value, current_term: "" }))} />
                    <SelectInput input={{
                        name: "current_term",
                        label: form.structure === "year" ? "Current year" : "Current semester",
                        options: form.structure === "year" ? YEAR_OPTIONS : SEMESTER_OPTIONS,
                    }} value={form.current_term} onChange={onChange} />
                    <div className="flex items-center">
                        <Checkbox name="graduated" text="Graduated (finished final semester)"
                            checked={form.graduated} onClick={() => onChange({ name: "graduated", value: !form.graduated })} />
                    </div>
                </Section>
                <ButtonsSecion>
                    {form.id && <button type="button" onClick={resetForm} className="col-span-2 text-sm text-gray-600 underline">Cancel</button>}
                    <div className="col-span-9"></div>
                    <FormSaveButton isUpdate={form.id} saving={uploading} disabled={uploading} />
                </ButtonsSecion>
            </form>

            {fetching ? <Loader /> : (
                rows.length > 0 ? (
                    <BasicTable name={"Batches"} columns={[
                        ["year", "Admission Year"],
                        ["course_name", "Course"],
                        ["level", "Level"],
                        ["start_academic_year_name", "Start A.Y."],
                        ["term", "Current Term"],
                        ["graduated", "Graduated"],
                    ]} data={rows} onSelect={(action, id) => {
                        if (action === editAction.action) onEdit(id);
                        else if (action === deleteAction.action) onDelete(id);
                    }} actions={[editAction, deleteAction]} />
                ) : (
                    <NotFound error="No batches yet. Add a batch above." />
                )
            )}
        </>
    );
}

export default ManageBatches;
