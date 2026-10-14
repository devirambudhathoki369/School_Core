import { useAppContext } from "@/contexts/AppContext";
import { saveClass } from "@/services/functions/classes";
import { useState } from "react";
import { Button, Typography } from "@material-tailwind/react";
import ClassPicker from "@/components/inputs/ClassPicker";
import classPickerSchema from "@/schemas/class-picker";
import { ButtonsSecion, FilterSection } from "@/components/sections";
import cleanClassInfo from "@/methods/cleanClassInfo";
import { editAction } from "@/components/tables/actions";
import ClassDetails from "./ClassDetails";
import ChooseClass from "@/components/inputs/ChooseClass";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import { BookmarkIcon } from "@heroicons/react/24/outline";
import { SearchInput } from "@/components/inputs";
import genAcademicYearMappingKey, { prepareNameValue } from "@/methods/genAcademicYearMappingKey";

const academic_year_triggerers = ["education_level", "grade", "year", "semester"];
const newClassSchema = { ...classPickerSchema };
function ManageClasses() {
    const { user: { user },
        fiscalYear: { year, years, assignedAcademicYears },
        notification: { updateNotification } } = useAppContext();
    newClassSchema["school"] = user?.profile?.school || user?.profile?.id;
    newClassSchema["academic_year"] = year?.academic_year;
    const [newClass, setNewClass] = useState({ ...newClassSchema });
    const [selectedClass, setSelectedClass] = useState(null);
    const { uploading, statusHandler } = useRequestStatus();
    // 
    function onInputChange({ name, value }) {
        setNewClass(state => {
            const ns = { ...state };
            ns[name] = value;
            if (academic_year_triggerers.includes(name)) {
                const { name, value } = prepareNameValue(ns);
                const key = genAcademicYearMappingKey(name, value, ns);
                if (key) {
                    ns["academic_year"] = assignedAcademicYears?.[key]?.academic_year;
                }
            }
            return ns;
        });
    }
    function reset() {
        setNewClass({ ...newClassSchema });
    }
    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const [status, message,] = await saveClass(cleanClassInfo(newClass));
        updateNotification(status, message);
        if (status === 200) {
            reset();
        }
        statusHandler.toggleUploading();
    }
    function onSelect(action, id, item) {
        setSelectedClass(item);
    }
    // 
    return (
        <>
            <div className="my-3">
                <form onSubmit={onSave}>
                    <Typography variant="h5" className="my-2">Setup Class</Typography>
                    <span className="my-3 flex gap-x-3 text-base items-center font-semibold">
                        <BookmarkIcon className="icon" />
                        Setup class first then sections. (Eg: `class two`, then `class two a` and `class two b`).
                    </span>
                    {/* Deliberately NOT `classwise`: this form CREATES classes, so it must
                        offer every section the school has. Everywhere else the picker
                        filters a class that already exists, and passes classwise={true}
                        so it can only offer sections actually assigned to that class. */}
                    <ClassPicker data={newClass} onChange={onInputChange} handleAcademicYear={false} />
                    <FilterSection title={"Academic Year"}>
                        <SearchInput input={{ name: "academic_year", label: "Academic Year", options: years?.academicYears || [] }}
                            value={newClass?.academic_year} onChange={onInputChange} />
                    </FilterSection>
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={reset}>Reset</Button>
                        <FormSaveButton isUpdate={false} saving={uploading} disabled={!newClass?.academic_year} />
                    </ButtonsSecion>
                </form>
            </div>
            <Typography variant="h5" className="my-2">Manage Class/Periods</Typography>
            <ChooseClass selectedClass={selectedClass} actions={[editAction]} onSelect={onSelect}
                info={"Click on edit button to assign or edit periods, subjects or teachers for that class!"}>
                <ClassDetails selectedClass={selectedClass} />
            </ChooseClass>
        </>
    )
}

export default ManageClasses;