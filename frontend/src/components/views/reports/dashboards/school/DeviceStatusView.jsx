import { fetchSchoolDevices } from "@/services/functions/rfid";
import { useEffect, useState } from "react";
import { CpuChipIcon, SignalIcon, SignalSlashIcon } from "@heroicons/react/24/outline";

// The backend calls a device online when it was heard from in the last 180s, so
// re-asking every minute keeps the dot honest without the page hammering the API.
const REFRESH_MS = 60000;

// A device the admin never named. Its alias is blank, so rather than print an
// empty line we say what it is — the serial is shown underneath either way.
// Named devices are shown EXACTLY as typed (project convention: no case
// transforms on names), so 'AMRITVIDHYA' stays 'AMRITVIDHYA'.
function deviceName(device) {
    const alias = (device?.alias || "").trim();
    if (alias) return alias;
    return device?.device_type === "acc"
        ? "Access Control Panel"
        : "Attendance Reader";
}

// "2 minutes ago" beats a raw timestamp for the one question this card answers:
// is it alive right now. Absolute time stays in the tooltip.
function lastSeenText(lastSeen) {
    if (!lastSeen) return "never connected";
    const then = new Date(lastSeen);
    if (Number.isNaN(then.getTime())) return "unknown";
    const mins = Math.floor((Date.now() - then.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs > 1 ? "s" : ""} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days > 1 ? "s" : ""} ago`;
}

function DeviceRow({ device }) {
    const online = Boolean(device?.online);
    const StatusIcon = online ? SignalIcon : SignalSlashIcon;
    return (
        <div className="app-subpanel flex items-center gap-3 rounded-lg bg-white/80 border border-teal-100 shadow-sm p-3">
            <div className={`shrink-0 rounded-lg p-2 ${online ? "bg-emerald-50" : "bg-rose-50"}`}>
                <CpuChipIcon className={`h-6 w-6 ${online ? "text-emerald-600" : "text-rose-500"}`} />
            </div>
            {/* min-w-0 lets a long alias ellipsise instead of pushing the pill out */}
            <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-gray-800 truncate"
                    title={deviceName(device)}>
                    {deviceName(device)}
                </span>
                <span className="text-[11px] text-gray-500 truncate"
                    title={device?.serial_number || ""}>
                    {device?.serial_number}
                </span>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1 shrink-0">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide
                    ${online
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-rose-100 text-rose-600"}`}>
                    <StatusIcon className="h-3.5 w-3.5" />
                    {online ? "Online" : "Offline"}
                </span>
                <span className="text-[11px] text-gray-500"
                    title={device?.last_seen || ""}>
                    {lastSeenText(device?.last_seen)}
                </span>
            </div>
        </div>
    );
}

/**
 * Attendance-device status for this school.
 *
 * Renders NOTHING when the school has no devices — most don't, and an empty
 * "no devices" panel on their dashboard is just a permanent question they
 * cannot act on. Same while the first fetch is in flight, so the dashboard
 * never flashes a card that is about to disappear.
 */
function DeviceStatusView({ school }) {
    const [devices, setDevices] = useState(null);

    useEffect(() => {
        if (!school) return;
        let active = true;
        const load = async () => {
            const rows = await fetchSchoolDevices(school);
            if (active) setDevices(rows);
        };
        load();
        const timer = setInterval(load, REFRESH_MS);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [school]);

    if (!devices?.length) return null;

    const onlineCount = devices.filter(d => d?.online).length;
    const allOnline = onlineCount === devices.length;

    return (
        <div className="app-panel rounded-xl bg-white border p-4">
            <div className="flex items-center gap-2 mb-3">
                <CpuChipIcon className="h-5 w-5 text-teal-600" />
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                    Attendance Devices
                </h3>
                <span className={`ml-auto text-[11px] font-semibold
                    ${allOnline ? "text-emerald-600" : "text-rose-500"}`}>
                    {onlineCount} of {devices.length} online
                </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {devices.map(device => (
                    <DeviceRow key={device?.id || device?.serial_number} device={device} />
                ))}
            </div>
        </div>
    );
}

export default DeviceStatusView;
