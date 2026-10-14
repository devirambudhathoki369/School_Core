// LOCAL-ONLY harness (excluded via .git/info/exclude — never committed).
// The real page shell (View: the header) around the real school dashboard,
// against stand-in data shaped like a real school's.
//   /dashboard-preview?theme=classic|vivid|daylight|evergreen&data=real|full|empty&att=some|none
import server from "@/services/server";
import Router, { useRouter } from "next/router";
import { useEffect } from "react";
import { useAppContext } from "@/contexts/AppContext";
import View from "@/components/View";
import AppSidebar from "@/components/Sidebar";
import SchoolSummary from "@/components/views/reports/dashboards/school/summary";

const STATIONS = ["UKG all Area", "GAIRAPATU -01", "MAJUWA", "LKG all Area", "RANAGAUN", "Ghorahi Bazar", "Tulsipur Line", "Narayanpur", "Bijauri", "Hekuli", "Lamahi", "Tribhuvannagar Chowk East Gate", "Sisahaniya", "Rampur", "Saudiyar", "Duruwa", "Dharna", "Manpur", null, "Urahari", "Pawannagar", "Shreegaun", "Halwar"];
const COUNTS = [63, 63, 56, 50, 45, 38, 31, 27, 24, 21, 18, 15, 12, 11, 9, 8, 6, 5, 3, 3, 2, 2, 1];
const ok = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });

server.defaults.adapter = async (config) => {
    await new Promise((r) => setTimeout(r, 150));
    const url = config.url || "";
    const q = new URLSearchParams(window.location.search);
    const kind = q.get("data") || "real";
    if (/\/api\/dashboard$/.test(url)) {
        if (kind === "empty") return ok(config, { total: {}, collections: { months: [], data: [] }, transportation_services: { stations: [], data: [] } });
        const collections = kind === "full"
            ? { months: [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3], data: [1218492, 477615, 1064656, 912300, 388200, 1502750, 640000, 280500, 955125, 1320400, 410900, 760250] }
            : { months: [3, 4, 5, 6], data: [80000, 865470, 190275, 802605] };
        return ok(config, {
            total: { male_students: 402, female_students: 271, others_students: 0, student_discounts_count: 564, male_staffs: 11, female_staffs: 27, others_staffs: 0, bus_stations: 24, transportation_enrollments: 513, courses: 0, published_results: 1 },
            collections,
            transportation_services: { stations: STATIONS, data: COUNTS },
        });
    }
    if (/attendance-today$/.test(url)) {
        const none = q.get("att") === "none" || kind === "empty";
        return ok(config, kind === "empty"
            ? { date: "2083-06-18", students: { total: 0, present: 0, absent: 0 }, staff: { total: 0, present: 0, absent: 0 } }
            : { date: "2083-06-18", students: { total: 673, present: none ? 0 : 612, absent: none ? 673 : 61 }, staff: { total: 38, present: none ? 0 : 36, absent: none ? 38 : 2 } });
    }
    if (/upcoming_birthdays$/.test(url)) return ok(config, config.params?.count ? { count: /student/.test(url) && kind !== "empty" ? 3 : 0 } : { results: [] });
    if (/\/api\/sms$/.test(url)) return ok(config, kind === "empty" ? { available_credit: "API key not found!" } : { available_credit: 1182, total_sms_sent: 1074, as_of: Math.floor(Date.now() / 1000) - 120 });
    if (/rfid|devices/.test(url)) return ok(config, q.get("devices") ? [{ id: 1, name: "Main Gate", serial_number: "ZK-001", online: true, last_seen: new Date().toISOString() }, { id: 2, name: "Office", serial_number: "ZK-002", online: false, last_seen: null }] : []);
    return ok(config, []);
};

export default function DashboardPreview() {
    const { user: { user, setUser }, fiscalYear } = useAppContext();
    const { query, isReady } = useRouter();
    useEffect(() => {
        if (!isReady) return;
        if (Router.router) { Router.router.push = async () => true; Router.router.replace = async () => true; }
        const theme = `${query.theme || "classic"}`;
        if (theme === "classic") document.documentElement.removeAttribute("data-ui-theme");
        else document.documentElement.setAttribute("data-ui-theme", theme);
        fiscalYear.setYear({ economic_year: 5, economic_year_name: "EY2083/084", academic_year: 1, academic_year_name: "SCHOOL 2083", accounting_economic_year: 2, accounting_economic_year_name: "2083/084" });
        // no token: the app's own start-up (menus, fiscal years, classes) stays off
        setUser({
            role: "admin", username: "preview", today: "2083-06-18",
            profile: { id: 38, account: 46, name: query.long ? "Shree Tridev Adarsha English Boarding Secondary School and College" : "Tridev English Boarding School", location: "Tulsipur Sub-Metropolitan -7 Shreegain, Dang", contact: "082522764", telephone: query.long ? "9857822466" : "" },
        });
    }, [isReady]);
    if (!user) return null;
    return (
        <main className="h-screen w-full bg-main">
            <div className="app-shell flex h-screen w-full overflow-hidden">
                {/* the real rail (with no menu items), so its junction with the header is the real one */}
                <AppSidebar menus={[]} />
                <View type="admin" selectedMenu={`${query.menu || "dashboard"}`}>
                    <div id="dash"><SchoolSummary /></div>
                </View>
            </div>
        </main>
    );
}
