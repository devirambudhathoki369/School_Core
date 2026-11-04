import { useAppContext } from "@/contexts/AppContext";
import { saveClass } from "@/services/functions/classes";
import { useMemo, useState } from "react";
import { Button, Typography } from "@material-tailwind/react";
import ClassPicker from "@/components/inputs/ClassPicker";
import classPickerSchema from "@/schemas/class-picker";
import { FilterSection } from "@/components/sections";
import cleanClassInfo from "@/methods/cleanClassInfo";
import ClassDetails from "./ClassDetails";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import { AcademicCapIcon, CheckCircleIcon, ClockIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { SearchInput } from "@/components/inputs";
import genAcademicYearMappingKey, { prepareNameValue } from "@/methods/genAcademicYearMappingKey";
import { facultyOptions, gradeOptions, gradeOptions2, options as educationOptions, semesterOptions, yearOptions } from "@/components/inputs/options/education";
import EmptyState from "@/components/EmptyState";
import Loader from "@/components/Loader";

const academic_year_triggerers = ["education_level", "grade", "year", "semester"];
const newClassSchema = { ...classPickerSchema };
const optionName = (rows, value) => rows.find(item => Number(item.value) === Number(value))?.name;
function classIsReady(data) {
    const level = Number(data?.education_level);
    if (!level || !data?.academic_year) return false;
    if ([2, 3, 10].includes(level) && !data?.grade) return false;
    if (level === 3 && !data?.faculty) return false;
    if ([4, 5, 8, 9].includes(level) && (!data?.course || (!data?.year && !data?.semester))) return false;
    return true;
}

function SetupProgress({ data }) {
    const level = Number(data?.education_level);
    const structureChosen = !level || ![2, 3, 10].includes(level) || !!data?.grade;
    const detailsChosen = level !== 3 || !!data?.faculty;
    const steps = [
        ["Education level", !!level],
        ["Class details", structureChosen && detailsChosen],
        ["Review & save", !!data?.academic_year],
    ];
    return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {steps.map(([label, done], index) => (
                <div key={label} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold
                    ${done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-white text-gray-500"}`}>
                    {done ? <CheckCircleIcon className="h-5 w-5" /> : <span className="grid h-5 w-5 place-items-center rounded-full border text-xs">{index + 1}</span>}
                    {label}
                </div>
            ))}
        </div>
    );
}

function ClassSummary({ data }) {
    const level = Number(data?.education_level);
    const grades = level === 3 ? gradeOptions2 : gradeOptions;
    const rows = [
        ["Education", optionName(educationOptions, level)],
        ["Grade", optionName(grades, data?.grade)],
        ["Faculty", optionName(facultyOptions, data?.faculty)],
        ["Year", optionName(yearOptions, data?.year)],
        ["Semester", optionName(semesterOptions, data?.semester)],
        ["Section", data?.section ? "Selected" : "None"],
    ].filter(([, value]) => value);
    return (
        <aside className="h-fit rounded-xl border border-blue-100 bg-blue-50/70 p-4 lg:sticky lg:top-3">
            <div className="flex items-center gap-2 text-blue-800">
                <AcademicCapIcon className="h-5 w-5" />
                <h3 className="font-semibold">Class preview</h3>
            </div>
            {rows.length > 1 ? (
                <dl className="mt-3 divide-y divide-blue-100 rounded-lg bg-white px-3">
                    {rows.map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-3 py-2 text-sm">
                            <dt className="text-gray-500">{label}</dt>
                            <dd className="text-right font-semibold capitalize text-gray-800">{value}</dd>
                        </div>
                    ))}
                </dl>
            ) : <p className="mt-3 text-sm leading-5 text-gray-600">Start by choosing an education level. Your class will be summarized here before it is saved.</p>}
            <p className="mt-3 text-xs leading-5 text-gray-500">Only the saved result becomes a class. The options on the left are reusable system choices.</p>
        </aside>
    );
}
function ManageClasses() {
    const { user: { user },
        fiscalYear: { year, years, assignedAcademicYears },
        class: { classesBackup, classesLoaded, loadClasses },
        notification: { updateNotification } } = useAppContext();
    newClassSchema["school"] = user?.profile?.school || user?.profile?.id;
    newClassSchema["academic_year"] = year?.academic_year;
    const [newClass, setNewClass] = useState({ ...newClassSchema });
    const [selectedClass, setSelectedClass] = useState(null);
    const [activeTab, setActiveTab] = useState("classes");
    const [classSearch, setClassSearch] = useState("");
    const { uploading, statusHandler } = useRequestStatus();
    const visibleClasses = useMemo(() => {
        const query = classSearch.trim().toLowerCase();
        if (!query) return classesBackup;
        return classesBackup.filter(([classname]) => String(classname || "").toLowerCase().includes(query));
    }, [classesBackup, classSearch]);
    // 
    function onInputChange({ name, value }) {
        setNewClass(state => {
            const ns = { ...state };
            ns[name] = value;
            if (academic_year_triggerers.includes(name)) {
                const { name, value } = prepareNameValue(ns);
                const key = genAcademicYearMappingKey(name, value, ns);
                if (key) {
                    ns["academic_year"] = assignedAcademicYears?.[key]?.academic_year;
                }
            }
            return ns;
        });
    }
    function reset() {
        setNewClass({ ...newClassSchema });
    }
    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const [status, message,] = await saveClass(cleanClassInfo(newClass));
        updateNotification(status, message);
        if (status === 200) {
            reset();
            await loadClasses(null, true);
            setActiveTab("periods");
        }
        statusHandler.toggleUploading();
    }
    function onSelect(item) {
        setSelectedClass(item);
    }
    // 
    return (
        <div className="flex flex-col gap-4">
            <nav className="grid grid-cols-2 rounded-xl border border-blue-gray-100 bg-white p-1 shadow-sm" aria-label="Class management">
                <button type="button" onClick={() => setActiveTab("classes")}
                    className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition
                        ${activeTab === "classes" ? "bg-blue-600 text-white shadow" : "text-gray-600 hover:bg-blue-gray-50"}`}>
                    <AcademicCapIcon className="h-5 w-5" /> Class setup
                </button>
                <button type="button" onClick={() => setActiveTab("periods")}
                    className={`flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition
                        ${activeTab === "periods" ? "bg-blue-600 text-white shadow" : "text-gray-600 hover:bg-blue-gray-50"}`}>
                    <ClockIcon className="h-5 w-5" /> Period setup
                </button>
            </nav>

            {activeTab === "classes" ?
            <div className="my-3 rounded-2xl border border-blue-gray-100 bg-white p-4 shadow-sm sm:p-5">
                <form onSubmit={onSave} className="flex flex-col gap-5">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">Guided setup</p>
                        <Typography variant="h4" className="mt-1">Create a class</Typography>
                        <p className="mt-1 text-sm text-gray-600">Make the required choices from left to right. Nothing is created until you review and press Save.</p>
                    </div>
                    <SetupProgress data={newClass} />
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
                        <div className="min-w-0 rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                    {/* Deliberately NOT `classwise`: this form CREATES classes, so it must
                        offer every section the school has. Everywhere else the picker
                        filters a class that already exists, and passes classwise={true}
                        so it can only offer sections actually assigned to that class. */}
                            <ClassPicker data={newClass} onChange={onInputChange} handleAcademicYear={false} />
                            <FilterSection title={"Academic Year"}>
                                <SearchInput input={{ name: "academic_year", label: "Academic Year", options: years?.academicYears || [] }}
                                    value={newClass?.academic_year} onChange={onInputChange} />
                            </FilterSection>
                        </div>
                        <div className="flex flex-col gap-3">
                            <ClassSummary data={newClass} />
                            <div className="flex gap-2 rounded-xl border border-gray-100 bg-white p-3">
                                <Button type="button" variant="outlined" className="flex-1" onClick={reset}>Reset</Button>
                                <FormSaveButton isUpdate={false} saving={uploading} disabled={!classIsReady(newClass)} />
                            </div>
                        </div>
                    </div>
                </form>
            </div> :
            <section className="rounded-2xl border border-blue-gray-100 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">Timetable structure</p>
                        <Typography variant="h4" className="mt-1">Set up class periods</Typography>
                        <p className="mt-1 text-sm text-gray-600">Choose one saved class. Only actual classes from this school are shown here.</p>
                    </div>
                    {classesBackup.length > 0 &&
                        <label className="mt-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 sm:mt-0 sm:w-72">
                            <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
                            <span className="sr-only">Search saved classes</span>
                            <input value={classSearch} onChange={(e) => setClassSearch(e.target.value)}
                                placeholder="Search saved classes…" className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                        </label>}
                </div>

                {!classesLoaded ? <div className="mt-4"><Loader /></div> : classesBackup.length === 0 ?
                    <div className="mt-4"><EmptyState icon={AcademicCapIcon} title="Create a class first"
                        hint="Period setup applies to a saved class. Open the Class setup tab, create the first class, and you will be brought back here automatically." /></div> :
                    <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
                        <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50 p-2">
                            {visibleClasses.length > 0 ? visibleClasses.map((item) => {
                                const [classname, classInfo] = item;
                                const selected = selectedClass?.class_info?.id === classInfo?.id;
                                return (
                                    <button type="button" key={classInfo?.id || classname}
                                        onClick={() => onSelect({ classname, class_info: classInfo })}
                                        className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition
                                            ${selected ? "border-blue-400 bg-blue-50 text-blue-800 shadow-sm" : "border-transparent bg-white text-gray-700 hover:border-blue-200"}`}>
                                        <span className="min-w-0 truncate font-semibold capitalize">{classname}</span>
                                        <span className="text-xs font-semibold">{selected ? "Selected" : "Configure"}</span>
                                    </button>
                                );
                            }) : <p className="p-4 text-center text-sm text-gray-500">No saved class matches that search.</p>}
                        </div>
                        <div className="min-w-0">
                            {selectedClass ? <ClassDetails selectedClass={selectedClass} /> :
                                <EmptyState icon={ClockIcon} title="Choose a class"
                                    hint="Select a saved class from the list to define its number of periods, subjects, and teachers." />}
                        </div>
                    </div>}
            </section>}
        </div>
    )
}

export default ManageClasses;
