import showOnlyClass from "@/methods/showOnlyClass";
import Image from "next/image";

// `intro`/`examLeadIn`/`closing`/`examName` let a document phrase this line for
// itself. Left out, it reads exactly as it always has, so the number-system
// marksheets that share this block are untouched.
function ResultCardStudentInfo({ reportType, student, profileImage, filters = {},
    intro, examLeadIn = "IN THE", closing = "ARE GIVEN BELOW.", examName }) {
    return (
        <div className="w-full flex py-2 justify-between items-center gap-x-[3rem]">
            <div className="p-5 text-justify uppercase">
                {intro || `THE ${reportType} SECURED BY`}
                <span className="font-bold text-lg mx-3 underline">{student?.name}</span>
                {filters?.birth_date &&
                    <>DATE OF BIRTH
                        <span className="font-bold text-lg mx-3 underline">
                            {student?.birth_date} B.S. {student?.english_birth_date} A.D.
                        </span>
                    </>}
                {filters?.roll_no &&
                    <>ROLL NO.
                        <span className="font-bold text-lg mx-3 underline">
                            {filters?.autofill_roll_no ?
                                student?.custom_roll_no : student?.roll_no || ''
                            }
                        </span>
                    </>}
                {filters?.symbol_no &&
                    <>SYMBOL NO.
                        <span className="font-bold text-lg mx-3 underline">{student?.symbol_no}</span>
                    </>}
                {filters?.regd_no &&
                    <>REGISTRATION NO.
                        <span className="font-bold text-lg mx-3 underline">{student?.regd_no}</span>
                    </>}
                OF CLASS
                <span className="font-bold text-lg mx-3 underline">{showOnlyClass(student?.className) || ''}</span>
                {examLeadIn}
                <span className="font-bold text-lg mx-3 underline">{examName ?? student?.examName}</span>
                HELD IN
                <span className="font-bold text-lg mx-3 underline">{student?.year}</span>
                {closing}
            </div>
            {
                (profileImage || student?.image) &&
                <div className="z-20">
                    <Image className="w-[200px]" unoptimized src={profileImage?.src ||
                        (process.env.NEXT_PUBLIC_BASE_URL + '/media/' + student.image)}
                        alt={student.name} width={100} height={100} quality={100} priority={true} />
                </div>
            }
        </div>
    )
}

export default ResultCardStudentInfo;