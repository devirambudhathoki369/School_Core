import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SearchInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { calculateBSAge } from "@/methods/calculateBSAge";
import { __search } from "@/services/functions";
import { searchStudents } from "@/services/functions/students";
import { useState } from "react";
import { History_SearchListColumns } from "../table_columns";

const searchSchema = { school: '', academic_year: '', detailed: true, include_classname: true };
function NewAdmissionsReport() {
    const { user: { user },
        fiscalYear: { years, getNameFromAcademicYear },
        notification: { updateNotification } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    searchSchema["school"] = schoolId;
    // 
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [students, setStudents] = useState({});
    const { searching, statusHandler } = useRequestStatus();
    const [summary, setSummary] = useState({});

    function onChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }

    async function onStudentsSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        // 
        const [status, msg, _students] = await searchStudents(searchInput);
        if (_students) {
            let total_count = 0;
            setStudents(state => ({
                ...state,
                [searchInput.academic_year]: _students.reduce((acc, std) => {
                    acc.push({
                        ...std,
                        gender: std.gender === 1 ? 'male' : std.gender === 2 ? 'female' : 'others',
                        age: calculateBSAge(std.birth_date, user?.today),
                    });
                    total_count += 1;
                    return acc;
                }, [])
            }));
            setSummary(state => ({
                ...state,
                [searchInput.academic_year]: { total: total_count }
            }));
        } else {
            updateNotification(status, msg);
        }
        statusHandler.toggleSearching();
    }

    return (
        <>
            <form onSubmit={onStudentsSearch}>
                <Section>
                    <SearchInput value={searchInput?.academic_year} onChange={onChange}
                        input={{ name: 'academic_year', label: 'Running Academic Year', options: years?.academicYears || [] }} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>

            <>
                {
                    students?.[searchInput?.academic_year] ?
                        <>
                            <BasicTable name={"New admissions report "} data={students?.[searchInput.academic_year]}
                                columns={History_SearchListColumns} header={
                                    <div className="flex flex-col gap-y-1 font-semibold my-1">
                                        <span className="text-base">
                                            Academic Year : {getNameFromAcademicYear(searchInput?.academic_year)}
                                        </span>
                                        <span className="text-base">
                                            Total : {summary?.[searchInput?.academic_year]?.total}
                                        </span>
                                    </div>
                                }
                                onSelect={() => null}
                                showSelected={false} allowExport={true} print={true} loading={searching}
                            />
                        </> :
                        <NotFound />
                }
            </>
        </>
    )
}

export default NewAdmissionsReport;