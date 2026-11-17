import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { ChevronLeftIcon, MagnifyingGlassIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useAppContext } from "@/contexts/AppContext";
import { fetchStudentList } from "@/services/functions/students";
import { navigatePortal } from "@/methods/portalRoutes";
import { formatImagePath } from "@/methods/formatMediaPath";
import StudentProfileProvider from "@/contexts/StudentProfile";
import StudentPaymentProvider from "@/contexts/StudentPayment";
import StudentProfile from "@/components/views/profiles/student";
import TitleSelectionSection from "@/components/views/payments/student/TitleSelectionSection";
import BillEntrySection from "@/components/views/payments/student/BillEntrySection";
import StudentPaymentHistory from "@/components/views/payments/student/StudentPaymentHistory";

/**
 * People > Students & staff > Students: the school's students as a list.
 *
 * Drawn from the design-system canvas (Students): status tabs with their
 * counts, one search box (a name, a student id, or part of a phone number), a
 * class filter, then the students in class order and by roll. A name opens the
 * student's profile in place; "Collect fee" opens the same payment form as
 * Fees & payments > Collect fees, after switching to the student's class year
 * exactly as that page does. GET /api/students/list (StudentListView).
 */

const STATUS_TABS = [
    { key: "1", label: "Running" },
    { key: "2", label: "Passed out" },
    { key: "3", label: "Dropped out" },
    { key: "all", label: "All" },
];
const STATUS_NAMES = { 1: "Running", 2: "Passed out", 3: "Dropped out" };
const PAGE_SIZE = 25;
// What an empty list says depends on what was asked for.
const EMPTY = {
    "2": ["No student has passed out yet", "Students appear here once they finish their last class."],
    "3": ["No student has dropped out", "Students who leave before they finish appear here."],
};
const EMPTY_SCHOOL = ["No students here yet", "Students you admit appear in this list."];
const EMPTY_SEARCH = ["No students match", "Check the spelling, or clear the filters."];

function initialsOf(name) {
    const words = `${name || ""}`.trim().split(/\s+/).filter(Boolean);
    if (words.length < 1) return "?";
    return `${words[0][0] || ""}${words.length > 1 ? words[words.length - 1][0] || "" : ""}`.toUpperCase();
}

