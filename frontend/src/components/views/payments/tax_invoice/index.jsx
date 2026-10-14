import { selectAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import { useState } from "react";
import TaxInvoicesView from "./TaxInvoicesView";
import ChooseClass from "@/components/inputs/ChooseClass";
import { searchStudents } from "@/services/functions/students";
import { OPTION_ALL } from "@/components/inputs";

function TaxInvoices() {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    const [selectedClass, setSelectedClass] = useState('');
    const [students, setStudents] = useState({});
    //
    async function onSelect(action, id, item) {
        setSelectedClass(item);
        const classId = item?.class_info?.id;
        if (!students?.[classId]) {
            const [status, msg, _students] = await searchStudents({
                school: schoolId,
                class_info: classId,
            });
            if (_students) {
                setStudents(state => ({
                    ...state,
                    [classId]: _students.reduce((acc, std) => {
                        acc.push({ name: std.name, value: std.id });
                        return acc;
                    }, [OPTION_ALL])
                }));
            } else {
                updateNotification(status, msg);
            }
        }
    }
    //
    function prepareSchoolDetailsForBill() {
        const billSchoolDetails = {};
        billSchoolDetails["id"] = schoolId;
        billSchoolDetails["pan_no"] = user?.profile?.school_pan_no || user?.profile?.pan_no;
        billSchoolDetails["estd_date"] = (user?.profile?.school_estd_date || user?.profile?.estd_date || '')?.split('-')?.[0] || '';
        billSchoolDetails["schoolName"] = user?.profile?.school_name || user?.profile?.name;
        billSchoolDetails["address"] = user?.profile?.school_address || user?.profile?.address;
        billSchoolDetails["contact"] = user?.profile?.school_contact || user?.profile?.contact;
        billSchoolDetails["telephone"] = user?.profile?.school_telephone || user?.profile?.telephone;
        billSchoolDetails["email"] = user?.profile?.school_email || user?.profile?.email;
        billSchoolDetails["cashier"] = user?.profile?.signature ||
            (user?.profile?.school && user?.profile?.name?.split(' ')?.shift()?.toLowerCase()) ||
            'admin';
        billSchoolDetails["logo"] = user?.profile?.school_logo || user?.profile?.logo;
        return billSchoolDetails;
    }
    const schoolProfile = prepareSchoolDetailsForBill();
    //
    return (
        <ChooseClass selectedClass={selectedClass} actions={[selectAction]} onSelect={onSelect}>
            <TaxInvoicesView selectedClass={selectedClass} schoolProfile={schoolProfile} academicYear={year?.academic_year}
                students={students?.[selectedClass?.class_info?.id]} />
        </ChooseClass>
    )
}

export default TaxInvoices;
