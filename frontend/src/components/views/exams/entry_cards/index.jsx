import { useAppContext } from "@/contexts/AppContext";
import { useState } from "react";
import { selectAction } from "@/components/tables/actions";
import EntryCardsView from "./EntryCardsView";
import extractYear from "@/methods/extractYear";
import ChooseClass from "@/components/inputs/ChooseClass";
import { searchStudents } from "@/services/functions/students";
import NotFound from "@/components/NotFound";
import { ButtonsSecion, Section } from "@/components/sections";
import { TextInput } from "@/components/inputs";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";

const filtersSchema = { balance_gt: null, balance_lt: null };
function EntryCards() {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    const [selectedClass, setSelectedClass] = useState(null);
    const [filters, setFilters] = useState({ ...filtersSchema });
    const [students, setStudents] = useState({});
    const { searching, statusHandler } = useRequestStatus();
    // 
    function onSelect(action, id, item) {
        setSelectedClass(item);
        resetFilters();
    }

    function onFiltersChange({ name, value }) {
        setFilters(state => {
            const ns = { ...state };
            ns[name] = value;
            return ns;
        });
    }

    function resetFilters() {
        setFilters({ ...filtersSchema });
    }

    function prepareSchoolDetailsForBill() {
        const billSchoolDetails = {};
        billSchoolDetails["id"] = user?.profile?.school || user?.profile?.id;
        billSchoolDetails["pan_no"] = user?.profile?.school_pan_no || user?.profile?.pan_no;
        billSchoolDetails["estd_date"] = (user?.profile?.school_estd_date || user?.profile?.estd_date || '')?.split('-')?.[0] || '';
        billSchoolDetails["schoolName"] = user?.profile?.school_name || user?.profile?.name;
        billSchoolDetails["address"] = user?.profile?.school_address || user?.profile?.address;
        billSchoolDetails["contact"] = user?.profile?.school_contact || user?.profile?.contact;
        billSchoolDetails["telephone"] = user?.profile?.school_telephone || user?.profile?.telephone;
        billSchoolDetails["email"] = user?.profile?.school_email || user?.profile?.email;
        billSchoolDetails["cashier"] = user?.profile?.signature || 'admin';
        billSchoolDetails["logo"] = user?.profile?.school_logo || user?.profile?.logo;
        billSchoolDetails["sign"] = user?.profile?.school_sign || user?.profile?.sign;
        billSchoolDetails["examCoordinatorSign"] = user?.profile?.school_exam_coordinator_sign || user?.profile?.exam_coordinator_sign;
        billSchoolDetails["year"] = extractYear(year?.academic_year_name);
        return billSchoolDetails;
    }
    const schoolProfile = prepareSchoolDetailsForBill();

    async function onSearchStudents(e) {
        e.preventDefault();
        if (selectedClass?.class_info?.id) {
            const hasBalanceGt = filters.balance_gt !== null && filters.balance_gt !== '' && !isNaN(Number(filters.balance_gt));
            const hasBalanceLt = filters.balance_lt !== null && filters.balance_lt !== '' && !isNaN(Number(filters.balance_lt));
            const include_balance = hasBalanceGt || hasBalanceLt ? true : false;
            // 
            (async () => {
                statusHandler.toggleSearching();
                const [, , _students] = await searchStudents({
                    school: user?.profile?.school || user?.profile?.id,
                    class_info: selectedClass.class_info.id,
                    include_images: true,
                    include_identities: true,
                    // 
                    include_balance,
                    balance_gt: filters.balance_gt,
                    balance_lt: filters.balance_lt,
                });
                if (_students?.length > 0) {
                    setStudents(state => ({ ...state, [selectedClass.class_info.id]: _students }))
                } else {
                    updateNotification(400, "Students not found!");
                }
                statusHandler.toggleSearching();
            })();
        }
    }
    // 
    return (
        <>
            <ChooseClass selectedClass={selectedClass} actions={[selectAction]} onSelect={onSelect}>
                <>
                    <form onSubmit={onSearchStudents}>
                        <Section title={"Extra search fields"}>
                            <TextInput input={{ name: 'balance_gt', label: "Balance (Greater than)" }} value={filters?.balance_gt} onChange={onFiltersChange} />
                            <TextInput input={{ name: 'balance_lt', label: "Balance (Less than)" }} value={filters?.balance_lt} onChange={onFiltersChange} />
                        </Section>
                        <ButtonsSecion>
                            <FormSaveButton isSearch={true} searching={searching} disabled={!selectedClass || searching} />
                        </ButtonsSecion>
                    </form>
                </>
                {students?.[selectedClass?.class_info?.id]?.length > 0 ?
                    <EntryCardsView selectedClass={selectedClass}
                        students={students[selectedClass.class_info.id] || []} schoolProfile={schoolProfile} /> :
                    <NotFound error="Students not found!" />
                }
            </ChooseClass >
        </>
    )
}

export default EntryCards;