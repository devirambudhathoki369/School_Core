import { Fragment } from "react";
import { SearchInput } from "@/components/inputs";
import { ButtonsSecion, FilterSection } from "@/components/sections";
import { __fetch } from "@/services/functions";
import { fetchSchools } from "@/services/functions/schools";
import { useEffect, useState } from "react";
import useRequestStatus from "@/hooks/requestStatus";
import FormSaveButton from "@/components/buttons/FormSaveButton";

// 
const DEFAULT_COLS = ['active', 'deleted'];
const MODELS1 = {
    "students": [
        ...DEFAULT_COLS,
        "running", "passed_out", "dropped_out", "male", "female", "others"
    ], "student_discounts": null, "student_transportations": null
};
const MODELS2 = {
    "staffs": [
        ...DEFAULT_COLS,
        "employed", "departed", "retired", "on_leave", "male", "female", "others"
    ],
};
const MODELS3 = {
    "fee_titles": null, "fees": null, "invoices": null, "ledgers": null,
}
const MODELS4 = {
    "classes": null, "periods": null,
    "academic_years": null,
    "stations": null, "subjects": null, "courses": null, "sections": null,
};
const MODELS5 = {
    "exams": null, "exam_schedules": null, "class_results": null, "student_results": null,
    "extra_activities": null, "extra_activity_entries": null,
    "certificates": null,
}
// 
const searchSchema = { school: '' };
function SchoolStatistics() {
    const [schools, setSchools] = useState([]);
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [stats, setStats] = useState({});
    const { searching, statusHandler } = useRequestStatus();
    // 
    function onSearchInputChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const data = await __fetch('/api/dashboard', { ...searchInput, statistics: true })
        setStats(state => ({ ...state, [searchInput.school]: data }));
        statusHandler.toggleSearching();
        // console.log(data);
    }
    // 
    useEffect(() => {
        (async () => {
            const data = await fetchSchools({}, true);
            setSchools(data);
        })();
    }, []);
    // 
    return (
        <>
            <form onSubmit={onSearch}>
                <FilterSection title={"School"}>
                    <SearchInput input={{ name: 'school', label: 'School', options: schools }} value={searchInput.school} onChange={onSearchInputChange} />
                </FilterSection>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>

            {stats?.[searchInput.school] ?
                <div className="flex flex-col gap-4 mt-4">
                    <StatsGroup title="Students" MODELS={MODELS1} stats={stats} school={searchInput.school} />
                    <StatsGroup title="Staff" MODELS={MODELS2} stats={stats} school={searchInput.school} />
                    <StatsGroup title="Finance" MODELS={MODELS3} stats={stats} school={searchInput.school} />
                    <StatsGroup title="Academic setup" MODELS={MODELS4} stats={stats} school={searchInput.school} />
                    <StatsGroup title="Exams & results" MODELS={MODELS5} stats={stats} school={searchInput.school} />
                </div> :
                <div className="mt-6 rounded-xl border border-dashed border-blue-gray-200 bg-white p-10 text-center">
                    <p className="font-semibold text-blue-gray-700">Choose a school to see its numbers</p>
                    <p className="mt-1 text-sm text-blue-gray-500">Every record type is counted, active and deleted.</p>
                </div>
            }
        </>
    )
}

// A metric reads value-first: the number is what is being looked for, the label
// only says what it counts. "deleted" is the one figure that should stand out
// when it is not zero, so it carries colour and the rest stay neutral.
function Metric({ label, value }) {
    const isDeleted = label === "deleted";
    const empty = !value || value === "0";
    return (
        <div className={`rounded-lg px-3 py-2 ${isDeleted && !empty ? "bg-rose-50" : "bg-blue-gray-50/60"}`}>
            <div className={`text-lg font-bold leading-6 ${isDeleted && !empty ? "text-rose-700" : "text-blue-gray-900"}`}>
                {value}
            </div>
            <div className="text-[0.7rem] uppercase tracking-wide text-blue-gray-500 leading-3 mt-1 break-words">
                {label.replaceAll("_", " ")}
            </div>
        </div>
    );
}

function StatsGroup({ title, MODELS, stats, school }) {
    return (
        <section className="rounded-xl border border-blue-gray-100 bg-white p-4">
            <h3 className="flex items-center gap-2 text-base font-semibold text-blue-gray-800 mb-3">
                <span className="inline-block h-4 w-1 rounded-full bg-[var(--t-brand-solid)]" />
                {title}
            </h3>
            {/* One card per record type, each holding its own metrics. The old
                layout put every model side by side in a single table row, which
                ran far past the screen and could only be read by scrolling. */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {Object.keys(MODELS).map((model) => {
                    const cols = MODELS?.[model] || DEFAULT_COLS;
                    return (
                        <div key={model} className="rounded-lg border border-blue-gray-100 p-3">
                            <div className="text-[0.78rem] font-bold uppercase tracking-wide text-teal-800 mb-2 break-words">
                                {model.replaceAll("_", " ")}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {cols.map((col) => (
                                    <Metric key={col} label={col}
                                        value={(stats[school]?.[model]?.[col] || 0).toString()} />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

export default SchoolStatistics;