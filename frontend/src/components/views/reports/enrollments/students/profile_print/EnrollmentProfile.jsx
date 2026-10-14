import ReportHeader from "@/components/tables/ReportHeader";
import { formatImagePath } from "@/methods/formatMediaPath";

const GenderMap = { 1: "Male", 2: "Female", 3: "Other" };
const valueStyles = "uppercase";

function EnrollmentProfile({ student }) {
    const studentInfo = [
        { label: "Enrollment Date", value: student.date },
        { label: "Full Name", value: student.name, valueStyles },
        { label: "Gender", value: GenderMap[student.gender] },
        { label: "Birth Date", value: student.birth_date },
        { label: "Blood Group", value: student.blood_group },
        { label: "Contact", value: student.contact },
        { label: "Location", value: student.location, valueStyles },
        { label: "Email", value: student.email },
    ], academicInfo = [
        { label: "Class", value: student.classname, valueStyles },
        { label: "Previous School", value: student.previous_school },
    ], familyInfo = [
        { label: "Father's Name", value: student.father_name, valueStyles },
        { label: "Mother's Name", value: student.mother_name, valueStyles },
        { label: "Guardian's Name", value: student.guardian_name, valueStyles },
        { label: "Guardian Contact", value: student.guardian_contact },
        { label: "Guardian Location", value: student.guardian_location, valueStyles },
    ];

    return (
        <div className="min-h-screen p-4 print:bg-white print:py-0 print:px-0">
            <div className="max-w-5xl mx-auto bg-white shadow-xl rounded-2xl border border-blue-200 overflow-hidden print:shadow-none print:border-none print:rounded-none">
                <ReportHeader hidden={false} />

                <div className="p-8 print:p-4">
                    <div className="flex flex-col items-center mb-12">
                        <div className="w-32 h-32 rounded-full border border-sky-400 bg-gray-100 shadow-md print:shadow-none overflow-hidden">
                            <img
                                src={student?.image ? formatImagePath(student.image) : "/student-profile.png"}
                                alt="Student"
                                className="w-full h-full object-cover"
                            />
                        </div>
                    </div>

                    <Section title="Student Information" data={studentInfo} />
                    <Section title="Academic Information" data={academicInfo} />
                    <Section title="Family Details" data={familyInfo} />
                </div>
            </div>
        </div>
    );
}

const InfoRow = ({ label, value, labelStyles = '', valueStyles = '' }) => (
    <div className="text-gray-800 print:break-inside-avoid">
        <div className={`text-sm font-medium text-gray-600 uppercase tracking-wide mb-0.5 ${labelStyles}`}>
            {label}
        </div>
        <div className={`text-base font-semibold text-teal-800 mb-2 ${valueStyles}`}>
            {value || "N/A"}
        </div>
    </div>
);

const Section = ({ title, data }) => (
    <div className="my-10 print:my-6">
        <h3 className="text-xl font-semibold text-sky-700 mb-6 border-b pb-2 border-sky-200">
            {title}
        </h3>
        <div className="grid grid-cols-2 gap-x-10 gap-y-4">
            {data.map(({ label, value, labelStyles, valueStyles }, idx) => (
                <InfoRow key={idx} label={label} value={value} labelStyles={labelStyles} valueStyles={valueStyles} />
            ))}
        </div>
    </div>
);

export default EnrollmentProfile;