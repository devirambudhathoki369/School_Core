import { useEffect, useState } from "react";
import {
    HomeModernIcon, UserGroupIcon, KeyIcon, WrenchScrewdriverIcon,
    UserPlusIcon, BanknotesIcon, ExclamationTriangleIcon, ClipboardDocumentCheckIcon,
} from "@heroicons/react/24/outline";

import { Section } from "@/components/sections";
import Loader from "@/components/Loader";
import { getHostelDashboard } from "@/services/functions/hostel";
import { HostelPicker, SetupNeeded, rs, useHostelScope } from "../common";

function Tile({ icon, label, value, sub, tone = "gray" }) {
    const tones = {
        gray: "border-gray-200 bg-white",
        green: "border-green-200 bg-green-50",
        amber: "border-amber-200 bg-amber-50",
        red: "border-rose-200 bg-rose-50",
        blue: "border-blue-200 bg-blue-50",
    };
    return (
        <div className={`rounded-lg border p-4 ${tones[tone]}`}>
            <div className="flex items-center gap-2 text-gray-500">
                {icon}
                <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
        </div>
    );
}

/**
 * THE HOSTEL AT A GLANCE.
 *
 * Every figure is computed on the server from the operational tables — the same
 * queries the reports use — so this screen can never quietly disagree with the
 * register it summarises. Nothing here is a stored counter.
 */
function HostelDashboard() {
    const { school, hostels, hostel, setHostel, options, loading } = useHostelScope();
    const [data, setData] = useState(null);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
        (async () => {
            if (!school) return;
            setFetching(true);
            setData(await getHostelDashboard(school, hostel));
            setFetching(false);
        })();
    }, [school, hostel]);

    if (loading || fetching) return <Loader />;
    if (hostels.length < 1) return <SetupNeeded what="hostels" where="Hostel > Hostel Setup" />;
    if (!data) return <SetupNeeded what="hostel data" where="Hostel > Hostel Setup" />;

    const roll = data.roll_call || {};
    const unmarked = Math.max((data.occupied || 0) - (roll.marked || 0), 0);

    return (
        <div className="flex flex-col gap-y-4">
            <HostelPicker options={[{ value: "", name: "All hostels" }, ...options]}
                value={hostel} onChange={setHostel} />

            <Section title="Occupancy" description={`As of ${data.date}.`}>
                <div className="sm:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Tile icon={<HomeModernIcon className="w-4 h-4" />} label="Rooms"
                        value={data.rooms} sub={`${data.capacity} bed(s) in total`} />
                    <Tile icon={<UserGroupIcon className="w-4 h-4" />} label="Residents"
                        value={data.occupied} sub={`${data.occupancy_pct}% full`} tone="blue" />
                    <Tile icon={<UserPlusIcon className="w-4 h-4" />} label="Vacant beds"
                        value={data.vacant} tone={data.vacant > 0 ? "green" : "amber"} />
                    <Tile icon={<BanknotesIcon className="w-4 h-4" />} label="Billed monthly"
                        value={`Rs. ${rs(data.monthly_billing)}`}
                        sub={`Rs. ${rs(data.deposits_held)} deposits held`} />
                </div>
            </Section>

            <Section title="Tonight" description="Roll call, who is away, and anyone unaccounted for.">
                <div className="sm:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Tile icon={<ClipboardDocumentCheckIcon className="w-4 h-4" />} label="Roll call"
                        value={`${roll.marked || 0} / ${data.occupied || 0}`}
                        sub={unmarked > 0 ? `${unmarked} not marked yet` : "everyone accounted for"}
                        tone={unmarked > 0 ? "amber" : "green"} />
                    <Tile icon={<UserGroupIcon className="w-4 h-4" />} label="Present"
                        value={roll.present || 0} sub={`${roll.absent || 0} absent · ${roll.late || 0} late`} />
                    <Tile icon={<KeyIcon className="w-4 h-4" />} label="On gate pass"
                        value={data.on_leave} tone="blue" />
                    <Tile icon={<ExclamationTriangleIcon className="w-4 h-4" />} label="Overdue returns"
                        value={data.overdue_returns}
                        sub={data.overdue_returns > 0 ? "past their return date" : "none"}
                        tone={data.overdue_returns > 0 ? "red" : "green"} />
                </div>
            </Section>

            <Section title="Today" description="The gate, and what needs fixing.">
                <div className="sm:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <Tile icon={<UserPlusIcon className="w-4 h-4" />} label="Visitors today"
                        value={data.visitors_today}
                        sub={`${data.visitors_inside} still inside`}
                        tone={data.visitors_inside > 0 ? "amber" : "gray"} />
                    <Tile icon={<WrenchScrewdriverIcon className="w-4 h-4" />} label="Open complaints"
                        value={data.complaints_open}
                        tone={data.complaints_open > 0 ? "amber" : "green"} />
                </div>
            </Section>
        </div>
    );
}

export default HostelDashboard;
