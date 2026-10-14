// LOCAL-ONLY harness (excluded via .git/info/exclude — never committed).
// The real shell (rail + View) around the three pages that name one person in
// a strip and now keep that strip pinned. Every name and figure is invented.
//   /pin-preview?page=payment|library|users&theme=classic|vivid|daylight|evergreen&rows=40
import server from "@/services/server";
import Router, { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import View from "@/components/View";
import AppSidebar from "@/components/Sidebar";
import StudentPayment from "@/components/views/payments/student";
import BookTransactionView from "@/components/views/library/book_transaction";
import ManageUsers from "@/components/views/managements/users";

const ok = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });
const TITLES = { 1: "monthly fee", 2: "exam fee", 3: "computer fee", 4: "transportation", 5: "annual fee", 6: "library fee", 7: "sports fee", 8: "tie and belt" };
const STUDENTS = [
    { id: 9001, name: "Preview Student With A Fairly Long Name", classname: "school two (green)", balance: 9519, class_info: 501, class_academic_year: 1, father_name: "Preview Father", contact: "9800000000" },
    { id: 9002, name: "Second Preview", classname: "school three", balance: 0, class_info: 502, class_academic_year: 1 },
];
const STAFFS = [{ id: 7001, name: "Preview Teacher", designation: "teacher", contact: "9800000001" }];

function historyRows(n) {
    const rows = [];
    for (let i = 0; i < n; i++) {
        const debit = i % 3 !== 2;
        rows.push(debit
            ? { id: 100 + i, invoice_id: "", date: `2083-0${1 + (i % 6)}-1${i % 9}`, particulars: [[1, 1700], [2, 400], [4, 350]], debit_amount: 2450, classname: "school two (green)", academic_year_name: "SCHOOL 2083", remarks: "", months: [1 + (i % 6)] }
            : { id: 100 + i, invoice_id: 300 + i, date: `2083-0${1 + (i % 6)}-2${i % 9}`, particulars: [[1, 1700], [2, 400]], credit_amount: 2100, mode: 1, classname: "school two (green)", academic_year_name: "SCHOOL 2083", remarks: "paid at the counter", months: [1 + (i % 6)] });
    }
    return rows;
}

function install(rows) {
    if (typeof window !== "undefined") window.__calls = [];
    server.defaults.adapter = async (config) => {
        await new Promise((r) => setTimeout(r, 30));
        const url = config.url || "", p = config.params || {}, method = (config.method || "get").toLowerCase();
        window.__calls.push(`${method} ${url} ${JSON.stringify(p)}`);
        if (/api\/search\/students$/.test(url)) return ok(config, STUDENTS);
        if (/api\/search\/staffs$/.test(url)) return ok(config, STAFFS);
        if (/api\/ledgers$/.test(url) && method === "get") return ok(config, {
            titles: TITLES,
            rates: { 1: 1700, 2: 400, 3: 250, 4: 350, 5: 1700, 6: 100, 7: 150, 8: 300 },
            bill_amount: { 1: 5100, 2: 400, 3: 750, 4: 1050, 5: 1700, 6: 100, 7: 150, 8: 269 },
            total: 9519,
        });
        if (/api\/students\/discounts$/.test(url)) return ok(config, []);
        if (/api\/staffs$/.test(url) && method === "get" && p.staff) return ok(config, { id: 7001, first_name: "Preview", middle_name: "", last_name: "Teacher", gender: 1, contact: "9800000001", email: "", location: "Preview-5, Dang", birth_date: "2050-01-01", joined_date: "2075-01-01", is_active: true, status: 1, role: 1, school: 1, other_info: {}, account: null });
        if (/api\/payments$/.test(url) && method === "get" && !p.id) return ok(config, { data: historyRows(rows), titles: TITLES });
        return ok(config, []);
    };
}

const PAGES = { payment: StudentPayment, library: BookTransactionView, users: ManageUsers };

export default function PinPreview() {
    const { user: { user, setUser }, fiscalYear } = useAppContext();
    const { query, isReady } = useRouter();
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (!isReady) return;
        if (Router.router) { Router.router.push = async () => true; Router.router.replace = async () => true; }
        const theme = `${query.theme || "classic"}`;
        if (theme === "classic") document.documentElement.removeAttribute("data-ui-theme");
        else document.documentElement.setAttribute("data-ui-theme", theme);
        install(Number(query.rows) || 40);
        fiscalYear.setYear({ economic_year: 5, economic_year_name: "EY2083/084", academic_year: 1, academic_year_name: "SCHOOL 2083", accounting_economic_year: 2, accounting_economic_year_name: "2083/084" });
        setUser({ role: "admin", username: "preview", today: "2083-06-22", profile: { id: 1, account: 1, name: "Preview Academy School", location: "Preview-5, Dang", contact: "9800000000" } });
        setReady(true);
    }, [isReady]);
    if (!user || !ready) return null;
    const Page = PAGES[`${query.page || "payment"}`] || StudentPayment;
    return (
        // the class chain of pages/[role].jsx, so the scroller is the real one
        <main className="overflow-hidden h-screen">
            <div className="app-shell flex h-screen w-full overflow-hidden">
                <AppSidebar menus={[]} />
                <View type="admin" selectedMenu={`${query.menu || "payment.student"}`}>
                    <Page />
                </View>
            </div>
        </main>
    );
}