function formatPhone(phone) {
    const digits = `${phone || ""}`;
    return digits.length === 10 ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}` : digits;
}

function useDebounced(value, ms) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), ms);
        return () => clearTimeout(t);
    }, [value, ms]);
    return debounced;
}

function StudentList() {
    const router = useRouter();
    const {
        user: { user },
        class: { classesBackup },
        menu: { menus },
        fiscalYear: { updateAcademicYear },
    } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    const views = menus?.views || {};
    const canCollect = !!views["payment.student"];

    const [status, setStatus] = useState("1");
    const [text, setText] = useState("");
    const q = useDebounced(text.trim(), 300);
    const [classInfo, setClassInfo] = useState("");
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [open, setOpen] = useState(null); // { action: 'profile' | 'pay', student }
    const [reload, setReload] = useState(0);
    const latest = useRef(0);

    // a new filter starts again from the first page
    useEffect(() => { setPage(1); }, [status, q, classInfo]);

    useEffect(() => {
        if (!schoolId) return;
        const ticket = ++latest.current;
        setLoading(true);
        setFailed(false);
        fetchStudentList({ school: schoolId, status, q, class_info: classInfo, page, page_size: PAGE_SIZE })
            .then((res) => {
                if (ticket !== latest.current) return; // an older request answered late
                if (res && Array.isArray(res.results)) setData(res);
                else setFailed(true);
            })
            .finally(() => { if (ticket === latest.current) setLoading(false); });
    }, [schoolId, status, q, classInfo, page, reload]);

    const classOptions = useMemo(() => (classesBackup || [])
        .map((cls) => ({ value: cls?.[1]?.id, name: cls?.[0] }))
        .filter((option) => option.value), [classesBackup]);

    const counts = data?.counts || {};
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const rows = data?.results || [];
    const count = data?.count || 0;
    const first = count ? (page - 1) * PAGE_SIZE + 1 : 0;
    const last = Math.min(page * PAGE_SIZE, count);
    const filtered = !!(q || classInfo);

    function clearFilters() {
        setText("");
        setClassInfo("");
    }

    function openStudent(action, student) {
        if (student?.class_academic_year) updateAcademicYear(student.class_academic_year);
        setOpen({ action, student });
    }

    if (open) {
        const { action, student } = open;
        return (
            <div className="app-slist-detail">
                <button type="button" className="app-slist-back" onClick={() => setOpen(null)}>
                    <ChevronLeftIcon aria-hidden="true" />
                    Back to students
                </button>
                {action === "pay" ? (
                    <>
                        <div className="app-idpin bg-main">
                            <div className="app-idstrip flex items-center gap-3 px-4 py-3">
                                <span className="app-avatar" aria-hidden="true">{initialsOf(student.name)}</span>
                                <div className="min-w-0">
                                    <p className="app-idstrip-name truncate">{student.name}</p>
                                    {student.classname && <p className="app-idstrip-sub">Class {student.classname}</p>}
                                </div>
                            </div>
                        </div>
                        <StudentPaymentProvider studentId={student.id} studentClassId={student.class_info}>
                            <div className="px-3">
                                <TitleSelectionSection />
                                <BillEntrySection />
                            </div>
                            <StudentPaymentHistory selectedStudent={student} />
                        </StudentPaymentProvider>
                    </>
                ) : (
                    <StudentProfileProvider studentId={student.id}>
                        <StudentProfile />
                    </StudentProfileProvider>
                )}
            </div>
        );
    }

    return (
        <div className="app-slist">
            <div className="app-slist-actions">
                <p className="app-slist-summary">
                    {data ? `${total} ${total === 1 ? "student" : "students"}${filtered ? " match" : ""}` : " "}
                </p>
                <div className="app-slist-buttons">
                    {views["enrollment.bulk.student-enrollments"] &&
                        <button type="button" className="app-btn-secondary app-slist-btn"
                            onClick={() => navigatePortal(router, "#enrollment.bulk.student-enrollments")}>
                            Bulk import
                        </button>}
                    {views["enrollment.student"] &&
                        <button type="button" className="app-slist-btn app-slist-primary"
                            onClick={() => navigatePortal(router, "#enrollment.student")}>
                            <PlusIcon aria-hidden="true" />
                            Admit student
                        </button>}
                </div>
            </div>

            <section className="app-slist-card" aria-label="Students">
                <div className="app-slist-toolbar">
                    <div className="app-slist-tabs" role="group" aria-label="Status">
                        {STATUS_TABS.map((tab) => {
                            const n = tab.key === "all" ? total : (counts[tab.key] || 0);
                            const on = status === tab.key;
                            return (
                                <button key={tab.key} type="button" aria-pressed={on}
                                    className={on ? "is-on" : ""} onClick={() => setStatus(tab.key)}>
                                    {tab.label}
                                    {data && <span className="app-slist-count">{n}</span>}
                                </button>
                            );
                        })}
                    </div>
                    <label className="app-slist-search">
                        <MagnifyingGlassIcon aria-hidden="true" />
                        <span className="sr-only">Search students</span>
                        <input type="search" value={text} onChange={(e) => setText(e.target.value)}
                            placeholder="Name, student ID or guardian phone" autoComplete="off" />
                    </label>
                    <label className="app-slist-select">
                        <span className="sr-only">Class</span>
                        <select value={classInfo} onChange={(e) => setClassInfo(e.target.value)}>
                            <option value="">All classes</option>
                            {classOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.name}</option>
                            ))}
                        </select>
                    </label>
                    {filtered &&
                        <button type="button" className="app-slist-clear" onClick={clearFilters}>
                            <XMarkIcon aria-hidden="true" />
                            Clear filters
                        </button>}
                </div>

                <div className="app-slist-scroll" aria-busy={loading}>
                    <table className="app-slist-table">
                        <thead>
                            <tr>
                                <th scope="col">Student</th>
                                <th scope="col">Class</th>
                                <th scope="col">Roll</th>
                                <th scope="col">Guardian</th>
                                <th scope="col">Status</th>
                                <th scope="col"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && !data && Array.from({ length: 6 }).map((_, i) => (
                                <tr key={`s${i}`} className="is-skeleton" aria-hidden="true">
                                    <td><span className="app-slist-bone is-wide" /></td>
                                    <td><span className="app-slist-bone" /></td>
                                    <td><span className="app-slist-bone is-short" /></td>
                                    <td><span className="app-slist-bone" /></td>
                                    <td><span className="app-slist-bone is-short" /></td>
                                    <td />
                                </tr>
                            ))}
                            {rows.map((s) => (
                                <tr key={s.id}>
                                    <td>
                                        <span className="app-slist-who">
                                            {s.image
                                                ? <img className="app-slist-photo" src={formatImagePath(s.image)} alt="" loading="lazy" />
                                                : <span className="app-slist-photo is-initials" aria-hidden="true">{initialsOf(s.name)}</span>}
                                            <span className="app-slist-name">
                                                <button type="button" onClick={() => openStudent("profile", s)}>{s.name}</button>
                                                <code>ID {s.id}</code>
                                            </span>
                                        </span>
                                    </td>
                                    <td className="app-slist-nowrap">{s.classname}</td>
                                    <td className="app-slist-num">{s.roll_no || "–"}</td>
                                    <td>
                                        <span className="app-slist-guardian">
                                            <span>{s.guardian || "–"}</span>
                                            {s.guardian_contact && <a href={`tel:${s.guardian_contact}`}>{formatPhone(s.guardian_contact)}</a>}
                                        </span>
                                    </td>
                                    <td><span className={`app-slist-badge is-${s.status}`}>{STATUS_NAMES[s.status] || "Unknown"}</span></td>
                                    <td className="app-slist-rowactions">
                                        {canCollect && s.class_academic_year &&
                                            <button type="button" onClick={() => openStudent("pay", s)}
                                                aria-label={`Collect fee from ${s.name}`}>Collect fee</button>}
                                        <button type="button" onClick={() => openStudent("profile", s)}
                                            aria-label={`Open the profile of ${s.name}`}>Profile</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {!loading && !failed && rows.length === 0 && (() => {
                        const [title, hint] = filtered ? EMPTY_SEARCH : (EMPTY[status] || EMPTY_SCHOOL);
                        return (
                            <div className="app-slist-empty">
                                <strong>{title}</strong>
                                <span>{hint}</span>
                                {filtered && <button type="button" onClick={clearFilters}>Clear filters</button>}
                            </div>
                        );
                    })()}
                    {failed &&
                        <div className="app-slist-empty" role="alert">
                            <strong>The list could not be loaded</strong>
                            <span>Check the connection, then try again.</span>
                            <button type="button" onClick={() => setReload((n) => n + 1)}>Try again</button>
                        </div>}
                </div>

                {count > 0 &&
                    <nav className="app-slist-pager" aria-label="Pages">
                        <span>Showing {first}–{last} of {count}</span>
                        <span className="app-slist-pager-buttons">
                            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</button>
                            <button type="button" disabled={last >= count || loading} onClick={() => setPage((p) => p + 1)}>Next</button>
                        </span>
                    </nav>}
            </section>
        </div>
    );
}

export default StudentList;
