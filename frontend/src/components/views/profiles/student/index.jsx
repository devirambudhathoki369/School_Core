import { useEffect, useState } from "react";
import PersonalInfoTab from "./tabs/PersonalInfo";
import { useStudentProfile, ALL_SECTIONS } from "@/contexts/StudentProfile";
import GuardianInfoTab from "./tabs/GuardianInfo";
import Loader from "@/components/Loader";
import GradeInfoTab from "./tabs/GradeInfo";
import DiscountInfoTab from "./tabs/DiscountInfo";
import TransportationInfoTab from "./tabs/TransportationInfo";
import LedgerInfoTab from "./tabs/LedgerInfo";
import OtherInfoTab from "./tabs/OtherInfo";
import DocumentsInfoTab from "./tabs/DocumentsInfo";
import MedicalInfoTab from "./tabs/MedicalInfo";
import StudentHeader from "./StudentHeader";
import ProfileAttendance from "../attendance";
import {
    UserCircleIcon, UsersIcon, TruckIcon, ReceiptPercentIcon,
    BanknotesIcon, DocumentTextIcon, HeartIcon, CalendarDaysIcon,
} from "@heroicons/react/24/outline";

const tabs = {
    personal: { label: 'Personal Info', key: 'student-personal-info', db_key: null },
    guardian: { label: 'Guardian Info', key: 'student-guarian-info', db_key: 'guardian_info' },
    class: { label: 'Class Info', key: 'student-class-info', db_key: 'class_info' },
    other_info: { label: 'Other Info', key: 'student-other-info', db_key: 'other_info' },
    transportation: { label: 'Transportation Info', key: 'student-transportation-info', db_key: 'transportation_info' },
    discount: { label: 'Discount', key: 'student-discount-info', db_key: null },
    ledger: { label: 'Student Ledger', key: 'student-ledger-tab', db_key: null },
    documents: { label: 'Documents', key: 'student-documents-info', db_key: null },
    medical: { label: 'Medical', key: 'student-medical-info', db_key: null }
}

// The year's attendance of the student whose profile this is. It loads its own
// record when the tab is opened; nothing about it is edited here.
function AttendanceInfoTab() {
    const { data: { studentId, studentBackup } } = useStudentProfile();
    return <ProfileAttendance kind="student" personId={studentBackup?.ids?.sid || studentId} />;
}

// Only the clicked section is on the page at a time. It still carries the
// ALL_SECTIONS is defined alongside the loaders that read it, in
// contexts/StudentProfile, and re-exported below for the section components.

// The order the record reads in: who the student is, then who is responsible for
// them, then the arrangements, then the money, then the paperwork.
// Each tab carries its own glyph. Seven same-shaped words in a row is a list
// you have to READ every time; a shape is something you learn the position of
// once, and on a phone — where the strip scrolls sideways — it is the only part
// of a half-visible tab that still tells you what it is.
const SECTIONS = [
    { id: 'personal', label: 'Personal', icon: UserCircleIcon, render: () => (<><PersonalInfoTab tab={tabs.personal} /><GradeInfoTab tab={tabs.class} /><OtherInfoTab tab={tabs.other_info} /></>) },
    { id: 'guardian', label: 'Guardian', icon: UsersIcon, render: () => <GuardianInfoTab tab={tabs.guardian} /> },
    { id: 'transportation', label: 'Transportation', icon: TruckIcon, render: () => <TransportationInfoTab tab={tabs.transportation} /> },
    { id: 'discount', label: 'Discount', icon: ReceiptPercentIcon, render: () => <DiscountInfoTab tab={tabs.discount} /> },
    { id: 'ledger', label: 'Ledger', icon: BanknotesIcon, render: () => <LedgerInfoTab tab={tabs.ledger} /> },
    { id: 'attendance', label: 'Attendance', icon: CalendarDaysIcon, render: () => <AttendanceInfoTab /> },
    { id: 'documents', label: 'Documents', icon: DocumentTextIcon, render: () => <DocumentsInfoTab tab={tabs.documents} /> },
    { id: 'medical', label: 'Medical', icon: HeartIcon, render: () => <MedicalInfoTab tab={tabs.medical} /> },
];

