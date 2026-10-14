// LOCAL-ONLY (in .git/info/exclude). The dashboard's own widgets, drawn with the
// exact classes summary.jsx / UpcomingBirthdaysView.jsx use, so their CSS can be
// judged in every theme without signing in.  /dash-preview?theme=vivid
import { useEffect } from "react";
import { useRouter } from "next/router";
import FilterItem from "@/components/inputs/FilterItem";        
import { Button } from "@material-tailwind/react";
import AttentionBox from "@/components/AttentionBox";
import SMSLength from "@/components/views/communication/sms/SMSLength";
import GenderSplit from "@/components/views/reports/dashboards/school/GenderSplit";

const Cell = ({ kind, n, label, tone }) => (
    <div className={`app-cell app-cell-${kind} rounded-lg ${tone} py-2 text-center`}>
        <div className="text-2xl font-bold leading-none">{n}</div>
        <div className="text-[11px] font-semibold uppercase tracking-wide mt-1">{label}</div>
    </div>
);
const Sub = ({ label, present, absent }) => (
    <div className="app-subpanel rounded-xl bg-white/80 shadow-md border border-teal-100 p-4">
        <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold uppercase tracking-wide text-gray-600">{label}</span>
            <span className="ml-auto text-[11px] font-semibold text-gray-500">{Math.round((present / (present + absent)) * 100)}% present</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
            <Cell kind="present" n={present} label="Present" tone="bg-emerald-50 border border-emerald-100" />
            <Cell kind="absent" n={absent} label="Absent" tone="bg-rose-50 border border-rose-100" />
            <Cell kind="total" n={present + absent} label="Total" tone="bg-gray-50 border border-gray-200" />
        </div>
    </div>
);
export default function DashPreview() {
    const { query } = useRouter();
    useEffect(() => {
        const theme = `${query.theme || "classic"}`;
        if (theme === "classic") document.documentElement.removeAttribute("data-ui-theme");
        else document.documentElement.setAttribute("data-ui-theme", theme);
    }, [query.theme]);
    return (
        <div className="p-6 max-w-6xl mx-auto flex flex-col gap-4 min-h-screen" style={{ background: "var(--t-canvas, #e4f1f3)" }}>
            <div id="buttons" className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4">
                <Button id="b-teal" color="teal">Save</Button>
                <Button id="b-blue" color="blue">Generate</Button>
                <Button id="b-out" variant="outlined" color="teal">Reset</Button>
                <Button id="b-text" variant="text" color="teal">Cancel</Button>
                <Button id="b-red" color="red">Delete</Button>
                <button id="b-custom" type="button" className="rounded-lg bg-teal-500/90 px-4 py-2 text-sm font-semibold text-white">See list</button>
                <button id="b-soft" type="button" className="p-1.5 rounded bg-teal-50 text-teal-700">Edit</button>
            </div>
            <div id="chips" className="flex flex-col gap-y-3">
                <div className="flex flex-wrap">
                    {[["Baisakh", {}], ["Jestha", { isSelected: true }], ["Ashad", { isWarned: true }], ["Shrawn", { isWarned: true, isSelected: true }], ["Bhadra", { isDisabled: true }], ["Ashoj", {}]].map(([label, state], i) => (
                        <FilterItem key={label} name="month" label={label} value={i + 1} onClick={() => null} {...state} />
                    ))}
                </div>
                <AttentionBox dismissable={false} title="Already posted months" message="baisakh, jestha — already posted for this class, so they can't be posted again from here." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[["Total Students", "720", "2083"], ["Total Staffs", "4", "Active employees"], ["SMS Credits", "4,210", "Total SMS sent: 18,332"]].map(([l, v, s]) => (
                    <div key={l} className="app-kpi relative overflow-hidden rounded-xl border bg-white p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4">
                        <div className="flex flex-col min-w-0">
                            <span className="app-kpi-label text-[11px] font-semibold uppercase tracking-wider text-gray-700 leading-snug">{l}</span>
                            <span className="app-kpi-value text-xl xl:text-2xl font-bold text-gray-900 leading-tight truncate">{v}</span>
                            <span className="app-kpi-sub text-[11px] text-gray-700/80 truncate">{s}</span>
                        </div>
                    </div>
                ))}
            </div>
            <div className="app-panel rounded-xl bg-white border p-4">
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700 mb-3">Today&apos;s Attendance</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Sub label="Students" present={655} absent={65} />
                    <Sub label="Staffs" present={4} absent={0} />
                </div>
            </div>
            <div id="smslen" className="flex flex-col gap-y-4 rounded-xl bg-white p-4">
                {[
                    "आदरणीय अभिभावकज्यू, तपाइको नानीबाबु {{student-name}} को असोज सम्मको बाँकी रकम रु.{{balance-amount}} रहेकाले यथाशीघ्र भुक्तानी गरिदिनुहुन विनम्र अनुरोध गर्दछौँ।\nधन्यवाद!\nविद्यालय प्रशासन (त्रिदेव स्कुल)",
                    "Dear parent, {{student-name}} was absent today.",
                    "Happy Birthday {{staff-name}}! 🎉 Wishing you a wonderful year ahead. — From all of us at the school.",
                    "School reopens on Sunday.",
                    "",
                ].map((text, i) => (
                    <div key={i} data-case={i}>
                        <textarea readOnly value={text} className="w-full rounded-lg border border-gray-300 p-2 text-base" rows={3}></textarea>
                        <SMSLength text={text} placeholders={/\{\{[^{}]+\}\}/.test(text)} />
                    </div>
                ))}
            </div>
            <div id="gender" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <GenderSplit title="Running Students" counts={{ male: 190, female: 173, others: 0 }} emptyHint="No students are enrolled for this academic year yet." />
                <GenderSplit title="Employed Staffs" counts={{ male: 8, female: 8, others: 0 }} emptyHint="No staff records have been added yet." />
                <GenderSplit title="Running Students" counts={{ male: 1284, female: 1071, others: 3 }} emptyHint="-" />
                <GenderSplit title="Employed Staffs" counts={{ male: 0, female: 0, others: 0 }} emptyHint="No staff records have been added yet." />
                <GenderSplit title="Running Students" counts={{ male: 1, female: 1, others: 1 }} emptyHint="-" />
                <GenderSplit title="Employed Staffs" counts={{ male: 0, female: 12, others: 0 }} emptyHint="-" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {["Today student birthdays", "Today staff birthdays"].map((label, i) => (
                    <div key={label} className="app-panel relative mb-1 overflow-hidden !rounded-xl border bg-white">
                        <div className="flex items-center gap-x-3 p-4">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-500">B</span>
                            <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-semibold text-[var(--ink-600)]">{label}</div>
                                <div className="text-[1.7rem] font-extrabold leading-tight text-[var(--ink-900)]">{i ? 0 : 3}</div>
                            </div>
                            <button type="button" className="shrink-0 rounded-[10px] border border-[var(--field-line)] bg-white px-3.5 py-2 text-sm font-bold text-[var(--ink-800)]">See list</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
