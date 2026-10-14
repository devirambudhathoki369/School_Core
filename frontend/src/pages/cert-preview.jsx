// LOCAL-ONLY harness (excluded via .git/info/exclude — never committed): the real certificate list + search.
import server from "@/services/server";
import Router, { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import View from "@/components/View";
import AppSidebar from "@/components/Sidebar";
import CharacterCertificateListView from "@/components/views/exams/character_certificate/list_view";

const row = (n, name, issue) => ({ serial_no: `${n}/EY2083/084`, name, guardian_name: "guardian " + n, address: "ghorahi 12 dang",
    birth_date: "2064-05-08", from_date: "2081", to_date: "2083", class: "s.l.c", exam_year: "2083", result: "2.87", remarks: "GOOD",
    symbol_no: "2560" + n, regd_no: "R" + n, issue_date: issue });
const RECENT = [row(27, "hasta pun", "2083-06-20"), row(26, "deba budha", "2083-06-19"), row(5, "jamuna basnet", "2082-02-26")];
const ok = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });
server.defaults.adapter = async (config) => {
    await new Promise((r) => setTimeout(r, 40));
    const url = config.url || "", method = (config.method || "get").toLowerCase();
    const body = typeof config.data === "string" ? JSON.parse(config.data) : (config.data || {});
    if (typeof window !== "undefined") (window.__calls = window.__calls || []).push({ method, url, body, params: config.params });
    if (/api\/search\/certificates$/.test(url)) {
        if (body.student_name === "boom") return Promise.reject(Object.assign(new Error("Request failed with status code 500"), { config, response: { status: 500, data: {}, config, headers: {} } }));
        const q = (body.student_name || "").toLowerCase();
        return ok(config, RECENT.filter(r => r.name.includes(q) && q !== "zzz"));
    }
    if (/api\/character_certificate$/.test(url)) return ok(config, { results: RECENT, next: "http://x/api/character_certificate?cursor=abc", previous: null });
    return ok(config, []);
};
export default function CertPreview() {
    const { user: { user, setUser }, fiscalYear } = useAppContext();
    const { isReady } = useRouter();
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (!isReady) return;
        if (Router.router) { Router.router.push = async () => true; Router.router.replace = async () => true; }
        fiscalYear.setYear({ economic_year: 5, economic_year_name: "EY2083/084", academic_year: 223, academic_year_name: "SCHOOL 2083" });
        setUser({ role: "admin", username: "preview", today: "2083-06-20", profile: { id: 53, account: 1, name: "Preview School", location: "Dang", contact: "9800000000" } });
        setReady(true);
    }, [isReady]);
    if (!user || !ready) return null;
    return (
        <main className="h-screen w-full bg-main"><div className="app-shell flex h-screen w-full overflow-hidden">
            <AppSidebar menus={[]} />
            <View type="admin" selectedMenu="exams.character-certificates"><CharacterCertificateListView /></View>
        </div></main>
    );
}
