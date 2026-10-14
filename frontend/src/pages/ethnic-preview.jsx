// LOCAL-ONLY harness (excluded via .git/info/exclude — never committed).
// The real Reports ▸ Ethnic group report page in the real shell, against
// invented students.   /ethnic-preview?rows=2177&recorded=40&theme=&fail=1&slow=1
//   recorded = percent of students with a group on record (0 = nobody)
import server from "@/services/server";
import Router, { useRouter } from "next/router";
import { useEffect } from "react";
import { useAppContext } from "@/contexts/AppContext";
import View from "@/components/View";
import AppSidebar from "@/components/Sidebar";
import EthnicGroupReport from "@/components/views/reports/enrollments/students/ethnic_groups";

const WORDS = ["Nursery", "LKG", "UKG", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const CLASSES = {};
let cid = 600;
WORDS.forEach((w, gi) => {
    const sections = gi >= 3 && gi <= 9 ? ["A", "B"] : [null];
    sections.forEach((sec, si) => {
        cid += 1;
        const name = sec ? `School ${w} (${sec})` : `School ${w}`;
        CLASSES[cid] = [name, { id: cid, grade: gi + 1, education_level: gi < 3 ? 1 : 2, name, ...(sec ? { section: 70 + si } : {}) }];
    });
});
// two classes nobody is in: they must not become rows of zeros
CLASSES[990] = ["School Ten (C)", { id: 990, grade: 13, education_level: 2, section: 79, name: "School Ten (C)" }];
CLASSES[991] = ["Bachelor First sem", { id: 991, grade: 20, education_level: 4, name: "Bachelor First sem" }];
const CLASS_IDS = Object.keys(CLASSES).map(Number).filter((id) => id < 990);

const FIRST = ["Aarav", "Asha", "Bikram", "Binita", "Chandra", "Dipa", "Esha", "Ganesh", "Hari", "Indira", "Janak", "Kamala", "Laxmi", "Mohan", "Nisha", "Om", "Puja", "Ramesh", "Sita", "Tek Bahadur", "Uma", "Yam Kumari"];
const LAST = ["K C", "Pun", "Chaudhary", "Oli", "Gharti Magar", "Budhathoki", "Pokharel", "Dangi", "Rawat", "Sharma", "Basnet", "B K", "Pariyar", "Khan"];
// school-29-like mix: Chhetri, Tharu, Magar, Kami lead; a few of the small groups
const MIX = [1, 1, 1, 1, 1, 1, 4, 4, 4, 4, 4, 3, 3, 3, 3, 7, 7, 7, 7, 2, 12, 0, 8, 15, 13, 9, 11, 6];
let MIX_NOW = MIX;
function makeStudents(n, recordedPct) {
    // ?groups=6 keeps the first six distinct groups of the mix: a typical school
    const want = Number(new URLSearchParams(window.location.search).get("groups") || 0);
    if (want) { const keep = [...new Set(MIX)].slice(0, want); MIX_NOW = MIX.filter((g) => keep.includes(g)); }
    return Array.from({ length: n }, (_, i) => {
        const id = i + 1;
        const klass = CLASS_IDS[(i * 7) % CLASS_IDS.length];
        const has = ((i * 37) % 100) < recordedPct;
        return {
            id, name: `${FIRST[i % FIRST.length]} ${i % 5 === 0 ? "Kumari " : ""}${LAST[(i * 3) % LAST.length]}`,
            class_info: i === 5 ? 4242 : klass, // one student in a class the list does not carry
            roll_no: i % 23 === 0 ? null : `${(i % 40) + 1}`, gender: (i % 2) + 1,
            ethnicity: has ? MIX_NOW[(i * 11) % MIX_NOW.length] : null,
            father_name: `${FIRST[(i + 7) % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`,
            guardian_contact: `98${String(41000000 + id * 7531).slice(0, 8)}`, location: i % 3 ? "Ghorahi-15, Dang" : "Tulsipur-9 Beluwa, Dang",
        };
    });
}
const ok = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });
const fail = (config, status, message) => Promise.reject(Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: { message }, config } }));

if (typeof window !== "undefined") window.__calls = [];
server.defaults.adapter = async (config) => {
    const q = new URLSearchParams(window.location.search);
    const url = config.url || "";
    window.__calls.push({ method: (config.method || "get").toLowerCase(), url, params: config.params || {} });
    await new Promise((r) => setTimeout(r, q.get("slow") && /ethnic/.test(url) ? 2500 : 80));
    if (/\/api\/classes$/.test(url)) return ok(config, CLASSES);
    if (/ethnic_group_report$/.test(url)) {
        if (q.get("fail") && !window.__letThrough) return fail(config, 500, "Server Error");
        return ok(config, { students: makeStudents(Number(q.get("rows") ?? 2177), Number(q.get("recorded") ?? 40)) });
    }
    return ok(config, []);
};

export default function EthnicPreview() {
    const { user: { user, setUser }, fiscalYear, class: klass } = useAppContext();
    const { query, isReady } = useRouter();
    useEffect(() => {
        if (!isReady) return;
        if (Router.router) { Router.router.push = async () => true; Router.router.replace = async () => true; }
        const theme = `${query.theme || "classic"}`;
        if (theme === "classic") document.documentElement.removeAttribute("data-ui-theme");
        else document.documentElement.setAttribute("data-ui-theme", theme);
        fiscalYear.setYear({ economic_year: 5, economic_year_name: "EY2083/084", academic_year: 1, academic_year_name: "SCHOOL 2083", accounting_economic_year: 2, accounting_economic_year_name: "2083/084" });
        const me = { role: "admin", username: "preview", today: "2083-06-21", profile: { id: 29, account: 46, name: "Preview School", location: "Ghorahi, Dang", contact: "9857800000" } };
        setUser(me);
        // no token, so the app's own start-up does not load the classes: ask for them here
        klass.loadClasses(me, true);
    }, [isReady]);
    if (!user) return null;
    return (
        <main className="h-screen w-full bg-main">
            <div className="app-shell flex h-screen w-full overflow-hidden">
                <AppSidebar menus={[]} />
                <View type="admin" selectedMenu="reports.ethnic-group-report">
                    <EthnicGroupReport />
                </View>
            </div>
        </main>
    );
}
