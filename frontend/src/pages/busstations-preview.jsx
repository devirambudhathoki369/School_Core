// LOCAL-ONLY harness (excluded via .git/info/exclude — never committed).
// The real Bus stations page in the real shell, against stand-in stations.
//   /busstations-preview?theme=classic|vivid|daylight|evergreen
import server from "@/services/server";
import Router, { useRouter } from "next/router";
import { useEffect } from "react";
import { useAppContext } from "@/contexts/AppContext";
import View from "@/components/View";
import AppSidebar from "@/components/Sidebar";
import BusStations from "@/components/views/managements/BusStations";

const ok = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });
server.defaults.adapter = async (config) => {
    await new Promise((r) => setTimeout(r, 120));
    if (/\/api\/stations$/.test(config.url || "")) return ok(config, ["CHAILAHI", "Gaurigaun", "Raikhaliyan", "Nayagaun", "Bapka"].map((station, i) => ({ id: i + 1, station, fee: [700, 700, 650, 650, 1500][i], latitude: null, longitude: null })));
    return ok(config, []);
};

export default function BusStationsPreview() {
    const { user: { user, setUser }, fiscalYear } = useAppContext();
    const { query, isReady } = useRouter();
    useEffect(() => {
        if (!isReady) return;
        if (Router.router) { Router.router.push = async () => true; Router.router.replace = async () => true; }
        const theme = `${query.theme || "classic"}`;
        if (theme === "classic") document.documentElement.removeAttribute("data-ui-theme");
        else document.documentElement.setAttribute("data-ui-theme", theme);
        fiscalYear.setYear({ economic_year: 5, economic_year_name: "EY2083/084", academic_year: 1, academic_year_name: "SCHOOL 2083", accounting_economic_year: 2, accounting_economic_year_name: "2083/084" });
        setUser({ role: "admin", username: "preview", today: "2083-06-18", profile: { id: 38, account: 46, name: "Divine Temple Academy", location: "Tulsipur-6, Golaura Dang", contact: "9857821588" } });
    }, [isReady]);
    if (!user) return null;
    return (
        <main className="h-screen w-full bg-main">
            <div className="app-shell flex h-screen w-full overflow-hidden">
                <AppSidebar menus={[]} />
                <View type="admin" selectedMenu="manage.bus-stations">
                    <BusStations />
                </View>
            </div>
        </main>
    );
}
