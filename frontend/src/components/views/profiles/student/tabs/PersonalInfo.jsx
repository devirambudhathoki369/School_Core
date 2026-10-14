import { SelectInput, TextInput } from "@/components/inputs";
import GenderInput from "@/components/inputs/GenderInput";
import { Section } from "@/components/sections";
import { useStudentProfile } from "@/contexts/StudentProfile";
import ProfileButtons from "./ProfileButtons";
import ImageForm from "@/components/inputs/ImageForm";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";
import { removeStudentImage, updateStudent } from "@/services/functions/students";
import { useAppContext } from "@/contexts/AppContext";

function PersonalInfoTab({ tab }) {
    const { user: { user } } = useAppContext();
    const { data: { student }, methods: { onChange }, images: { onImageSaved }, view: { isReadOnly } } = useStudentProfile();
    const readOnly = isReadOnly(tab.key);
    // 
    return (
        <>
            <Section title={"Personal Details"}>
                <>
                    {/* The Digital ID QR that used to sit here — a bare 50px
                        code with an unstyled blue link under it — is on the
                        identity card at the top of the page now, bigger and in
                        the one place that is about identity. Two QR codes for the
                        same URL, one screen apart, taught nobody anything. What
                        stays is the photo, because this is where it is CHANGED. */}
                    <div className="sm:col-span-12">
                        <ImageForm name={"image"} what="photo" label={"Profile"} src={student?.image}
                            defaultSrc={"/student-profile.png"}
                            alt={`${student?.first_name} ${student?.middle_name || ''} ${student?.last_name}`}
                            onSubmit={updateStudent}
                            onDelete={() => removeStudentImage(student?.id,
                                user?.profile?.school || user?.profile?.id, "image")}
                            onSaved={(path) => onImageSaved("image", path)}
                            extraData={{
                                school: user?.profile?.school || user?.profile?.id,
                                id: student?.id,
                            }} unoptimized={student?.image ? true : false} />
                    </div>
                    <>
                        <SelectInput value={student?.status} input={{ name: 'status', label: "Status", options: STUDENT_STATUS_OPTIONS, readOnly }}
                            onChange={onChange} />
                        <TextInput input={{ name: 'emis', label: 'EMIS', type: 'number', readOnly }} value={student?.emis} onChange={onChange} />
                        <TextInput input={{ name: 'previous_school', label: 'Previous School', readOnly }}
                            value={student?.previous_school} onChange={onChange} />
                    </>
                </>
                <>
                    <TextInput value={student?.first_name} onChange={onChange} input={{
                        name: 'first_name', readOnly, label: 'First Name'
                    }} />
                    <TextInput value={student?.middle_name || ''} onChange={onChange}
                        input={{
                            name: 'middle_name', readOnly, label: 'Middle Name'
                        }} />
                    <TextInput value={student?.last_name} onChange={onChange} input={{
                        name: 'last_name', readOnly, label: 'Last Name'
                    }} />
                </>
                <>
                    <GenderInput input={{ readOnly }} value={student?.gender} onChange={onChange} />
                    <TextInput value={student?.birth_date} onChange={onChange} input={{
                        name: 'birth_date', readOnly, label: 'Birth Date'
                    }} />
                    <TextInput value={student?.contact} onChange={onChange} input={{
                        name: 'contact', readOnly, label: 'Contact'
                    }} />
                </>
                <>
                    <TextInput value={student?.email} onChange={onChange} input={{
                        name: 'email', readOnly, label: 'Email Address', type: 'email'
                    }} />
                    <TextInput value={student?.location} onChange={onChange} input={{
                        name: 'location', readOnly, label: 'Location'
                    }} />
                </>
            </Section>
            <ProfileButtons tab={tab} />
        </>
    )
}

export default PersonalInfoTab;