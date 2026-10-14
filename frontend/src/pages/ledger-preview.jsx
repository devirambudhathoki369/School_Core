// LOCAL-ONLY harness (excluded via .git/info/exclude — never committed).
// The real student profile, Ledger tab, against responses captured from the
// local backend.  /ledger-preview?case=real|partial|none|busonly|late|slow|fail|failall
import server from "@/services/server";
import Router, { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import View from "@/components/View";
import AppSidebar from "@/components/Sidebar";
import StudentProfileProvider from "@/contexts/StudentProfile";
import StudentProfile from "@/components/views/profiles/student";       

// One real class's fee table, posted months, bus and discount rows as the API returns them;
// the student's identity fields are blanked.
const DATA = {"student": {"id": 70725, "middle_name": "", "email": null, "contact": "9800000000", "guardian_info": {"id": 76033, "guardian_name": null, "guardian_email": null, "father_occupation": null, "mother_occupation": null, "grandfather_occupation": null, "guardian_location": null, "father_name": null, "mother_name": null, "guardian_contact": null}, "class_info": {"id": 2478, "grade": 4, "faculty": null, "course": null, "section": 333, "year": null, "semester": null, "academic_year": 261, "batch": null, "created_at": "2026-08-03", "updated_at": "2026-08-03T06:51:13.447076Z", "is_active": true, "education_level": 2, "name": null, "school": 75}, "other_info": null, "roll_no": "15", "symbol_no": null, "regd_no": null, "emis": null, "image": null, "birth_certificate": null, "nid": null, "citizenship_front": null, "citizenship_back": null, "academic_year": "AcademicYear object (261)", "previous_school": null, "remarks": null, "updated_at": "2026-09-23T08:40:03.315039Z", "is_active": true, "first_name": "preview", "last_name": "student", "birth_date": "2070-01-01", "gender": 2, "location": "Preview-1, Dang", "status": 1, "rfid_card": null, "batch": null}, "titles": [{"id": 9123, "fee": 1700.0, "title__id": 968, "title__title": "Annual Fee", "title__months": [1]}, {"id": 9125, "fee": 1700.0, "title__id": 969, "title__title": "Monthly Fee", "title__months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}, {"id": 9124, "fee": 400.0, "title__id": 970, "title__title": "Internal Evaluation Fee", "title__months": [3, 6, 9, 12]}, {"id": 9192, "fee": 0.0, "title__id": 973, "title__title": "Tie", "title__months": []}, {"id": 9193, "fee": 0.0, "title__id": 974, "title__title": "Belt", "title__months": []}, {"id": 9164, "fee": 0.0, "title__id": 977, "title__title": "Uniform", "title__months": []}, {"id": 9219, "fee": 0.0, "title__id": 978, "title__title": "ID Card", "title__months": []}], "posted": [{"id": 94351, "date": "2083-05-09", "months": [4, 5, 6], "taken": true}], "tsp_fee": [{"id": 25432, "bus_station__fee": 350.0}], "tsp_rows": [{"id": 25432, "bus_station": 1311, "start_date": "2083-01-03", "is_active": true}], "discounts": [{"id": 22115, "student": 70725, "title": 969, "discount": 1700.0, "percentage": 100.0, "remarks": null, "academic_year": 261, "old_discount": 1700.0}, {"id": 22116, "student": 70725, "title": "tn", "discount": 350.0, "percentage": 100.0, "remarks": null, "academic_year": 261, "old_discount": 350.0}], "ids": {"student": 70725, "school": 75, "class": 2478, "academic_year": 261}};

const ok = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });
const fail = (config) => Promise.reject(Object.assign(new Error("500"), {
    config, response: { status: 500, data: { message: "Server error" }, config, headers: {} } }));
const MONTHLY = 969;
let discountCalls = 0;

function install(which) {
    if (typeof window !== "undefined") { window.__calls = []; window.__posted = []; }
    discountCalls = 0;
    server.defaults.adapter = async (config) => {
        await new Promise((r) => setTimeout(r, 40));
        const url = config.url || "", p = config.params || {}, method = (config.method || "get").toLowerCase();
        window.__calls.push(`${method} ${url} ${JSON.stringify(p)}`);
        if (/api\/students\/transportations$/.test(url)) {
            if (which === "none") return ok(config, []);
            if (p.as_title) return ok(config, DATA.tsp_fee);
            return ok(config, which === "late"
                ? DATA.tsp_rows.map(r => ({ ...r, start_date: "2083-05-10" })) : DATA.tsp_rows);
        }
        if (/api\/students\/discounts$/.test(url)) {
            discountCalls += 1;
            if (which === "slow") await new Promise((r) => setTimeout(r, 2500));
            if (which === "failall" || (which === "fail" && discountCalls === 1)) return fail(config);
            if (which === "none" || which === "busonly" || which === "late") return ok(config, []);
            if (which === "partial") return ok(config, [
                // 10% of the monthly fee, and a flat 50 off the bus fare
                { ...DATA.discounts[0], title: MONTHLY, percentage: 10.0, discount: 170.0, old_discount: 170.0 },
                { ...DATA.discounts[1], title: "tn", percentage: null, discount: 50.0, old_discount: 50.0 },
            ]);
            return ok(config, DATA.discounts);
        }
        if (/api\/students$/.test(url) && method === "get") return ok(config, DATA.student);
        if (/api\/fees\/titles$/.test(url)) return ok(config, DATA.titles);
        if (/api\/ledgers$/.test(url) && method === "get" && p.posted_months) return ok(config, DATA.posted);
        if (/api\/ledgers$/.test(url) && method === "post") {
            window.__posted.push(typeof config.data === "string" ? JSON.parse(config.data) : config.data);
            return ok(config, { message: "Ledger posted!" });
        }
        return ok(config, []);
    };
}

export default function LedgerPreview() {
    const { user: { user, setUser }, fiscalYear } = useAppContext();
    const { query, isReady } = useRouter();
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (!isReady) return;
        if (Router.router) { Router.router.push = async () => true; Router.router.replace = async () => true; }
        const theme = `${query.theme || "classic"}`;
        if (theme === "classic") document.documentElement.removeAttribute("data-ui-theme");
        else document.documentElement.setAttribute("data-ui-theme", theme);
        install(`${query.case || "real"}`);
        fiscalYear.setYear({ economic_year: 5, economic_year_name: "EY2083/084", academic_year: DATA.ids.academic_year, academic_year_name: "SCHOOL 2083" });
        setUser({ role: "admin", username: "preview", today: "2083-06-20", profile: { id: DATA.ids.school, account: 1, name: "Preview School", location: "Dang", contact: "9800000000" } });
        setReady(true);
    }, [isReady]);
    if (!user || !ready) return null;
    return (
        <main className="h-screen w-full bg-main">
            <div className="app-shell flex h-screen w-full overflow-hidden">
                <AppSidebar menus={[]} />
                <View type="admin" selectedMenu="payments.student">
                    <StudentProfileProvider studentId={DATA.ids.student}>
                        <StudentProfile />
                    </StudentProfileProvider>
                </View>
            </div>
        </main>
    );
}
