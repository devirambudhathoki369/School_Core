import { SearchInput } from "@/components/inputs";
import ClassPicker from "@/components/inputs/ClassPicker";
import EducationLevelInput from "@/components/inputs/EducationLevelInput";
import { Section, ButtonsSecion } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import { Button } from "@material-tailwind/react";
import { useState } from "react";

const classFormat = { education_level: '', year: '', semester: '', grade: '', section: '', class_teacher: '', course: '' };
function ManageTeachersForm() {
    const { user: { user } } = useAppContext();
    const [grade, setGrade] = useState(() => ({ ...classFormat, 'school': user?.profile?.school || user?.profile?.id }));
    // 
    function onChange({ name, value }) {
        setGrade(state => ({ ...state, [name]: value }));
    }
    function onBlur({ name, value }) { }
    // 
    return (
        <form>
            <Section title={"Teachers"} description={"Assign teachers to classes."}>
                <>
                    <ClassPicker data={grade} onChange={onChange} classwise={true} />
                    {/* <EducationLevelInput data={grade} value={grade?.education_level} detailed={true}
                        input={{ name: "education_level", label: 'Education Level' }}
                        onChange={onChange} onBlur={onBlur} /> */}
                </>
                <>
                    <SearchInput value={grade?.class_teacher} input={{
                        name: 'class_teacher', label: 'Class Teacher', options: []
                    }} onChange={onChange} onBlur={onBlur} />
                </>
            </Section>
            <ButtonsSecion>
                <div className="col-span-11"></div>
                <Button type="submit" variant="outlined">Save</Button>
            </ButtonsSecion>
        </form>
    )
}

export default function ManageTeachers() {
    return (
        <ManageTeachersForm />
    )
}