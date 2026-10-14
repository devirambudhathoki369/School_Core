// LOCAL-ONLY design harness (excluded via .git/info/exclude — never committed).
// Renders the real primitives inside a static replica of the portal shell so a
// theme can be judged without signing in. /design-preview?theme=vivid&open=staff
import { useEffect, useState } from "react";
import { Card, List, ListItem, ListItemPrefix, Typography, Button, IconButton, Accordion, AccordionHeader, AccordionBody } from "@material-tailwind/react";
import {
    HomeIcon, Squares2X2Icon, CalendarIcon, Bars3Icon, MagnifyingGlassIcon, BanknotesIcon, UserGroupIcon,
    AcademicCapIcon, ClipboardDocumentListIcon, ChartBarIcon, Cog6ToothIcon, ChevronDownIcon, CalendarDaysIcon,
    DevicePhoneMobileIcon, BookOpenIcon, ArrowRightStartOnRectangleIcon, DocumentTextIcon, TruckIcon,
} from "@heroicons/react/24/outline";
import { MapPinIcon, PhoneIcon } from "@heroicons/react/24/solid";
import { Section, ButtonsSecion, FilterSection } from "@/components/sections";
import SearchPanel from "@/components/searchbars/SearchPanel";
import { TextInput, SelectInput, SearchInput } from "@/components/inputs";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import BasicTable from "@/components/tables/BasicTable";
import StatusCell from "@/components/tables/StatusCell";
import { editAction, deleteAction, payAction } from "@/components/tables/actions";
import EmptyState from "@/components/EmptyState";
import OurLogo from "@/components/OurLogo";
import Badge from "@/components/Badge";
import PageHeader from "@/components/PageHeader";
import TitleBill from "@/components/views/payments/student/TitleBill";
import HeaderCard from "@/components/tables/HeaderCard";
import RowCard from "@/components/tables/RowCard";
import AmountInput from "@/components/tables/AmountInput";

const STAFF = [
    ["Abisha Khanal", "Teacher", 0, "Tulsipur-5"], ["Amita Acharya", "Teacher", 12500, "Ghorahi"],
    ["Arati Giri", "Accountant", -2300.5, "Tulsipur-2"], ["Bandana Bista Bhandari", "Teacher", 48000, "Lamahi"],
    ["Bhima Budhathoki", "Teacher", 0, "Tulsipur-6"], ["Bindu Khanal Neupane", "Discipline Incharge", 7850, "Ghorahi-11"],
    ["Chandra Bahadur Oli", "Driver", 15000, "Tulsipur-1"], ["Deepa Sharma", "Librarian", 0, "Dang"],
    ["Ganesh Prasad Adhikari", "Principal", 125000, "Tulsipur-4"], ["Hari Maya Thapa", "Helper", 3200, "Tulsipur"],
].map(([name, designation, balance, address], i) => ({ id: i + 1, value: i + 1, name, designation, balance, address }));

const STUDENTS = [
    ["Aarav Sharma", "ONE", "A", 1, "present", 4500], ["Anisha Thapa Magar", "ONE", "A", 2, "absent (sick)", 0],
    ["Bibek KC", "TWO", "B", 3, "present", 12500.75], ["Dikshya Pokharel", "THREE", "A", 4, "present", 800],
    ["Kritika Oli", "FOUR", "C", 5, "absent", 22150], ["Prabin Chaudhary", "FIVE", "A", 6, "present", 0],
].map(([name, cls, section, roll, status_str, balance], i) => ({ id: i + 1, name, class: cls, section, roll, status_str, balance }));


