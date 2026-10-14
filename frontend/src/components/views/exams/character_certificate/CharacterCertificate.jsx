import ReportHeader from "@/components/tables/ReportHeader";
import { Typography } from "@material-tailwind/react";
import Image from "next/image";
import Signature from "../reports/Signature";
import WaterMark from "../reports/WaterMark";
import { SchoolBody, CollegeBody } from "@/components/views/exams/character_certificate/bodies";
import { InstitutionType, InstitutionTypeObject, SchoolChiefMap, SchoolChiefs, notSchool } from "@/components/views/exams/character_certificate/constants";
import useDocumentStyle from "@/hooks/documentStyle";

function chiefToString(chief) {
    return SchoolChiefMap?.[chief] || SchoolChiefs.Principal.name;
}

function CharacterCertificate({ schoolName, student, editable, onChange, profileImage }) {
    // Presentation only — never touches what is printed.
    const docStyle = useDocumentStyle("character_certificate");
    const institutionType = student?.institution_type || (!student?.university ? InstitutionType.SCHOOL : InstitutionType.COLLEGE);
    const isNotSchool = student?.institution_type ? notSchool(student.institution_type) : student?.university,
        institutionTypeName = InstitutionTypeObject?.[institutionType] || '',
        headDesignation = isNotSchool
            ? `${institutionTypeName} chief`
            : chiefToString(student?.chief || SchoolChiefs.Principal.value);
    const headerOptions = isNotSchool
        ? { hideSlogan: true, hideContacts: true } : {};

    return (
        <div className={`certificate w-max p-5 mx-auto flex flex-col bg-white border-2 border-black border-solid print-border relative overflow-hidden ${docStyle.className}`}
            style={docStyle.css}>
            <ReportHeader hidden={false} parentWidth={525} maxFontSize={27.32}
                options={headerOptions} affiliate={isNotSchool ? student?.university : null} />
            <div className="m-0 mx-[4rem] z-10">
                <div className="my-5 relative">
                    <Typography variant="h5" color="blue" className="absolute -top-10 left-0">
                        Serial No. :- {student?.serial_no || ""}
                    </Typography>
                    <Typography variant="h4" className="text-center underline text-blue-600 mt-[3rem]">
                        TRANSFER & CHARACTER CERTIFICATE
                    </Typography>
                    <>
                        {
                            (profileImage || student?.image) ?
                                <Image unoptimized className="z-20 absolute border border-gray-400 bottom-7 -right-5" src={profileImage?.src ||
                                    (process.env.NEXT_PUBLIC_BASE_URL + '/media/' + student.image)}
                                    alt={student.name} width={100} height={100} quality={100} /> :
                                <div className="z-20 absolute bottom-7 -right-5 border border-gray-400 h-[100px] w-[100px] rounded-sm"></div>
                        }
                    </>
                </div>
                <div className="body !text-justify">
                    <>
                        {isNotSchool ?
                            <CollegeBody editable={editable} student={student} onChange={onChange} institutionTypeName={institutionTypeName} /> :
                            <SchoolBody editable={editable} student={student} onChange={onChange} />
                        }
                    </>
                    <div className="flex justify-between mt-[5rem] mb-[1rem]">
                        <Signature user={"Prepared by :"} />
                        <Signature user={"Verified by :"} />
                        <Signature user={`${headDesignation} :`} />
                    </div>
                </div>
            </div>
            {docStyle.showWatermark && <WaterMark name={schoolName} />}
        </div>
    )
}

export default CharacterCertificate;