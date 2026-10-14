// LOCAL-ONLY harness (excluded via .git/info/exclude — never committed).
// The real Extra Billing ▸ Parties page in the real shell, against invented
// parties held in memory.   /parties-preview?rows=350|0|3&theme=&fail=1&slow=1
import server from "@/services/server";
import Router, { useRouter } from "next/router";
import { useEffect } from "react";
import { useAppContext } from "@/contexts/AppContext";
import View from "@/components/View";
import AppSidebar from "@/components/Sidebar";
import ExtraBillingParties from "@/components/views/extra_billing/parties";

const FIRST = ["Abhibhakta", "Amar", "Arjun", "Basant", "Bishnu", "Chandra", "Dhan Bahadur", "Ganesh", "Hari Prasad", "Indira", "Janak", "Kamala", "Laxmi", "Mohan", "Narayan", "Om Prakash", "Purna", "Ram Bahadur", "Sita", "Tek Bahadur", "Uma", "Yam Kumari"];
const LAST = ["K C", "Pun", "Shah", "Chaudhary", "Oli", "Gharti Magar", "Budhathoki", "Pokharel", "Dangi", "Rawat", "Sharma", "Basnet"];
const PLACES = ["Ghorahi 11, Khaira", "Ghorahi-15, Dang", "Tulsipur-9 Beluwa, Dang", "Lamahi-5, Dang", "Narayanpur, Dang", ""];
const BLOCKS = ["KCE-PLOT", "BPN PLOT", "AGRI FARM", "Shutter No.", "Old block room"];
const TYPES = { 1: "Tenant", 2: "Shop / shutter", 3: "Canteen / cafeteria", 4: "Institution / office", 5: "Staff quarter", 6: "Other" };
function makeRows(n) {
    return Array.from({ length: n }, (_, i) => {
        const id = i + 1;
        const type = id % 11 === 0 ? 4 : id % 17 === 0 ? 3 : id % 7 === 0 ? 2 : 1;
        const opening = id % 3 === 0 ? 0 : (id * 1370) % 48000;
        const billed = id % 25 === 0;
        return {
            id, name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`.toUpperCase() + (i >= FIRST.length * LAST.length ? ` ${id}` : ""),
            party_type: type, party_type_name: TYPES[type],
            contact: id % 4 === 0 ? null : `98${String(41000000 + id * 7531).slice(0, 8)}`,
            address: PLACES[i % PLACES.length] || null,
            property_name: `${BLOCKS[i % BLOCKS.length]} ${id}`,
            agreement_start: "2080-04-01", agreement_end: id % 5 === 0 ? null : "2088-03-30",
            opening_due: opening.toFixed(2), remarks: id % 6 === 0 ? "2080 Saun to 2083 Asar" : null,
            monthly: id % 2 ? ((id * 35) % 6000).toFixed(2) : 0,
            charged: billed ? "12000.00" : 0, paid: billed ? "4000.00" : 0,
            balance: (opening + (billed ? 8000 : 0)).toFixed(2),
            _money: billed || id === 7,   // 7: a bill of Rs. 0, so the list cannot tell it is locked
        };
    });
}
let PARTIES = null;
let TITLES = [{ id: 1, title: "Rent", order: 1, remarks: null, parties: 120 }, { id: 2, title: "Water", order: 2, remarks: null, parties: 40 }, { id: 3, title: "Electricity", order: 3, remarks: null, parties: 0 }];
const CHARGES = {};
const ok = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });
const fail = (config, status, message) => Promise.reject(Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: message ? { message } : "<h1>Server Error (500)</h1>", config } }));

if (typeof window !== "undefined") window.__calls = [];
server.defaults.adapter = async (config) => {
    const q = new URLSearchParams(window.location.search);
    if (!PARTIES) PARTIES = makeRows(Number(q.get("rows") ?? 350));
    await new Promise((r) => setTimeout(r, q.get("slow") ? 1500 : 90));
    const url = config.url || "", p = config.params || {};
    const method = (config.method || "get").toLowerCase();
    const body = typeof config.data === "string" ? JSON.parse(config.data) : (config.data || {});
    window.__calls.push({ method, url, body, params: p });
    if (/extra-billing\/parties$/.test(url)) {
        if (method === "get") return ok(config, [...PARTIES].sort((a, b) => a.name.localeCompare(b.name)).map(({ _money, ...row }) => row));
        if (q.get("fail")) return fail(config, 500);
        if (method === "delete") {
            const row = PARTIES.find((x) => x.id === Number(p.id));
            if (row?._money) return fail(config, 400, `${row.name} has 3 bill(s) and 1 receipt(s) on record, so the record has to stay. Nothing was deleted.`);
            PARTIES = PARTIES.filter((x) => x.id !== Number(p.id));
            return ok(config, { message: "Party removed!" });
        }
        const name = (body.name || "").trim(), prop = (body.property_name || "").trim() || null;
        if (PARTIES.some((x) => x.id !== body.id && x.name.toLowerCase() === name.toLowerCase() && (x.property_name || null) === prop)) return fail(config, 409, "Record already exists!");
        if ((body.contact || "").length > 15) return fail(config, 500);
        const values = { name, party_type: Number(body.party_type) || 1, party_type_name: TYPES[Number(body.party_type) || 1], contact: body.contact || null, address: body.address || null, property_name: prop, agreement_start: body.agreement_start || null, agreement_end: body.agreement_end || null, remarks: body.remarks || null };
        if (method === "put") {
            const row = PARTIES.find((x) => x.id === body.id);
            Object.assign(row, values);
            if ("opening_due" in body && !row._money) {
                row.opening_due = Number(body.opening_due || 0).toFixed(2);
                row.balance = row.opening_due;
            }
            return ok(config, { id: row.id, message: "Party updated!" });
        }
        const id = Math.max(0, ...PARTIES.map((x) => x.id)) + 1;
        PARTIES.push({ id, ...values, opening_due: Number(body.opening_due || 0).toFixed(2), monthly: 0, charged: 0, paid: 0, balance: Number(body.opening_due || 0).toFixed(2), _money: false });
        return ok(config, { id, message: "Party added!" });
    }
    if (/extra-billing\/titles$/.test(url)) {
        if (method === "get") return ok(config, q.get("titles") === "0" ? [] : TITLES);
        if (method === "delete") { TITLES = TITLES.filter((t) => t.id !== Number(p.id)); return ok(config, { message: "Title removed!" }); }
        return ok(config, { message: "ok" });
    }
    if (/extra-billing\/charges$/.test(url)) {
        if (method === "get") return ok(config, TITLES.map((t) => ({ ...t, amount: CHARGES[`${p.party}:${t.id}`] || 0 })));
        let monthly = 0;
        (body.charges || []).forEach((c) => { CHARGES[`${body.party}:${c.title}`] = Number(c.amount || 0); monthly += Number(c.amount || 0); });
        const row = PARTIES.find((x) => x.id === Number(body.party));
        if (row) row.monthly = monthly.toFixed(2);
        return ok(config, { message: "Charges saved!", monthly });
    }
    return ok(config, []);
};

export default function PartiesPreview() {
    const { user: { user, setUser }, fiscalYear } = useAppContext();
    const { query, isReady } = useRouter();
    useEffect(() => {
        if (!isReady) return;
        if (Router.router) { Router.router.push = async () => true; Router.router.replace = async () => true; }
        const theme = `${query.theme || "classic"}`;
        if (theme === "classic") document.documentElement.removeAttribute("data-ui-theme");
        else document.documentElement.setAttribute("data-ui-theme", theme);
        fiscalYear.setYear({ economic_year: 5, economic_year_name: "EY2083/084", academic_year: 1, academic_year_name: "SCHOOL 2083", accounting_economic_year: 2, accounting_economic_year_name: "2083/084" });
        setUser({ role: "admin", username: "preview", today: "2083-06-21", profile: { id: 29, account: 46, name: "Preview School", location: "Ghorahi, Dang", contact: "9857800000" } });
    }, [isReady]);
    if (!user) return null;
    return (
        <main className="h-screen w-full bg-main">
            <div className="app-shell flex h-screen w-full overflow-hidden">
                <AppSidebar menus={[]} />
                <View type="admin" selectedMenu="extra-billing.parties">
                    <ExtraBillingParties />
                </View>
            </div>
        </main>
    );
}
