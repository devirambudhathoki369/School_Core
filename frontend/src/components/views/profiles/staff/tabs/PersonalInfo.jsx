import { SelectInput, TextInput } from "@/components/inputs";
import StaffRoleInput from "@/components/inputs/StaffRoleInput";
import STAFF_STATUS_OPTIONS from "@/components/inputs/options/staff_status";
import { Section } from "@/components/sections";
import { useStaffProfile } from "@/contexts/StaffProfile";
import ProfileButtons from "./ProfileButtons";
import ImageForm from "@/components/inputs/ImageForm";
import { removeStaffImage, saveStaff } from "@/services/functions/staffs";
import { useMemo } from "react";
import QRCode from 'react-qr-code';
import useDigitalIdCode from "@/hooks/digitalIdCode";

const domain = typeof window !== "undefined" ? window.location.origin : "";
const Role = 2;

function PersonalInfoTab({ tab }) {
    const { data: { staff, errors }, methods, images: { onImageSaved }, view: { isReadOnly } } = useStaffProfile();
    const readOnly = isReadOnly(tab.key);
    // 
    const qrCode = useDigitalIdCode(staff.school, staff.id, Role);
    const qrUrl = useMemo(() => {
        const roleParam = `&role=${encodeURIComponent(Role)}`;
        return `${domain}/profiles?org=${encodeURIComponent(staff.school)}&user=${encodeURIComponent(staff.id)}${roleParam}${qrCode}`;
    }, [staff.id, qrCode]);
    // 
    return (
        <>
            <Section title={"Personal Details"}>
                <div className="px-5 sm:col-span-12 flex justify-between items-start">
                    {/* <span className="col-span-8"></span> */}
                    <ImageForm name={"image"} what="photo" label={"Profile Image"} src={staff?.image}
                        alt={`${staff?.first_name} ${staff?.middle_name || ''} ${staff?.last_name}`}
                        onSubmit={saveStaff}
                        onDelete={() => removeStaffImage(staff?.id, staff?.school)}
                        onSaved={(path) => onImageSaved("image", path)}
                        extraData={{
                            school: staff?.school,
                            id: staff?.id
                        }} />
                    <span>
                        <QRCode className="" value={qrUrl} size={50} />
                        <a target="_blank" href={qrUrl}>Digital ID</a>
                    </span>
                </div>
                <>
                    <div className="sm:col-span-4"></div>
                    <StaffRoleInput input={{ name: 'role', label: 'Staff Role', readOnly, }}
                        value={staff?.role} {...methods} />
                    <SelectInput input={{ name: 'status', label: 'Staff status', readOnly, options: STAFF_STATUS_OPTIONS }}
                        value={staff?.status} {...methods} />
                </>
                <>
                    <TextInput value={staff?.first_name} error={errors?.first_name} input={{ label: "First Name", name: "first_name", readOnly, }} {...methods} />
                    <TextInput value={staff?.middle_name} error={errors?.middle_name} input={{ label: "Middle Name", name: "middle_name", readOnly, }} {...methods} />
                    <TextInput value={staff?.last_name} error={errors?.last_name} input={{ label: "Last Name", name: "last_name", readOnly, }} {...methods} />
                </>
                <>
                    <TextInput value={staff?.primary_contact} error={errors?.primary_contact} input={{ label: 'Primary Contact', name: 'primary_contact', readOnly, }} {...methods} />
                    <TextInput value={staff?.secondary_contact} error={errors?.secondary_contact} input={{ label: 'Secondary Contact', name: 'secondary_contact', readOnly, }} {...methods} />
                </>
                {/* <>
                    <SubjectInput input={{ name: 'primary_subject', label: 'Primary Subject', readOnly, }}
                        value={staff?.primary_subject} error={errors?.primary_subject} {...methods} />
                    <SubjectInput input={{ name: 'secondary_subject', label: 'Secondary Subject', readOnly, }}
                        value={staff?.secondary_subject} error={errors?.secondary_subject} {...methods} />
                </> */}
                <TextInput value={staff?.location} error={errors?.location} input={{ label: 'Location', name: 'location', readOnly }} {...methods} />
            </Section>
            <ProfileButtons tab={tab} />
        </>
    )
}

export default PersonalInfoTab;