import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import ClassPicker from "@/components/inputs/ClassPicker";
import { ButtonsSecion, FilterSection } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import cleanClassInfo from "@/methods/cleanClassInfo";
import classPickerSchema from "@/schemas/class-picker";
import { searchStudents } from "@/services/functions/students";
import { Button } from "@material-tailwind/react";
import { useState } from "react";

const searchSchema = { ...classPickerSchema, balance_gt: '', balance_lt: '' };
function StudentsBalanceRange() {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    searchSchema['school'] = user?.profile?.school || user?.profile?.id;
    // academic_year read fresh at submit time (do not lock to first-mount value)
    const [data, setData] = useState({ ...searchSchema });
    const [students, setStudents] = useState([]);
    const { searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setData(state => ({ ...state, [name]: value }));
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const applyFilter = (data?.balance_gt || data?.balance_lt) ? true : '';
        const [status, msg, _students] = await searchStudents({
            ...cleanClassInfo(data),
            academic_year: data?.academic_year || year?.academic_year,
            include_balance: applyFilter,
            include_contact: applyFilter,
        });
        if (_students) {
            setStudents(_students);
        } else {
            updateNotification(status, msg);
        }
        statusHandler.toggleSearching();
    }

    function onReset() {
        setData({ ...searchSchema });
    }

    return (
        <>
            <form onSubmit={onSearch}>
                <ClassPicker data={data} onChange={onChange} classwise={true} />
                <FilterSection title={"Filter by balance"}>
                    <TextInput input={{ name: 'balance_lt', label: "Balance (Less than)" }} value={data?.balance_lt} onChange={onChange} />
                    <TextInput input={{ name: 'balance_gt', label: "Balance (Greater than)" }} value={data?.balance_gt} onChange={onChange} />
                </FilterSection>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
            <BasicTable name={"Students"} columns={[
                ['name'], ['balance'], ['guardian_contact', 'Guardian\'s contact']
            ]} data={students} loading={searching}
                header={<TableHeader data={data} />}
                showSelected={false} allowExport={true} print={true}
                onSelect={() => null} />
        </>
    )
}

function TableHeader({ data }) {
    return (
        <>
            <span className="font-semibold my-1">Student with balance between {data?.balance_lt || 0} and {data?.balance_gt || 0}</span>
        </>
    )
}

export default StudentsBalanceRange;