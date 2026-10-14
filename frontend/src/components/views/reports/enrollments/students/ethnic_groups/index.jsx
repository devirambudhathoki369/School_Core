import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ExclamationCircleIcon, IdentificationIcon, UserGroupIcon } from "@heroicons/react/24/outline";

import AttentionBox from "@/components/AttentionBox";
import { SelectInput } from "@/components/inputs";
import { ETHNICITY_OPTIONS } from "@/components/inputs/EthnicityInput";
import { Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import { __fetch } from "@/services/functions";

const PATH = "/api/ethnic_group_report";

const NOT_RECORDED = "none";
const OTHERS = 0;
const GENDERS = { 1: "Male", 2: "Female", 3: "Others" };

/**
 * A student's group as a column key. `null` is a student nobody has recorded a
 * group for; `0` is the form's own "Others", which is a recorded answer.
 */
const groupKeyOf = (ethnicity) =>
    (ethnicity === null || ethnicity === undefined || ethnicity === "" ? NOT_RECORDED : `g${ethnicity}`);

// Every group the form offers, in the form's order, with "Others" moved to the
// end where a reader expects it, and the students without a group last of all.
const GROUPS = [
    ...ETHNICITY_OPTIONS.filter((option) => option.value !== OTHERS),
    ...ETHNICITY_OPTIONS.filter((option) => option.value === OTHERS),
].map((option) => ({ key: `g${option.value}`, name: option.name }))
    .concat([{ key: NOT_RECORDED, name: "Not recorded" }]);
const GROUP_ORDER = GROUPS.reduce((acc, group, i) => ({ ...acc, [group.key]: i }), {});
const GROUP_NAMES = GROUPS.reduce((acc, group) => ({ ...acc, [group.key]: group.name }), {});
// a number the form does not know (a group added on the server first)
const groupNameOf = (key) => GROUP_NAMES[key] || `Group ${`${key}`.slice(1)}`;

// Roll numbers are text ("2", "10", "A-3"): compared so 2 comes before 10, and
// a student with none goes after the ones who have.
function byRoll(a, b) {
    if (!a.roll_no && !b.roll_no) return 0;
    if (!a.roll_no) return 1;
    if (!b.roll_no) return -1;
    return `${a.roll_no}`.localeCompare(`${b.roll_no}`, undefined, { numeric: true });
}

// What a number in the first table does when it is pressed.
const PickContext = createContext(() => null);

/**
 * One count. It is a button: the number IS the way to the students it counts,
 * and they open in the list below. A zero has nobody to show.
 *
 * On a phone the table keeps the class and its total, and a row's other counts
 * are read in the row's view. That view is a dialog over the page, where a
 * button that changes the list underneath would do so out of sight: there the
 * count is plain (`[[role=dialog]_&]`).
 */
function CountCell({ data, item, col, highLighted }) {
    const pick = useContext(PickContext);
    const count = Number(data) || 0;
    const weight = highLighted ? "!font-bold" : "font-semibold";
    if (!count) {
        return <span className="app-cell-text block px-2 leading-relaxed tabular-nums !text-[var(--ink-400)]">0</span>;
    }
    return (
        <button type="button" onClick={() => pick(item?.id, col)}
            title="Show these students" aria-label={`${count}, show these students`}
            className={`app-cell-text block px-2 leading-relaxed tabular-nums text-left text-blue-gray-900 ${weight}
                underline decoration-dotted underline-offset-4 hover:decoration-solid print:no-underline
                [[role=dialog]_&]:pointer-events-none [[role=dialog]_&]:no-underline
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded`}>
            {count}
        </button>
    );
}

// The class a row is about, on one line. With a dozen groups beside it the
// browser would otherwise take the room out of this column first, and a class
// name folded onto three lines is the one thing in the row that has to be read.
function ClassCell({ data, highLighted }) {
    return (
        <span className={`app-cell-text block px-2 leading-relaxed whitespace-nowrap text-blue-gray-900 ${highLighted ? "!font-bold" : "font-normal"}`}>
            {data}
        </span>
    );
}

// A figure tile, drawn as the dashboard draws its own (`.app-kpi`).
function Kpi({ label, value, sub, Icon }) {
    return (
        <div className="app-kpi relative overflow-hidden rounded-xl border bg-white p-3.5 sm:p-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="app-kpi-icon shrink-0 rounded-lg bg-white/80 p-1.5 sm:p-2.5">
                <Icon className="h-5 w-5 sm:h-7 sm:w-7 text-gray-800" />
            </div>
            <div className="flex flex-col min-w-0 w-full sm:w-auto">
                <span className="app-kpi-label text-[11px] font-semibold uppercase tracking-wider text-gray-700 leading-snug">{label}</span>
                <span className="app-kpi-value text-xl xl:text-2xl font-bold text-gray-900 leading-tight truncate tabular-nums">{value}</span>
                {sub && <span className="app-kpi-sub text-[11px] text-gray-700/80 truncate" title={sub}>{sub}</span>}
            </div>
        </div>
    );
}

/**
 * ETHNIC GROUPS, CLASS BY CLASS.
 *
 * Two things a school is asked for: how many students of each group a class
 * has, and who they are. The first table counts, the second lists, and both
 * are read from the same rows, so a number and the list it opens cannot
 * disagree. A number in the first table sets the list to its class and group.
 *
 * Who is counted: the students who are running now, the same students as the
 * classwise count, so the two reports give the same totals. A student with no
 * group on record is counted under "Not recorded" rather than left out; in
 * most schools that is most students, and a report without them would read as
 * a far smaller school.
 */
function EthnicGroupReport() {
    const { user: { user }, class: { classesBackup } } = useAppContext();
    const school = user?.profile?.school || user?.profile?.id;

    const [students, setStudents] = useState(null);
    const [fetching, setFetching] = useState(true);
    const [failed, setFailed] = useState(false);
    // "" is every class / every group
    const [filter, setFilter] = useState({ klass: "", group: "" });
    const listRef = useRef(null);

    async function load() {
        if (!school) return;
        setFetching(true);
        setFailed(false);
        const data = await __fetch(PATH, { school });
        // a refused or failed request answers with something that is not this
        if (Array.isArray(data?.students)) setStudents(data.students);
        else setFailed(true);
        setFetching(false);
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [school]);

    // The school's classes in the order every other page lists them. A class a
    // student is in but this list does not carry still gets its row, at the end.
    const classes = useMemo(() => {
        const known = (classesBackup || []).map(([classname, info]) => ({ id: info?.id, classname }));
        const ids = new Set(known.map((klass) => klass.id));
        const unlisted = [...new Set((students || []).map((s) => s.class_info))]
            .filter((id) => !ids.has(id))
            .map((id) => ({ id, classname: `Class #${id}` }));
        return [...known, ...unlisted];
    }, [classesBackup, students]);

    const { rows, groups, classOptions, totals } = useMemo(() => {
        const perClass = {};
        const sum = { total: 0 };
        (students || []).forEach((s) => {
            const key = groupKeyOf(s.ethnicity);
            const mine = (perClass[s.class_info] = perClass[s.class_info] || { total: 0 });
            mine[key] = (mine[key] || 0) + 1;
            mine.total += 1;
            sum[key] = (sum[key] || 0) + 1;
            sum.total += 1;
        });
        // only the groups this school has: fifteen columns of zeros hide the three that matter
        const present = Object.keys(sum).filter((key) => key !== "total")
            .sort((a, b) => (GROUP_ORDER[a] ?? 99) - (GROUP_ORDER[b] ?? 99))
            .map((key) => ({ key, name: groupNameOf(key) }));
        const withStudents = classes.filter((klass) => perClass[klass.id]);
        const line = (id, classname, counts) => ({
            id, classname, total: counts.total || 0,
            ...present.reduce((acc, group) => ({ ...acc, [group.key]: counts[group.key] || 0 }), {}),
        });
        return {
            groups: present,
            totals: sum,
            classOptions: withStudents.map((klass) => ({
                value: `${klass.id}`, name: `${klass.classname} (${perClass[klass.id].total})`,
            })),
            rows: withStudents.length < 1 ? []
                : [...withStudents.map((klass) => line(klass.id, klass.classname, perClass[klass.id])),
                    line("", "Total", sum)],
        };
    }, [students, classes]);

    const listed = useMemo(() => {
        const names = classes.reduce((acc, klass, i) => ({ ...acc, [klass.id]: [klass.classname, i] }), {});
        return (students || [])
            .filter((s) => (!filter.klass || `${s.class_info}` === filter.klass)
                && (!filter.group || groupKeyOf(s.ethnicity) === filter.group))
            .map((s) => {
                const key = groupKeyOf(s.ethnicity);
                return {
                    ...s, key, order: names[s.class_info]?.[1] ?? 9999,
                    classname: names[s.class_info]?.[0] || `Class #${s.class_info}`,
                    gender: GENDERS[s.gender] || "",
                    ethnic_group: groupNameOf(key),
                };
            })
            // class by class, group by group inside a class, then by roll number
            .sort((a, b) => (a.order - b.order)
                || ((GROUP_ORDER[a.key] ?? 99) - (GROUP_ORDER[b.key] ?? 99))
                || byRoll(a, b)
                || `${a.name}`.localeCompare(`${b.name}`));
    }, [students, classes, filter]);

    function pick(classId, column) {
        setFilter({ klass: classId ? `${classId}` : "", group: column === "total" ? "" : column });
        // after the list has taken the new rows
        setTimeout(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }

    const total = totals.total || 0;
    const missing = totals[NOT_RECORDED] || 0;
    const recorded = total - missing;
    const share = (n) => (total ? `${Math.round((n / total) * 100)}% of the students` : "");

    const className = classes.find((klass) => `${klass.id}` === filter.klass)?.classname;
    // also the name of the exported file, so no character a file name cannot carry
    const showing = [className || "All classes", filter.group ? groupNameOf(filter.group) : "All groups"].join(" - ");

    if (failed) {
        return (
            <div className="app-table-card rounded-xl border bg-white px-4 py-10 text-center">
                <p className="text-[0.95rem] font-semibold text-blue-gray-800">The report could not be loaded</p>
                <p className="mt-1 text-[0.85rem] text-blue-gray-500">Nothing was changed. Check the connection and try again.</p>
                <button type="button" onClick={load}
                    className="app-retry-btn mt-3 inline-flex items-center rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold transition">
                    Try again
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-y-4">
            {/* on a phone the total heads its two parts, which sit side by side */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="col-span-2 sm:col-span-1">
                    <Kpi label="Students" value={fetching ? "…" : total} sub="running now, in every class" Icon={UserGroupIcon} />
                </div>
                <Kpi label="Group recorded" value={fetching ? "…" : recorded} sub={share(recorded)} Icon={IdentificationIcon} />
                <Kpi label="Not recorded" value={fetching ? "…" : missing} sub={share(missing)} Icon={ExclamationCircleIcon} />
            </div>

            {!fetching && total > 0 && recorded === 0 && (
                <AttentionBox dismissable={false} title="No ethnic group has been recorded yet"
                    description={"It is entered on a student's profile, under Other Info, or while enrolling. "
                        + "Until then every student is counted under Not recorded."} />
            )}

            <PickContext.Provider value={pick}>
                <BasicTable name="Ethnic groups by class" loading={fetching} data={rows}
                    columns={[
                        ["classname", "class", null, false, null, ClassCell],
                        ...groups.map((group) => [group.key, group.name, null, false, null, CountCell]),
                        ["total", "total", null, false, null, CountCell],
                    ]}
                    // the last row is the total: it stays last, so no sorting or searching here
                    dataTable={false} highLightLast={rows.length > 0} dense mobileColumns={["classname", "total"]}
                    print allowExport showSelected={false} onSelect={() => null} />
            </PickContext.Provider>

            <div ref={listRef} className="scroll-mt-3 flex flex-col gap-y-4">
                <Section title="Students"
                    description={"Who they are. Choose a class and a group here, or press a number in the table above."}>
                    <SelectInput value={filter.klass}
                        input={{ name: "klass", label: "Class", options: [{ value: "", name: "All classes" }, ...classOptions] }}
                        onChange={({ value }) => setFilter((state) => ({ ...state, klass: value }))} />
                    <SelectInput value={filter.group}
                        input={{
                            name: "group", label: "Ethnic group",
                            options: [{ value: "", name: "All groups" },
                                ...groups.map((group) => ({ value: group.key, name: `${group.name} (${totals[group.key]})` }))],
                        }}
                        onChange={({ value }) => setFilter((state) => ({ ...state, group: value }))} />
                </Section>

                <BasicTable name={`Students - ${showing}`} loading={fetching} data={listed}
                    columns={[
                        ["name", "name"], ["classname", "class"], ["roll_no", "roll no."], ["gender", "gender"],
                        ["ethnic_group", "ethnic group"], ["father_name", "father's name"],
                        ["guardian_contact", "contact"], ["location", "address"],
                    ]}
                    mobileColumns={["name", "classname"]} wideColumns={["father_name", "location"]} dense
                    print allowExport showSelected={false} onSelect={() => null} />
            </div>
        </div>
    );
}

export default EthnicGroupReport;
