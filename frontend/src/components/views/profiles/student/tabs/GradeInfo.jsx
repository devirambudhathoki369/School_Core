import EducationLevelInput from "@/components/inputs/EducationLevelInput";
import { Section } from "@/components/sections";
import { useStudentProfile } from "@/contexts/StudentProfile";
import ProfileButtons from "./ProfileButtons";
import Checkbox from "@/components/inputs/Checkbox";
import { InformationCircleIcon } from "@heroicons/react/24/outline";

function GradeInfoTab({ tab }) {
    const { data: { student },
        methods: { onChange }, view: { isReadOnly } } = useStudentProfile();
    const readOnly = isReadOnly(tab.key);
    // Ticked by default: unless it has been explicitly cleared, results follow.
    const carryResults = student?.section_change_only !== false;
    return (
        <>
            <Section title={"Class Details"}>
                <>
                    <EducationLevelInput data={student} detailed={true} input={{
                        name: 'education_level', label: 'Education Level', readOnly
                    }} value={student?.education_level} onChange={onChange} />
                </>
            </Section>
            {!readOnly &&
                <div className="mt-2 flex flex-col gap-2 rounded-lg border border-blue-gray-100 bg-blue-gray-50/60 p-3">
                    <div className="flex items-start gap-2">
                        <InformationCircleIcon className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                        <p className="text-[0.8rem] text-blue-gray-600">{classChangeNote}</p>
                    </div>
                    <Checkbox name="section_change_only" text="Carry exam results to the new class/section"
                        checked={carryResults}
                        onClick={() => onChange({ name: "section_change_only", value: !carryResults })} />
                </div>}
            <ProfileButtons tab={tab} />
        </>
    )
}

const classChangeNote = `A section change (same class) is detected automatically and
    the results follow. Keep the box ticked to carry this student's exam results to the
    new class/section, or clear it to leave them with the old class.`;

export default GradeInfoTab;
