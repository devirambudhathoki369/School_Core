import { SearchInput } from "@/components/inputs";
import { Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import StaffProfileProvider, { useStaffProfile } from "@/contexts/StaffProfile";
import Loader from "@/components/Loader";
import { searchStaffs } from "@/services/functions/staffs";
import { useEffect, useState } from "react";
import StaffLedgerTab from "../../profiles/staff/tabs/StaffLedger";
import { payrollStaffName } from "@/configs/payroll";

// Payroll ▸ Staff ledger — one staff member's catch-up postings and their
// ledger / payment history. It used to be reachable only as a tab of the staff
// profile (Manage ▸ Users), away from every other payroll task. The posting
// form and history are the profile's own components, so both stay one code
// path; the salary rates it fills from are still edited in Finance Info.

// The posting form fills amounts from the SAVED Finance Info rates, so it waits
// for the staff record, as the profile does.
function LoadedStaffLedger() {
    const { data: { staffBackup } } = useStaffProfile();
    return staffBackup ? <StaffLedgerTab /> : <Loader />;
}

function StaffLedgerPage() {
    const { user: { user }, fiscalYear: { year } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    const [staffs, setStaffs] = useState([]);
    const [staffId, setStaffId] = useState('');

    useEffect(() => {
        if (!schoolId || !year?.economic_year) return;
        let stale = false;
        (async () => {
            const [, , data] = await searchStaffs({
                school: schoolId, designation: true, include_balance: true,
                economic_year: year.economic_year,
            });
            if (stale) return;
            setStaffs((data || []).map(staff => ({ ...staff, value: staff.id, name: payrollStaffName(staff) })));
        })();
        return () => { stale = true; };
    }, [schoolId, year?.economic_year]);

    return (
        <>
            <Section title={"Staff ledger"}
                description={"Post a payroll title the salary posting missed, and see the staff member's ledger."}>
                <SearchInput input={{ name: 'staff', label: 'Staff', options: staffs }} value={staffId}
                    onChange={({ value }) => setStaffId(value || '')}
                    tabular={true} columns={[['name'], ['designation'], ['balance']]} />
            </Section>
            {staffId &&
                <StaffProfileProvider key={staffId} staffId={staffId}>
                    <LoadedStaffLedger />
                </StaffProfileProvider>
            }
        </>
    )
}

export default StaffLedgerPage;
