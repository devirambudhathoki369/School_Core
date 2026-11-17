import EducationLevelInput from "@/components/inputs/EducationLevelInput";
import { Section } from "@/components/sections";
import { useEnrollmentContext } from "@/contexts/EnrollmentContext";

function GradeInformationSection() {
    const { student, errors, methods } = useEnrollmentContext();
    return (
        <>
            <Section aside title={"Class"} description={"Where the student starts. Their fees follow from it."}>
                <>
                    {/* school-level */}
                    <EducationLevelInput data={student} detailed={true} input={{
                        name: 'education_level', label: 'Education Level'
                    }} errors={errors} value={student?.education_level} {...methods} />
                    {/* </Section> */}
                    <div className="sm:col-span-full"></div>
                </>
            </Section>
        </>
    )
}

export default GradeInformationSection;