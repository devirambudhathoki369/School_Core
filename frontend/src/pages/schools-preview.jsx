// LOCAL-ONLY harness (excluded via .git/info/exclude — never committed).
// The real console shell around the real Superadmin ▸ Schools page, against
// stand-in data.
//   /schools-preview?rows=75|0|3&fail=1&slow=1
import server from "@/services/server";
import Router, { useRouter } from "next/router";
import { useEffect } from "react";
import { useAppContext } from "@/contexts/AppContext";
import View from "@/components/View";
import AppSidebar from "@/components/Sidebar";
import AdminManagementView from "@/components/views/enrollments/admin";

const NAMES = ["Jeevan Premi Educare", "Tridev English Boarding School", "Shree Tridev Adarsha English Boarding Secondary School and College", "Pearl Academy", "Tulsipur Polytechnic Institute", "Nawa Nepal Secondary School", "Guru Jajur Diploma College", "Namoona Higher Secondary School", "Araniko Public School", "Metro International College"];
const PLACES = ["Tulsipur-9 Beluwa, Dang", "Tulsipur Sub-Metropolitan -7 Shreegain, Dang", "Ghorahi-15, Dang", "Lamahi-5, Dang", "Nepalgunj-4, Banke", "Butwal-11, Rupandehi"];
const yn = (b) => (b ? "yes" : "no");
function makeRows(n) {
    return Array.from({ length: n }, (_, i) => {
        const id = i + 1;
        const test = id % 9 === 0, app = id % 3 !== 0, time = id % 4 === 0;
        return {
            id, account__id: 500 + id, account__username: `${NAMES[i % NAMES.length].toLowerCase().replace(/[^a-z]/g, "").slice(0, 14)}${id}`,
            name: i >= NAMES.length ? `${NAMES[i % NAMES.length]} ${id}` : NAMES[i], address: PLACES[i % PLACES.length],
            contact: `98${String(47000000 + id * 7531).slice(0, 8)}`, telephone: id % 5 === 0 ? "" : `0825${String(20000 + id * 13).slice(0, 5)}`,
            estd_date: `20${60 + (id % 20)}-04-01`, pan_no: `${300000000 + id * 271}`, email: `info${id}@school${id}.edu.np`,
            renew_date: "2084-03-31", economic_year: 5, economic_year__name: "EY2083/084",
            slogan: id % 4 === 0 ? "" : "Education for a brighter tomorrow", about_us: id % 2 ? "A community school serving the valley since its founding.\nRuns classes from play group to grade twelve." : "",
            test_account: test, uses_mobile_app: app, time_set_required: time,
            test_account_str: yn(test), uses_mobile_app_str: yn(app), time_set_required_str: yn(time), uses_sms_str: "no",
        };
    });
}
const ok = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });
const fail = (config, status, message) => Promise.reject(Object.assign(new Error(message), { response: { status, data: { message }, config } }));

if (typeof window !== "undefined") window.__calls = [];
server.defaults.adapter = async (config) => {
    const q = new URLSearchParams(window.location.search);
    await new Promise((r) => setTimeout(r, q.get("slow") ? 1500 : 120));
    const url = config.url || "";
    const method = (config.method || "get").toLowerCase();
    const body = typeof config.data === "string" ? JSON.parse(config.data) : config.data;
    window.__calls.push({ method, url, body });
    if (/\/api\/admins$/.test(url)) {
        if (method === "get") return ok(config, makeRows(Number(q.get("rows") ?? 75)));
        if (q.get("fail")) return fail(config, 409, "Username already exists!");
        if (method === "post") return ok(config, { message: "School has been succesfully added!", school: { id: 999, account__username: body?.account?.username, ...body, account: undefined, economic_year__name: "EY2083/084", test_account_str: yn(body?.test_account), uses_sms_str: yn(body?.uses_sms), uses_mobile_app_str: yn(body?.uses_mobile_app) } });
        return ok(config, { message: "School has been succesfully updated!", school: body });
    }
    if (/economic/i.test(url)) return ok(config, [{ id: 4, name: "EY2082/083" }, { id: 5, name: "EY2083/084" }, { id: 6, name: "EY2084/085" }]);
    if (/change_password/.test(url)) return ok(config, { message: "Password has been changed!" });
    return ok(config, []);
};

export default function SchoolsPreview() {
    const { user: { user, setUser } } = useAppContext();
    const { isReady } = useRouter();
    useEffect(() => {
        if (!isReady) return;
        if (Router.router) { Router.router.push = async () => true; Router.router.replace = async () => true; }
        // no token: the app's own start-up (menus, fiscal years, classes) stays off
        setUser({ role: "superadmin", username: "preview", today: "2083-06-18" });
    }, [isReady]);
    if (!user) return null;
    return (
        <main className="h-screen w-full bg-main">
            <div className="app-shell flex h-screen w-full overflow-hidden">
                <AppSidebar menus={[]} />
                <View type="superadmin" selectedMenu="setup.client">
                    <AdminManagementView />
                </View>
            </div>
        </main>
    );
}
