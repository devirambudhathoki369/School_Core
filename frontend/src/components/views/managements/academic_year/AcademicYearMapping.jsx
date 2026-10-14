import Warning from "@/components/Warning";
import { SearchInput } from "@/components/inputs";
import FilterItem from "@/components/inputs/FilterItem";
import { gradeOptions2, options, semesterOptions, yearOptions } from "@/components/inputs/options/education";
import { ButtonsSecion, FilterSection } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import { useState } from "react";
import { BookmarkIcon } from "@heroicons/react/24/outline";
import { saveAcademicYearMapping } from "@/services/functions/fiscalYear";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import BasicTable from "@/components/tables/BasicTable";
import { Button } from "@material-tailwind/react";
import genAcademicYearMappingKey, { prepareNameValue } from "@/methods/genAcademicYearMappingKey";
import useMappedAcademicYears from "@/hooks/useMappedAcademicYears";

const schema = { education_level: '', grade: '', academic_year: '' };
const ALLOWED_LEVELS = [1, 2, 3, 10, 4, 5, 8, 9];

function AcademicYearMapping() {
    const { user: { user },
        fiscalYear: { years, assignedAcademicYears, setAssignedAcademicYears },
        class: { coursesBackup, loadClasses },
        notification: { updateNotification } } = useAppContext();
    const [data, setData] = useState({ ...schema });
    const [allowSelectAcademicYear, setAllowSelectAcademicYear] = useState(false);
    const { uploading, statusHandler } = useRequestStatus();
    const { mappedAcademicYears, extractKey } = useMappedAcademicYears();

    function onChange({ name, value }) {
        let cleanUps = {};
        let key = null, id = '', academic_year = '';
        if (name === "education_level") {
            cleanUps = { grade: '', course: '', year: '', semester: '' };
        }
        key = genAcademicYearMappingKey(name, value, { ...data, [name]: value });
        if (key) {
            ({ id, academic_year } = assignedAcademicYears?.[key] || {}); // from db;
        }
        // id and academic_year must be at first, so can be overwritten!!!
        setData(state => {
            id = id || state?.id;
            const ns = { ...state, id, academic_year, [name]: value, ...cleanUps };
            shouldAllowSelectAcademicYear(ns);
            return ns;
        });
    }
    function shouldAllowSelectAcademicYear(state) {
        let canSelect = state?.education_level;
        if (state?.education_level === 3) canSelect = canSelect && state?.grade;
        else if ([4, 5, 8, 9].includes(state?.education_level)) {
            canSelect = canSelect && state?.course &&
                (state?.year || state?.semester);
        }
        setAllowSelectAcademicYear(!!canSelect);
    }
    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        let { academic_year, ...class_info } = data;
        if (academic_year && class_info?.education_level) {
            const { name, value } = prepareNameValue(class_info);
            let key = genAcademicYearMappingKey(name, value, class_info);
            if (key) {
                const uploadData = {
                    id: data?.id,
                    school: user?.profile?.school || user?.profile?.id,
                    key, academic_year,
                    classes_key_details: [extractKey(key)],
                };
                // console.log(uploadData);
                // statusHandler.toggleUploading();
                // return;
                const [status, msg, res] = await saveAcademicYearMapping(uploadData);
                updateNotification(status, msg);
                if (status === 200) {
                    setAssignedAcademicYears(state => ({ ...state, [key]: res?.year }));
                    await loadClasses(user, true);
                }
            }
        }
        statusHandler.toggleUploading();
    }
    function onReset() {
        setData({ ...schema });
    }
    // 
    return (
        <>
            <form onSubmit={onSave}>
                <span className="my-3 flex gap-x-3 text-base items-center font-semibold">
                    <BookmarkIcon className="icon" />
                    Academic years assigned to the faculties/grades are automatically switched in payment/student-search!
                </span>
                <Warning warning={"Enter details carefully without missing anything."} />
                <div className="mt-4">
                    <FilterSection title={"Choose education level"}>
                        {
                            options?.filter(e => ALLOWED_LEVELS.includes(e.value))?.map(option => (
                                <FilterItem onClick={onChange} label={option?.name} value={option?.value}
                                    name={'education_level'} selectedOption={data?.education_level} key={option?.value} />
                            ))
                        }
                    </FilterSection>
                    <>
                        {(data?.education_level && [3].includes(data.education_level)) &&
                            <FilterSection title={"Choose class"}>
                                {
                                    (data?.education_level === 3 ? gradeOptions2 : [])
                                        ?.map(option => (
                                            <FilterItem onClick={onChange} label={option?.name} value={option?.value}
                                                name={'grade'} selectedOption={data?.grade} key={option?.value} />
                                        ))
                                }
                            </FilterSection>
                        }
                    </>
                    <>
                        {(data?.education_level && [4, 5, 8, 9].includes(data.education_level)) &&
                            <>
                                <FilterSection title={"Choose course"}>
                                    <SearchInput value={data?.course} onChange={onChange}
                                        input={{
                                            name: 'course', label: '',
                                            options: coursesBackup?.[data.education_level] || []
                                        }} />
                                </FilterSection>
                                {(!data?.semester && data?.course) &&
                                    <FilterSection title={"Year"}>
                                        {
                                            yearOptions?.map(option => (
                                                <FilterItem onClick={onChange} label={option?.name} value={option?.value}
                                                    name={'year'} selectedOption={data?.year} key={option?.value} />
                                            ))
                                        }
                                    </FilterSection>
                                }
                                {(!data?.year && data?.course) &&
                                    <FilterSection title={"Semester"}>
                                        {
                                            semesterOptions.map(option => (
                                                <FilterItem onClick={onChange} label={option?.name} value={option?.value}
                                                    name={'semester'} selectedOption={data?.semester} key={option?.value} />
                                            ))
                                        }
                                    </FilterSection>
                                }
                            </>
                        }
                    </>
                    {allowSelectAcademicYear &&
                        <FilterSection title={"Choose Academic Year"}>
                            <SearchInput value={data?.academic_year} onChange={onChange}
                                input={{ name: 'academic_year', label: 'Academic Year', options: years?.academicYears || [] }} />
                        </FilterSection>
                    }
                </div>
                <ButtonsSecion>
                    <Button onClick={onReset} variant="outlined">Reset</Button>
                    <FormSaveButton isUpdate={data?.id} saving={uploading}
                        disabled={!data?.academic_year || !data?.education_level} />
                </ButtonsSecion>
            </form>
            <Warning warning={"Reload website after save!"} />
            {/*  */}
            <BasicTable columns={[['class', 'Level/Class'], ['academic_year_name', 'academic year']]} data={mappedAcademicYears} onSelect={() => null} showSelected={false} />
        </>
    )
}

export default AcademicYearMapping;