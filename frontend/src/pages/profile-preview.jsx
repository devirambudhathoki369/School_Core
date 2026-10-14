// LOCAL-ONLY harness (excluded via .git/info/exclude — never committed): the pictures on the school,
// student and staff profiles.   /profile-preview?page=school|student|staff&case=ok|fail
import server from "@/services/server";
import Router, { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import View from "@/components/View";
import AppSidebar from "@/components/Sidebar";
import SchoolProfile from "@/components/views/profiles/school";
import StudentProfileProvider from "@/contexts/StudentProfile";
import StudentProfile from "@/components/views/profiles/student";
import StaffProfileProvider from "@/contexts/StaffProfile";
import StaffProfile from "@/components/views/profiles/staff";

// A student and a staff record as the API returns them, identity blanked.
const DATA = {"student": {"id": 70725, "middle_name": "", "email": null, "contact": "9800000000", "guardian_info": {"id": 76033, "guardian_name": null, "guardian_email": null, "father_occupation": null, "mother_occupation": null, "grandfather_occupation": null, "guardian_location": null, "father_name": null, "mother_name": null, "guardian_contact": null}, "class_info": {"id": 2478, "grade": 4, "faculty": null, "course": null, "section": 333, "year": null, "semester": null, "academic_year": 261, "batch": null, "created_at": "2026-08-03", "updated_at": "2026-08-03T06:51:13.447076Z", "is_active": true, "education_level": 2, "name": null, "school": 75}, "other_info": null, "roll_no": "15", "symbol_no": null, "regd_no": null, "emis": null, "image": null, "birth_certificate": null, "nid": null, "citizenship_front": null, "citizenship_back": null, "academic_year": "AcademicYear object (261)", "previous_school": null, "remarks": null, "updated_at": "2026-09-23T08:40:03.315039Z", "is_active": true, "first_name": "preview", "last_name": "student", "birth_date": "2070-01-01", "gender": 2, "location": "Preview-1, Dang", "status": 1, "rfid_card": null, "batch": null}, "titles": [{"id": 9123, "fee": 1700.0, "title__id": 968, "title__title": "Annual Fee", "title__months": [1]}, {"id": 9125, "fee": 1700.0, "title__id": 969, "title__title": "Monthly Fee", "title__months": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]}, {"id": 9124, "fee": 400.0, "title__id": 970, "title__title": "Internal Evaluation Fee", "title__months": [3, 6, 9, 12]}, {"id": 9192, "fee": 0.0, "title__id": 973, "title__title": "Tie", "title__months": []}, {"id": 9193, "fee": 0.0, "title__id": 974, "title__title": "Belt", "title__months": []}, {"id": 9164, "fee": 0.0, "title__id": 977, "title__title": "Uniform", "title__months": []}, {"id": 9219, "fee": 0.0, "title__id": 978, "title__title": "ID Card", "title__months": []}], "ids": {"student": 70725, "school": 75, "class": 2478, "academic_year": 261}, "staff": {"id": 2663, "middle_name": "", "secondary_contact": null, "image": null, "other_info": {"id": 2668, "ethnicity": null, "sport": null, "blood_group": null, "email": null, "qualification": null, "experience": null, "joined_date": null, "citizenship_no": null, "pan_no": null, "basic_salary": null, "funds": null, "grade": null, "allowance": null, "extra": null, "insurance": null, "pf_contrib": null, "birth_date": null, "gender": 1, "father_name": null, "mother_name": null, "marrital_status": 1}, "username": null, "account_id": 2413, "created_at": null, "updated_at": null, "is_active": true, "status": 1, "first_name": "preview", "last_name": "staff", "primary_contact": null, "location": "Preview-1, Dang", "rfid_card": null, "permissions": [], "role": 1, "primary_subject": null, "secondary_subject": null, "school": 75, "contact": "9800000000"}};

// Pictures the preview server itself can serve, standing in for the media host.
const origin = typeof window === "undefined" ? "" : window.location.origin;
const SAVED = () => `${origin}/student-profile.png`;
const UPLOADED = () => `${origin}/empty.png?uploaded=1`;
const ok = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });
const bad = (config, message) => Promise.reject(Object.assign(new Error("Request failed with status code 400"), {
    config, response: { status: 400, data: { message }, config, headers: {} } }));

function install(which) {
    window.__calls = [];
    server.defaults.adapter = async (config) => {
        await new Promise((r) => setTimeout(r, 120));
        const url = config.url || "", method = (config.method || "get").toLowerCase();
        const isForm = typeof FormData !== "undefined" && config.data instanceof FormData;
        const body = isForm ? Object.fromEntries([...config.data.entries()].map(([k, v]) => [k, v instanceof File ? `FILE:${v.name}` : v]))
            : (typeof config.data === "string" ? JSON.parse(config.data) : (config.data || {}));
        window.__calls.push({ method, url, body, form: isForm, params: config.params });
        if (method === "put" && /api\/(schools|students|staffs)$/.test(url)) {
            if (which === "fail") return bad(config, "The server refused this picture.");
            if (body.remove) return ok(config, { message: "Image deleted!", removed: [body.remove] });
            const field = Object.keys(body).find((k) => `${body[k]}`.startsWith("FILE:"));
            if (field) return ok(config, { message: "Saved!", image: UPLOADED(), images: { [field]: UPLOADED() } });
            return ok(config, { message: "Updated!" });
        }
        if (/api\/students$/.test(url) && method === "get") return ok(config, { ...DATA.student, image: SAVED(), citizenship_front: SAVED() });
        if (/api\/staffs$/.test(url) && method === "get") return ok(config, { ...DATA.staff, image: SAVED() });
        if (/api\/fees\/titles$/.test(url)) return ok(config, DATA.titles);
        return ok(config, []);
    };
}

export default function ProfilePreview() {
    const { user: { user, setUser }, fiscalYear } = useAppContext();
    const { query, isReady } = useRouter();
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (!isReady) return;
        if (Router.router) { Router.router.push = async () => true; Router.router.replace = async () => true; }
        const theme = `${query.theme || "classic"}`;
        if (theme === "classic") document.documentElement.removeAttribute("data-ui-theme");
        else document.documentElement.setAttribute("data-ui-theme", theme);
        install(`${query.case || "ok"}`);
        fiscalYear.setYear({ economic_year: 5, economic_year_name: "EY2083/084", academic_year: DATA.ids.academic_year, academic_year_name: "SCHOOL 2083" });
        setUser({ role: "admin", username: "preview", today: "2083-06-20", profile: {
            id: DATA.ids.school, account: 1, name: "Preview School", address: "Ghorahi, Dang", location: "Dang", contact: "9800000000",
            email: "school@example.com", pan_no: "600000000", estd_date: "2050-01-01", renew_date: "2084-01-01", preferences: {},
            logo: SAVED(), award_logo: SAVED(), sign: "", exam_coordinator_sign: SAVED() } });
        setReady(true);
    }, [isReady]);
    if (!user || !ready) return null;
    const page = `${query.page || "school"}`;
    return (
        <main className="h-screen w-full bg-main">
            <div className="app-shell flex h-screen w-full overflow-hidden">
                <AppSidebar menus={[]} />
                <View type="admin" selectedMenu="profile">
                    {page === "school" && <SchoolProfile />}
                    {page === "student" &&
                        <StudentProfileProvider studentId={DATA.ids.student}><StudentProfile /></StudentProfileProvider>}
                    {page === "staff" &&
                        <StaffProfileProvider staffId={DATA.staff.id}><StaffProfile /></StaffProfileProvider>}
                </View>
            </div>
        </main>
    );
}
