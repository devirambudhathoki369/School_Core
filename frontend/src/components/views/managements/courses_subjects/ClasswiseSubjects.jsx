import { useMemo, useState } from "react";
import { AcademicCapIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { useAppContext } from "@/contexts/AppContext";
import EmptyState from "@/components/EmptyState";
import Loader from "@/components/Loader";
import Subjects from "./Subjects";

function ManageSubjectsClasswise() {
    const { class: { classesBackup, classesLoaded } } = useAppContext();
    const [selectedClass, setSelectedClass] = useState(null);
    const [query, setQuery] = useState("");
    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return needle
            ? classesBackup.filter(([name]) => String(name || "").toLowerCase().includes(needle))
            : classesBackup;
    }, [classesBackup, query]);

    if (!classesLoaded) return <Loader />;
    if (classesBackup.length === 0) {
        return <EmptyState icon={AcademicCapIcon} title="Create a class first"
            hint="Subjects belong to a saved class. Create the first class from School setup → Classes & periods, then return here." />;
    }

    return (
        <div className="flex flex-col gap-4">
            <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Choose a saved class</h2>
                        <p className="mt-1 text-sm text-gray-600">Select the class that will receive subjects. These are actual classes saved for this school.</p>
                    </div>
                    <label className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 sm:w-72">
                        <MagnifyingGlassIcon className="h-4 w-4 text-gray-400" />
                        <span className="sr-only">Search saved classes</span>
                        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search saved classes…"
                            className="min-w-0 flex-1 bg-transparent text-sm outline-none" />
                    </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    {visible.length > 0 ? visible.map(([classname, classInfo]) => {
                        const selected = selectedClass?.class_info?.id === classInfo?.id;
                        return (
                            <button type="button" key={classInfo?.id || classname}
                                onClick={() => setSelectedClass({ classname, class_info: classInfo })}
                                className={`rounded-lg border px-4 py-2 text-sm font-semibold capitalize transition
                                    ${selected ? "border-blue-600 bg-blue-600 text-white shadow" : "border-blue-gray-100 bg-white text-gray-700 hover:border-blue-300"}`}>
                                {classname}
                            </button>
                        );
                    }) : <p className="py-3 text-sm text-gray-500">No saved class matches that search.</p>}
                </div>
            </section>

            {selectedClass ?
                <section className="rounded-xl border border-blue-gray-100 bg-white p-4 shadow-sm">
                    <div className="mb-4 border-b border-gray-100 pb-3">
                        <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Subject setup</p>
                        <h2 className="mt-1 text-xl font-semibold capitalize">{selectedClass.classname}</h2>
                    </div>
                    <Subjects classId={selectedClass.class_info.id} />
                </section> :
                <EmptyState icon={AcademicCapIcon} title="Select a class above"
                    hint="The subject form and existing subjects will appear here immediately." />}
        </div>
    )
}

export default ManageSubjectsClasswise;