const CALM_CSS = `
:root { --k1: #0d9488; --k2: #0284c7; --k3: #059669; --k4: #d97706; }
[data-ui-theme] { --k1: var(--t-k1); --k2: var(--t-k2); --k3: var(--t-k3); --k4: var(--t-k4); }
.grid > *:nth-child(1) > .app-kpi, .grid > .app-kpi:nth-child(1) { --k: var(--k1); }
.grid > *:nth-child(2) > .app-kpi, .grid > .app-kpi:nth-child(2) { --k: var(--k2); }
.grid > *:nth-child(3) > .app-kpi, .grid > .app-kpi:nth-child(3) { --k: var(--k3); }
.grid > *:nth-child(4) > .app-kpi, .grid > .app-kpi:nth-child(4) { --k: var(--k4); }
.app-kpi.app-kpi.app-kpi.app-kpi.app-kpi { background: #fff !important; border: 1px solid var(--line) !important; box-shadow: var(--shadow-card) !important; }
.app-kpi.app-kpi.app-kpi.app-kpi.app-kpi .app-kpi-label { color: var(--ink-500) !important; }
.app-kpi.app-kpi.app-kpi.app-kpi.app-kpi .app-kpi-sub { color: var(--ink-500) !important; }
.app-kpi.app-kpi.app-kpi.app-kpi.app-kpi .app-kpi-value { color: var(--ink-900) !important; }
.app-kpi.app-kpi.app-kpi.app-kpi.app-kpi .app-kpi-icon { background: color-mix(in srgb, var(--k) 12%, #fff) !important; }
.app-kpi.app-kpi.app-kpi.app-kpi.app-kpi .app-kpi-icon svg { color: var(--k) !important; }
.app-pagehead.app-pagehead.app-pagehead { background: #fff !important; border: 1px solid var(--line) !important; }
.app-pagehead.app-pagehead.app-pagehead .app-pagehead-title { color: var(--ink-900) !important; }
.app-pagehead.app-pagehead.app-pagehead .app-pagehead-sub { color: var(--ink-500) !important; }
.app-pagehead.app-pagehead.app-pagehead .app-pagehead-icon { background: var(--t-brand-tint) !important; color: var(--t-brand-ink) !important; }
.app-pagehead.app-pagehead.app-pagehead .app-pagehead-meta { background: var(--surface-soft) !important; border: 1px solid var(--line) !important; }
.app-pagehead.app-pagehead.app-pagehead .app-pagehead-meta b { color: var(--ink-900) !important; }
.app-pagehead.app-pagehead.app-pagehead .app-pagehead-meta span { color: var(--ink-500) !important; }
`;

const THEMES = ["classic", "vivid", "daylight", "evergreen", "console"];