function StudentProfile() {
    const { data: { student }, view: { setCurrentTab } } = useStudentProfile();
    const [active, setActive] = useState(SECTIONS[0].id);

    // The section still reports itself as ALL_SECTIONS so its data loads on mount.
    useEffect(() => { setCurrentTab(ALL_SECTIONS); }, []);

    if (!student) return <Loader />;

    const activeSection = SECTIONS.find(s => s.id === active) || SECTIONS[0];

    // Left/Right move between tabs, Home/End jump to the ends, and the newly
    // selected tab takes focus so the keyboard user is where they just moved to.
    function onTabKeyDown(e) {
        const keys = { ArrowRight: 1, ArrowLeft: -1 };
        let next = null;
        const i = SECTIONS.findIndex(s => s.id === active);
        if (e.key in keys) next = (i + keys[e.key] + SECTIONS.length) % SECTIONS.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = SECTIONS.length - 1;
        if (next === null) return;
        e.preventDefault();
        const id = SECTIONS[next].id;
        setActive(id);
        requestAnimationFrame(() => document.getElementById(`tab-${id}`)?.focus());
    }

    return (
        <div className="w-full">
            <StudentHeader />
            {/* Tabs: clicking one shows only that section's data below. Sticks
                under the header and scrolls sideways on a phone. */}
            {/* These are TABS, not navigation: they swap a panel in place and
                never change the URL. Rendered as a real tablist so a screen
                reader announces "tab 3 of 9, selected" instead of nine generic
                buttons, and so the arrow keys move between them — the expected
                keyboard behaviour, and the only usable one on a phone-width
                strip that scrolls sideways.

                `aria-current="page"` was wrong here for the same reason: it
                claims this is the current PAGE. `aria-selected` is the property
                that describes a chosen tab. Appearance is unchanged. */}
            {/* PINNED inside a band of the page's own ground (`app-idpin`). The
                strip used to be `sticky top-0` on its own: the scroll area has
                padding above its first row, so the strip stopped a gap short of
                the header and the page slid past in the slit above it, and its
                see-through white let the rest show from behind. The band covers
                that gap edge to edge, and the strip is solid. */}
            <div className="app-idpin app-profile-tabs bg-main">
            <nav className="rounded-xl bg-white shadow-sm border border-blue-gray-100">
                {/* `scrollbar-none`-ish: the strip scrolls on a phone but the
                    bar itself was drawn across the tabs on desktop. */}
                <div role="tablist" aria-label="Student profile sections"
                    onKeyDown={onTabKeyDown}
                    className="flex gap-1 overflow-x-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {SECTIONS.map(s => (
                        <button key={s.id} type="button" onClick={() => setActive(s.id)}
                            role="tab"
                            id={`tab-${s.id}`}
                            aria-controls={`panel-${s.id}`}
                            aria-selected={active === s.id}
                            // Roving tabindex: one Tab press enters the strip,
                            // then the arrows move within it. Without this, Tab
                            // has to be pressed nine times to get past the bar.
                            tabIndex={active === s.id ? 0 : -1}
                            className={`app-profile-tab flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2
                                text-sm font-semibold transition-all duration-150 sm:px-3.5 ${active === s.id
                                ? "app-profile-tab-active bg-teal-600 text-white shadow-sm ring-1 ring-teal-700/20"
                                : "text-blue-gray-600 hover:bg-teal-50 hover:text-teal-800"}`}>
                            <s.icon aria-hidden="true"
                                className={`h-[1.05rem] w-[1.05rem] shrink-0 stroke-[1.7] ${active === s.id ? '' : 'opacity-70'}`} />
                            {s.label}
                        </button>
                    ))}
                </div>
            </nav>
            </div>

            {/* Only the active section is rendered, so each tab shows its own
                data and nothing else. `key` remounts it on switch, which reloads
                that section's data. */}
            <div className="flex flex-col gap-3">
                <section key={activeSection.id}
                    role="tabpanel"
                    id={`panel-${activeSection.id}`}
                    aria-labelledby={`tab-${activeSection.id}`}
                    tabIndex={0}
                    className="rounded-xl border border-blue-gray-100 bg-white p-3 shadow-sm sm:p-4">
                    {activeSection.render()}
                </section>
            </div>
        </div>
    );
}

export default StudentProfile;
export { tabs, ALL_SECTIONS };
