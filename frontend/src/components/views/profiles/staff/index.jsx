import { useState } from "react";
import { Tab, TabPanel, Tabs, TabsBody, TabsHeader } from "@material-tailwind/react";
import Loader from "@/components/Loader";
import { useStaffProfile } from "@/contexts/StaffProfile";
import PersonalInfoTab from "./tabs/PersonalInfo";
import OtherInfoTab from "./tabs/OtherInfo";
import PermissionsTab from "./tabs/Permissions";
import FinanceInfoTab from "./tabs/FinanceInfo";
import StaffAccountTab from "./tabs/AccountInfo";
import ProfileAttendance from "../attendance";

const tabs = {
    personal: { label: 'Personal Info', key: 'staff-personal-info', db_key: null },
    finance: { label: 'Finance Info', key: 'staff-finance-info', db_key: 'other_info' },
    other: { label: 'Other Info', key: 'staff-other-info', db_key: 'other_info' },
    permissions: { label: 'Staff Permissions', key: 'staff-permissions', db_key: null },
    account: { label: 'Account', key: 'staff-account', db_key: null },
    attendance: { label: 'Attendance', key: 'staff-attendance', db_key: null },
}

function TabHead({ tab, onOpen }) {
    // Below 720px a tab keeps the width of its own label and the strip scrolls
    // sideways. Six labels squeezed into a phone's width overflow the tab box,
    // and focusing one then slid the whole profile out from under the screen.
    return (<Tab className="bg-table-header font-semibold w-auto shrink-0 whitespace-nowrap px-3 md:w-full md:shrink md:px-2" value={tab.key} onClick={() => {
        onOpen(tab.key);
    }}>{tab.label}</Tab>)
}

function StaffProfile() {
    const { data: { staff, staffId, staffBackup }, view: { setCurrentTab } } = useStaffProfile();
    // Every panel of these tabs is mounted from the start, shown or not. The
    // attendance loads its own record, so it is held back until its tab is
    // first opened: opening a profile should not fetch a year nobody asked for.
    const [attendanceOpened, setAttendanceOpened] = useState(false);
    function onTabOpen(tab) {
        setCurrentTab(tab);
        if (tab === tabs.attendance.key) setAttendanceOpened(true);
    }
    // 
    return (
        <>
            {staff ?
                <>
                    <div className={`p-3 px-0 rounded-md !m-0 w-[99%] shadow-default`}>
                        <Tabs value='staff-personal-info'>
                            <TabsHeader className="border-b-2 border-blue-gray-50 p-0 bg-transparent overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                                indicatorProps={{
                                    className: "bg-transparent border-b-2 border-gray-900 shadow-none rounded-none",
                                }}>
                                <TabHead tab={tabs.personal} onOpen={onTabOpen} />
                                <TabHead tab={tabs.other} onOpen={onTabOpen} />
                                <TabHead tab={tabs.finance} onOpen={onTabOpen} />
                                <TabHead tab={tabs.account} onOpen={onTabOpen} />
                                <TabHead tab={tabs.permissions} onOpen={onTabOpen} />
                                <TabHead tab={tabs.attendance} onOpen={onTabOpen} />
                            </TabsHeader>
                            <TabsBody animate={{
                                initial: { y: 250 },
                                mount: { y: 0 },
                                unmount: { y: 250 },
                            }}>
                                <div>
                                    <TabPanel value={tabs.personal.key}>
                                        <PersonalInfoTab tab={tabs.personal} />
                                    </TabPanel>
                                    <TabPanel value={tabs.other.key}>
                                        <OtherInfoTab tab={tabs.other} />
                                    </TabPanel>
                                    <TabPanel value={tabs.finance.key}>
                                        <FinanceInfoTab tab={tabs.finance} />
                                    </TabPanel>
                                    <TabPanel value={tabs.account.key}>
                                        <StaffAccountTab tab={tabs.account} />
                                    </TabPanel>
                                    <TabPanel value={tabs.permissions.key}>
                                        <PermissionsTab tab={tabs.permissions} />
                                    </TabPanel>
                                    <TabPanel value={tabs.attendance.key}>
                                        {attendanceOpened && (
                                            <ProfileAttendance kind="staff" personId={staffBackup?.ids?.sid || staffId} />
                                        )}
                                    </TabPanel>
                                </div>
                            </TabsBody>
                        </Tabs>
                    </div>
                </>
                :
                <Loader />
            }
        </>
    )
}

export default StaffProfile;
export { tabs };