function MenuLeaf({ icon: Icon, name, active }) {
    return (
        <a href="#" onClick={e => e.preventDefault()}>
            <ListItem className={`app-menu-item py-2 ${active ? 'app-menu-item-active !bg-[#b2dfdb] font-semibold py-2.5' : 'bg-transparent font-normal'}`}>
                <ListItemPrefix><Icon className="icon" /></ListItemPrefix>
                <span className="w-max">{name}</span>
            </ListItem>
        </a>
    );
}
function MenuGroup({ icon: Icon, name, open = false, children }) {
    return (
        <Accordion open={open} className="bg-transparent"
            icon={<ChevronDownIcon strokeWidth={2.5} aria-hidden="true"
                className={`mx-auto h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />}>
            <ListItem className={`app-menu-group p-0 ${open ? 'app-menu-group-open' : ''}`} selected={open}>
                <AccordionHeader className="border-b-0 p-1.5 m-0">
                    <ListItemPrefix><Icon className="icon" /></ListItemPrefix>
                    <Typography color="blue-gray" className="mr-auto font-normal">{name}</Typography>
                </AccordionHeader>
            </ListItem>
            <AccordionBody className="app-rail-submenu py-0 pl-5">
                <List className="p-0">{children}</List>
            </AccordionBody>
        </Accordion>
    );
}

function Rail() {
    return (
        <div className="app-rail-shell hidden md:flex items-stretch">
            <Card className="app-rail rounded-none h-screen px-2 bg-white overflow-y-auto overflow-x-hidden relative w-72 shadow-none">
                <div className="app-rail-head relative flex flex-col items-center gap-2.5 py-4 px-2 sticky top-0 z-10 bg-teal-100 border-b-2 border-white">
                    <div className="app-rail-brand flex items-center justify-center gap-2">
                        <OurLogo size={38} />
                        <Typography variant="h4" color="teal" className="app-rail-wordmark leading-none">CentIT</Typography>
                    </div>
                    <div className="app-rail-years">
                        <span className="app-year-chip"><span className="app-year-chip-key">EY</span><span className="app-year-chip-value">2083/084</span></span>
                        <span className="app-year-chip app-year-chip-accent"><span className="app-year-chip-key">AY</span><span className="app-year-chip-value">2083</span></span>
                    </div>
                    <div className="app-rail-search">
                        <MagnifyingGlassIcon className="app-rail-search-icon" />
                        <input className="app-rail-search-input" placeholder="Search menu…  (Ctrl+K)" />
                    </div>
                </div>
                <hr />
                <List>
                    <MenuLeaf icon={HomeIcon} name="Dashboard" />
                    <MenuGroup icon={AcademicCapIcon} name="Enrollment" />
                    <MenuGroup icon={UserGroupIcon} name="Manage" />
                    <MenuGroup icon={BanknotesIcon} name="Payroll" open>
                        <MenuLeaf icon={DocumentTextIcon} name="Salary posting" />
                        <MenuLeaf icon={BanknotesIcon} name="Staff payment" />
                        <MenuLeaf icon={ClipboardDocumentListIcon} name="Staff ledger" active />
                        <MenuLeaf icon={DocumentTextIcon} name="Pay slips" />
                    </MenuGroup>
                    <MenuGroup icon={ChartBarIcon} name="Reports" />
                    <MenuGroup icon={BookOpenIcon} name="Library" />
                    <MenuGroup icon={TruckIcon} name="Transportation" />
                    <MenuGroup icon={Cog6ToothIcon} name="Setup" />
                    <ListItem className="app-menu-item py-1.5">
                        <ListItemPrefix><ArrowRightStartOnRectangleIcon className="icon" /></ListItemPrefix>
                        Logout
                    </ListItem>
                </List>
            </Card>
        </div>
    );
}

function Header() {
    const crumbs = ['Payroll', 'Staff ledger'];
    const trail = (<>
        <HomeIcon aria-hidden="true" />
        {crumbs.map((m, i) => (<span key={i} className="contents">
            <span className="app-crumb-sep">/</span>
            <span className={i === crumbs.length - 1 ? 'app-crumb-current' : ''}>{m}</span>
        </span>))}
    </>);
    return (
        <div className="view-header">
            <div className="md:hidden flex items-center gap-x-2 p-2 w-full bg-white">
                <IconButton variant="text" className="shrink-0"><Bars3Icon className="h-6 w-6" /></IconButton>
                <OurLogo size={32} />
                <p className="app-school-name truncate flex-1 min-w-0">CentIT Academy</p>
                <Button className="app-tool-btn shrink-0" type="button" variant="text"><Squares2X2Icon className="icon" /></Button>
                <Button className="app-tool-btn shrink-0 is-ok" type="button" variant="text"><CalendarIcon className="icon" /></Button>
            </div>
            <nav className="app-crumbs xl:hidden flex items-center px-3 py-1.5 bg-white overflow-x-auto">
                <div className="app-crumb-trail">{trail}</div>
            </nav>
            <div className="hidden md:block">
                <div className="app-topbar w-full flex justify-between items-center gap-x-4">
                    <div className="flex items-center gap-x-2.5 min-w-0 flex-1">
                        <IconButton variant="text" className="app-rail-toggle shrink-0 rounded-lg"><Bars3Icon className="h-6 w-6" /></IconButton>
                        <OurLogo />
                        <div className="school_info flex flex-col min-w-0">
                            <p className="app-school-name truncate">CentIT Academy</p>
                            <div className="app-school-meta flex w-full gap-x-4 items-center min-w-0">
                                <span className="flex items-center gap-1 capitalize min-w-0"><MapPinIcon className="shrink-0" /><span className="truncate">Tulsipur-5, Dang</span></span>
                                <span className="flex items-center gap-1 shrink-0"><PhoneIcon className="shrink-0" /><span className="whitespace-nowrap">082-520000, 9857000000</span></span>
                            </div>
                        </div>
                    </div>
                    <div className="app-topbar-tools flex items-center justify-end gap-x-2 shrink-0">
                        <nav className="hidden xl:block"><div className="app-crumb-trail">{trail}</div></nav>
                        <div className="app-clock flex gap-x-2 items-center whitespace-nowrap shrink-0 p-2 sm:p-2.5 m-1 text-gray-800 bg-white/50 font-semibold rounded-md">
                            <span className="tabular-nums">2083-06-13</span>
                            <span className="app-clock-time tabular-nums">12:24:05 PM</span>
                        </div>
                        <div className="flex items-center gap-x-1.5">
                            <Button className="app-tool-btn" type="button" variant="text"><Squares2X2Icon className="icon" /></Button>
                            <Button className="app-tool-btn is-ok" type="button" variant="text"><CalendarIcon className="icon" /></Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Kpi({ label, count, sublabel, Icon, gradient }) {
    return (
        <div className={`app-kpi relative overflow-hidden rounded-xl border ${gradient} p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4`}>
            <div className="app-kpi-icon shrink-0 rounded-lg bg-white/80 p-2 sm:p-2.5">
                <Icon className="h-6 w-6 sm:h-7 sm:w-7 text-gray-800" />
            </div>
            <div className="flex flex-col min-w-0">
                <span className="app-kpi-label text-[11px] font-semibold uppercase tracking-wider text-gray-700 leading-snug">{label}</span>
                <span className="app-kpi-value text-xl xl:text-2xl font-bold text-gray-900 leading-tight truncate">{count}</span>
                <span className="app-kpi-sub text-[11px] text-gray-700/80 truncate">{sublabel}</span>
            </div>
        </div>
    );
}

export default function DesignPreview() {
    const [q, setQ] = useState(null);
    useEffect(() => { setQ(Object.fromEntries(new URLSearchParams(window.location.search))); }, []);
    const theme = (q?.theme || 'classic').toString();
    const open = q?.open;
    const scene = (q?.scene || 'ledger').toString();
    const [staff, setStaff] = useState('');
    const [form, setForm] = useState({ name: 'Bibek KC', status: '1', date: '2083-06-13' });
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (!q) return;
        const apply = () => {
            if (theme === 'classic') document.documentElement.removeAttribute('data-ui-theme');
            else document.documentElement.setAttribute('data-ui-theme', theme);
        };
        apply();
        const iv = setInterval(apply, 300);
        setReady(true);
        return () => clearInterval(iv);
    }, [q, theme]);

    useEffect(() => {
        if (!ready || !open) return;
        const t = setTimeout(() => {
            const el = document.querySelector(`[data-preview="${open}"] input`);
            el?.parentElement?.parentElement?.click();
            el?.click();
        }, 1200);
        return () => clearTimeout(t);
    }, [ready, open]);

    console.log('[preview] render', JSON.stringify(q), ready);
    if (!ready) return <div id="preview-wait">waiting</div>;
    return (
        <main className="overflow-hidden h-screen">
            
            <div className="app-shell flex h-screen w-full overflow-hidden bg-main">
                <Rail />
                <div className="view flex flex-col h-screen max-h-screen min-w-0 flex-1 overflow-hidden">
                    <Header />
                    <div className="viewc flex-1 min-h-0 rounded-md overflow-y-auto m-0">
                        {scene === 'dashboard' && <>
                            <PageHeader icon={ChartBarIcon} title="Dashboard" subtitle="CentIT Academy · Academic year 2083"
                                meta={[{ value: '1,284', label: 'students' }, { value: '64', label: 'staff' }]} />
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                                <Kpi label="Total Students" count="1,284" sublabel="2083" Icon={AcademicCapIcon} gradient="bg-teal-50 border-teal-100" />
                                <Kpi label="Total Staffs" count="64" sublabel="Active employees" Icon={UserGroupIcon} gradient="bg-sky-50 border-sky-100" />
                                <Kpi label="Running Economic Year" count="EY2083/084" sublabel="Accounting: 2083/084" Icon={CalendarDaysIcon} gradient="bg-emerald-50 border-emerald-100" />
                                <Kpi label="SMS Credits" count="4,210" sublabel="Total SMS sent: 18,332" Icon={DevicePhoneMobileIcon} gradient="bg-amber-50 border-amber-100" />
                            </div>
                        </>}
                        {scene === 'payment' && <>
                            <Button className="app-back-btn flex items-center gap-1.5 w-max" variant="outlined" size="sm">
                                <ChevronDownIcon className="w-4 h-4 rotate-90" /> Back to search
                            </Button>
                            <div className="app-idstrip flex items-center gap-3 px-4 py-3 my-2">
                                <span className="app-avatar">AP</span>
                                <div className="min-w-0">
                                    <p className="app-idstrip-name truncate">Aayush Pariyar</p>
                                    <p className="app-idstrip-sub capitalize">Class School Nine</p>
                                </div>
                            </div>
                            <Section title="Student's Ledger" description="Select titles below to proceed with payment" grid={false}>
                                <div className="w-full flex flex-col">
                                    <HeaderCard grid={3}><span className="flex gap-x-2 pl-[1.85rem]">title</span><span>rate</span><span>bill amount</span></HeaderCard>
                                    <TitleBill title="Monthly Fee" rate={2700} billAmount={8100} isSelected={true} onSelect={() => null} />
                                    <TitleBill title="Exam Fee" rate={600} billAmount={600} isSelected={true} onSelect={() => null} />
                                    <TitleBill title="transportation" rate={300} billAmount={900} isSelected={false} onSelect={() => null} />
                                    <TitleBill title="old dues" billAmount={22400} isSelected={true} onSelect={() => null} />
                                    <TitleBill title={'TOTAL'} billAmount={32000} disableClick={true} />
                                    <TitleBill title={'TOTAL SELECTED'} billAmount={31100} disableClick={true} />
                                </div>
                            </Section>
                            <Section title="Payment Form" grid={false}>
                                <div className="w-full overflow-x-auto"><div className="min-w-[600px] w-full flex flex-col">
                                    <HeaderCard grid={6}><span>title</span><span>rate</span><span>paying amount</span><span>discount amount</span><span>due</span><span>total</span></HeaderCard>
                                    {[["Monthly Fee", 2700, 8100, 2025, "", 6075], ["Exam Fee", 600, 600, "", "", 600], ["old dues", "", 17425, "", 4975, 17425]].map((r, i) => (
                                        <RowCard key={i} grid={6}>
                                            <span className="capitalize font-semibold">{r[0]}</span><span>{r[1]}</span>
                                            <AmountInput id={i} value={r[2]} onChange={() => null} />
                                            <AmountInput id={i} value={r[3]} onChange={() => null} />
                                            <span className="capitalize font-semibold">{r[4]}</span><span className="capitalize font-semibold">{r[5]}</span>
                                        </RowCard>
                                    ))}
                                </div></div>
                            </Section>
                        </>}
                        {scene === 'search' && <SearchPanel title="Search students" open={true} onToggle={() => null}
                            onSubmit={(e) => e.preventDefault()} onReset={() => null} activeCount={2}
                            filters={[{ key: 'class', label: 'Class', value: 'Nine' }, { key: 'status', label: 'Status', value: 'Running' }]}
                            onRemoveFilter={() => null}>
                            <Section>
                                <FilterSection title="Basic">
                                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 w-full">
                                        <TextInput input={{ name: 'first_name', label: 'First name' }} value={''} onChange={() => null} />
                                        <SelectInput input={{ name: 'status2', label: 'Status', options: [{ name: 'Running', value: '1' }] }} value={'1'} onChange={() => null} />
                                        <div data-preview="multi" className="sm:col-span-4">
                                            <SearchInput grid={12} multiSelect={true} input={{ name: 'groups', label: 'Ledger groups', options: [
                                                { name: 'Fees', value: 1 }, { name: 'Salaries', value: 2 }, { name: 'Utilities', value: 3 }] }}
                                                value={[1, 3]} onChange={() => null} />
                                        </div>
                                    </div>
                                </FilterSection>
                            </Section>
                        </SearchPanel>}
                        {scene !== 'payment' && <><Section title={"Staff ledger"}
                            description={"Post a payroll title the salary posting missed, and see the staff member's ledger."}>
                            <div data-preview="staff" className="sm:col-span-4">
                                <SearchInput grid={12} input={{ name: 'staff', label: 'Staff', options: STAFF }} value={staff}
                                    onChange={({ value }) => setStaff(value || '')}
                                    tabular={true} columns={[['name'], ['designation'], ['balance']]} />
                            </div>
                            <div data-preview="title" className="sm:col-span-4">
                                <SearchInput grid={12} input={{ name: 'title', label: 'Fee title', options: [
                                    { name: 'Tuition fee', value: 1 }, { name: 'Exam fee', value: 2 }, { name: 'transportation', value: 3 },
                                    { name: 'Computer fee', value: 4 }, { name: 'old dues', value: 5 }] }} value={''} onChange={() => null} />
                            </div>
                        </Section>
                        <Section title="Student details" description="Required fields are marked with an asterisk.">
                            <TextInput input={{ name: 'name', label: 'Full name', required: true }} value={form.name}
                                onChange={({ name, value }) => setForm(s => ({ ...s, [name]: value }))} />
                            <SelectInput input={{ name: 'status', label: 'Status', options: [{ name: 'Running', value: '1' }, { name: 'Left', value: '2' }] }}
                                value={form.status} onChange={({ name, value }) => setForm(s => ({ ...s, [name]: value }))} />
                            <TextInput input={{ name: 'date', label: 'Admission date (BS)' }} value={form.date}
                                onChange={({ name, value }) => setForm(s => ({ ...s, [name]: value }))} />
                            <TextInput input={{ name: 'contact', label: 'Contact', placeholder: '98XXXXXXXX' }} value={''}
                                onChange={() => null} error={'Contact number is required'} />
                            <TextInput input={{ name: 'email', label: 'Email', readOnly: true }} value={'office@centit.edu.np'} onChange={() => null} />
                            <SelectInput input={{ name: 'gender', label: 'Gender', options: [{ name: 'Male', value: 'm' }, { name: 'Female', value: 'f' }] }}
                                value={''} onChange={() => null} />
                        </Section>
                        <ButtonsSecion>
                            <Button variant="outlined" className="rounded-lg">Reset</Button>
                            <FormSaveButton />
                        </ButtonsSecion>
                        <div className="mt-4">
                            <BasicTable name="Students" columns={[
                                ['name', 'Name'], ['class', 'Class'], ['section', 'Section'], ['roll', 'Roll'],
                                ['status_str', 'Status', null, false, null, StatusCell], ['balance', 'Balance'],
                            ]} data={STUDENTS} actions={[payAction, editAction, deleteAction]} />
                        </div>
                        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <EmptyState title="No ledger entries yet" hint="Pick a staff member above to see their postings and payments." />
                            <div className="app-section">
                                <div className="flex flex-wrap gap-2">
                                    {['present', 'absent', 'paid', 'pending', 'unpaid', 'draft', 'left'].map(s => <Badge key={s} status={s}>{s}</Badge>)}
                                </div>
                            </div>
                        </div>
                        </>}
                    </div>
                </div>
            </div>
        </main>
    );
}
