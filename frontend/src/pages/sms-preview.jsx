// LOCAL-ONLY harness (excluded via .git/info/exclude — never committed).
// The real SMS pages and the balance card against an in-memory stand-in for the
// API, signed in as a made-up admin.  /sms-preview?page=bulk|staff|dues|card
import server from "@/services/server";
import { useAppContext } from "@/contexts/AppContext";
import { useEffect, useState } from "react";
import Router, { useRouter } from "next/router";
import SendBulkSMS from "@/components/views/communication/sms/bulk_sms";
import SMSDuesReminder from "@/components/views/communication/sms/dues_reminder";
import SendStaffSMS from "@/components/views/communication/sms/staff_sms";
import { useSMSCredits, creditFacts } from "@/components/views/communication/sms/useSMSCredits";
import AttentionBox from "@/components/AttentionBox";

const NEPALI = "आदरणीय अभिभावकज्यू, तपाइको नानीबाबु {{student-name}} को असोज सम्मको बाँकी रकम रु.{{balance-amount}} रहेकाले यथाशीघ्र भुक्तानी गरिदिनुहुन विनम्र अनुरोध गर्दछौँ।\nधन्यवाद!\nविद्यालय प्रशासन (त्रिदेव स्कुल)";
const ok = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });
const people = (n, extra) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Person ${i + 1}`, contact_no: "9800000000", primary_contact: "9800000000", balance: 1200, designation: "Teacher", ...extra }));

server.defaults.adapter = async (config) => {
    await new Promise((r) => setTimeout(r, 120));
    const url = config.url || "";
    const q = new URLSearchParams(window.location.search);
    window.__calls = [...(window.__calls || []), `${config.method} ${url}`];
    if (config.method === "get" && /\/api\/sms$/.test(url)) {
        // a scripted run of answers; the last one repeats
        const script = window.__credits || [{ available_credit: 1182, total_sms_sent: 1074, as_of: Math.floor(Date.now() / 1000) }];
        window.__creditAsks = (window.__creditAsks || 0) + 1;
        return ok(config, script.length > 1 ? script.shift() : script[0]);
    }
    if (/\/api\/sms\/templates$/.test(url)) return ok(config, q.get("notemplate") ? [] : [{ id: 3, type: 1, template: "old one" }, { id: 9, type: 1, template: NEPALI }, { id: 4, type: 2, template: "Paid, thank you." }]);
    if (/search\/students$/.test(url)) return ok(config, people(Number(q.get("n")) || 64));
    if (/search\/staffs$/.test(url)) return ok(config, people(16));
    if (/send_(bulk|dues|staff)_sms$/.test(url)) {
        window.__sent = [...(window.__sent || []), { url, body: typeof config.data === "string" ? JSON.parse(config.data) : config.data }];
        return ok(config, { message: "SMS sent!" });
    }
    return ok(config, []);
};

function Card() {
    const { info, checking } = useSMSCredits(46, true);
    const { value, note, estimated } = creditFacts(info, checking);
    return (
        <div className="app-kpi relative overflow-hidden rounded-xl border bg-white p-4 flex flex-col w-[19rem]">
            <span className="app-kpi-label text-[11px] font-semibold uppercase tracking-wider text-gray-700">SMS Credits</span>
            <span id="card-value" data-estimated={estimated ? "1" : "0"} data-checking={checking ? "1" : "0"} className="app-kpi-value text-2xl font-bold text-gray-900">{info ? value : "-"}</span>
            <span id="card-note" className="app-kpi-sub text-[11px] text-gray-700/80 truncate" title={note}>{info ? note : "Available balance"}</span>
        </div>
    );
}

function NoteInForm() {
    const [submits, setSubmits] = useState(0);
    return (
        <form onSubmit={(e) => { e.preventDefault(); setSubmits((n) => n + 1); }}>
            <AttentionBox title="Review SMS Credits" description="closing this must not submit the form" />
            <span id="submits">{submits}</span>
            <button type="submit">Send</button>
        </form>
    );
}

export default function SMSPreview() {
    const { user: { user, setUser }, notification: { notification } } = useAppContext();
    const { query, isReady } = useRouter();
    // no token: the app's own start-up (fiscal years, menus, classes) stays off
    useEffect(() => {
        // the stand-in school has no academic-year mapping, and the app answers
        // that by sending the user to its support page: stay on this one
        if (Router.router) { Router.router.push = async () => true; Router.router.replace = async () => true; }
        setUser({ role: "admin", username: "preview", profile: { id: 38, account: 46, name: "Preview School" } });
    }, []);
    if (!user || !isReady) return null;
    const page = `${query.page || "bulk"}`;
    return (
        <div className="p-4 max-w-5xl mx-auto bg-white min-h-screen">
            <div id="toast" className="text-sm font-semibold text-blue-900 min-h-[1.25rem]">{notification?.message ? `[${notification.status}] ${notification.message}` : ""}</div>
            {page === "bulk" && <SendBulkSMS />}
            {page === "staff" && <SendStaffSMS />}
            {page === "dues" && <SMSDuesReminder />}
            {page === "card" && <><Card /><div className="mt-6"><NoteInForm /></div></>}
        </div>
    );
}
