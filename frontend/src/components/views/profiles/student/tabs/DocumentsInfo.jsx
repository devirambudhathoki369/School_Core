import { Section } from "@/components/sections";
import ImageForm from "@/components/inputs/ImageForm";
import { useStudentProfile } from "@/contexts/StudentProfile";
import { useAppContext } from "@/contexts/AppContext";
import { removeStudentImage, updateStudent } from "@/services/functions/students";

function DocumentField({ name, label, src, schoolId, studentId, alt, onSaved }) {
    return (
        <div className="sm:col-span-4 flex flex-col items-center">
            <ImageForm
                name={name}
                what="document"
                label={label}
                src={src}
                defaultSrc={"/empty.png"}
                alt={alt || label}
                onSubmit={updateStudent}
                onDelete={() => removeStudentImage(studentId, schoolId, name)}
                onSaved={(path) => onSaved(name, path)}
                extraData={{ school: schoolId, id: studentId }}
                unoptimized={src ? true : false}
            />
        </div>
    );
}

function DocumentsInfoTab() {
    const { user: { user } } = useAppContext();
    const { data: { student }, images: { onImageSaved } } = useStudentProfile();
    const schoolId = user?.profile?.school || user?.profile?.id;
    const altBase = `${student?.first_name || ''} ${student?.last_name || ''}`.trim();

    return (
        <Section title={"Documents"} description={"All documents are optional. Add, edit or delete each one."}>
            <DocumentField
                name="birth_certificate"
                label="Birth Certificate"
                src={student?.birth_certificate}
                schoolId={schoolId}
                studentId={student?.id}
                onSaved={onImageSaved}
                alt={`${altBase} - Birth Certificate`}
            />
            <DocumentField
                name="nid"
                label="NID"
                src={student?.nid}
                schoolId={schoolId}
                studentId={student?.id}
                onSaved={onImageSaved}
                alt={`${altBase} - NID`}
            />
            <DocumentField
                name="citizenship_front"
                label="Citizenship (Front)"
                src={student?.citizenship_front}
                schoolId={schoolId}
                studentId={student?.id}
                onSaved={onImageSaved}
                alt={`${altBase} - Citizenship Front`}
            />
            <DocumentField
                name="citizenship_back"
                label="Citizenship (Back)"
                src={student?.citizenship_back}
                schoolId={schoolId}
                studentId={student?.id}
                onSaved={onImageSaved}
                alt={`${altBase} - Citizenship Back`}
            />
        </Section>
    );
}

export default DocumentsInfoTab;
