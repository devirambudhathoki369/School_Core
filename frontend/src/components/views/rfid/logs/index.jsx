import { Tab, TabPanel, Tabs, TabsBody, TabsHeader } from "@material-tailwind/react";
import Loader from "@/components/Loader";
import { PaginationSection } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { RFID_ATTD_LOGS_PATH, ROLES } from "@/components/views/rfid/constants";
import { useAppContext } from "@/contexts/AppContext";
import { getCursor, getURL } from "@/methods/pagination";
import { __fetch } from "@/services/functions";
import { useEffect, useState } from "react";

function RFIDAttendanceLogsView({ role, is_active = false }) {
    const { user: { user } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [data, setData] = useState([]);
    const [page, setPage] = useState(1);
    const ITEMS_PER_PAGE = 20;

    async function getData() {
        const nextURL = getURL(data, page - 1, 'next');
        if (!nextURL && getURL(data, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        const cursor = getCursor(nextURL);
        const res = await __fetch(RFID_ATTD_LOGS_PATH, { school: schoolId, role, page, cursor });
        setData(state => ({ ...state, [page]: res }));
    }

    useEffect(() => {
        (async () => {
            if (is_active && !data?.[page]) await getData();
        })();
    }, [page, is_active]);

    const rows = (data?.[page]?.['results'] || []).map(row => ({
        ...row,
        punch_time: formatPunchTime(row.punch_time),
    }));

    return (
        <>
            {data?.[page]?.['results'] ?
                <>
                    <BasicTable name={''}
                        columns={COLS}
                        data={rows}
                        onSelect={() => null} showSelected={false} page={page} itemsPerPage={ITEMS_PER_PAGE} />
                    <PaginationSection page={page} setPage={setPage}
                        nextPage={getURL(data, page, 'next')} />
                </>
                :
                <Loader />
            }
        </>
    )
}

const COLS = [
    ['user_name', "Name"],
    ['status_label', "Status"],
    ['punch_time', "Punch Time"],
];

// punch_time is stored/served as a UTC instant; show it in Nepal local time.
function formatPunchTime(value) {
    if (!value) return value;
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return value;
    return dt.toLocaleString('en-GB', {
        timeZone: 'Asia/Kathmandu',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true,
    });
}

// MAIN COMPONENT
const tabs = {
    student: { label: 'Student Attendance Logs', key: 'student-attd-logs' },
    staff: { label: 'Staff Attendance Logs', key: 'staff-attd-logs' },
}
export default function main() {
    const [currentTab, setCurrentTab] = useState(tabs.student.key);

    return (
        <>
            <div className={`p-3 px-0 rounded-md !m-0 w-[99%] shadow-default`}>
                <Tabs value={tabs.student.key}>
                    <TabsHeader className="border-b-2 border-blue-gray-50 p-0 bg-transparent"
                        indicatorProps={{
                            className: "bg-transparent border-b-2 border-gray-900 shadow-none rounded-none",
                        }}>
                        <Tab className="bg-table-header font-semibold" value={tabs.student.key} onClick={() => {
                            setCurrentTab(tabs.student.key);
                        }}>{tabs.student.label}</Tab>
                        <Tab className="bg-table-header font-semibold" value={tabs.staff.key} onClick={() => {
                            setCurrentTab(tabs.staff.key);
                        }}>{tabs.staff.label}</Tab>
                    </TabsHeader>
                    <TabsBody animate={{
                        initial: { y: 250 },
                        mount: { y: 0 },
                        unmount: { y: 250 },
                    }}>
                        <div>
                            <TabPanel value={tabs.student.key}>
                                <RFIDAttendanceLogsView role={ROLES.STUDENT} is_active={currentTab === tabs.student.key} />
                            </TabPanel>
                            <TabPanel value={tabs.staff.key}>
                                <RFIDAttendanceLogsView role={ROLES.STAFF} is_active={currentTab === tabs.staff.key} />
                            </TabPanel>
                        </div>
                    </TabsBody>
                </Tabs>
            </div>
        </>
    )
}