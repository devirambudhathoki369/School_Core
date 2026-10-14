import CPlaceholder from "@/components/views/exams/character_certificate/CPlaceholder";

function SchoolBody({ editable, student, onChange }) {
    return (
        <>
            <p className="text-base leading-8">
                <span className="mr-10" />
                This is to certify that Mr./Mrs./Miss <CPlaceholder focused={editable ? true : false} editable={editable} size={100} name={"name"} value={student?.name || ""} onChange={onChange} className={"uppercase"} />, <br />
                son/daughter of Mr./Mrs. <CPlaceholder editable={editable} size={128} name={"guardian_name"} value={student?.guardian_name || ""} onChange={onChange} className={"uppercase"} />, <br />
                permanent resident of <CPlaceholder editable={editable} size={120} name={"address"} value={student?.address || ""} onChange={onChange} className={"uppercase"} />
                was the <br /> student of this school from <CPlaceholder editable={editable} size={35} name={"from_date"} value={student?.from_date || ""} onChange={onChange} /> B.S.
                to <CPlaceholder editable={editable} size={35} name={"to_date"} value={student?.to_date || ""} onChange={onChange} /> B.S.
                He/She passed the <br /> annual examination of class <CPlaceholder editable={editable} size={64} name={"class"} value={student?.class || ""} onChange={onChange} className={"uppercase"} />
                held in <CPlaceholder editable={editable} size={30} name={"exam_year"} value={student?.exam_year || ""} onChange={onChange} /> B.S. with <br />
                <CPlaceholder editable={editable} size={20} name={"result"} value={student?.result || ""} onChange={onChange} /> division/Grade Point Average (GPA). <br />
                His/Her date of birth is <CPlaceholder editable={editable} size={132} name={"birth_date"} value={student?.birth_date} onChange={onChange} /> <br />
                according to our school record.
                He/She bears a good moral character and his/her performance was <br /> <CPlaceholder editable={editable} size={75} name={"remarks"} value={student?.remarks || ""} onChange={onChange} />
                while at this school. <br />
                We wish him/her every success in his/her life.
            </p>
            <p className="text-base flex flex-col gap-y-4 mt-5">
                <span>Symbol No. :- <CPlaceholder editable={editable} size={40} name={"symbol_no"} value={student?.symbol_no || ""} onChange={onChange} /> </span>
                <span>Regd No. :- <CPlaceholder editable={editable} size={50} name={"regd_no"} value={student?.regd_no || ""} onChange={onChange} /> </span>
                <span>Date of Issue :- <CPlaceholder editable={editable} size={40} name={"issue_date"} value={student?.issue_date || ""} onChange={onChange} /> </span>
            </p>
        </>
    )
}

/**College/Campus Body */
function CollegeBody({ editable, student, onChange, institutionTypeName = 'college' }) {
    return (
        <>
            <p className="text-base leading-8">
                <span className="mr-10" />
                This is to certify that Mr./Mrs./Miss <CPlaceholder focused={editable ? true : false} editable={editable} size={100} name={"name"} value={student?.name || ""} onChange={onChange} className={"uppercase"} />, <br />
                son/daughter of Mr./Mrs. <CPlaceholder editable={editable} size={128} name={"guardian_name"} value={student?.guardian_name || ""} onChange={onChange} className={"uppercase"} />, <br />
                permanent resident of <CPlaceholder editable={editable} size={124} name={"address"} value={student?.address || ""} onChange={onChange} className={"uppercase"} />
                was a <br /> regular student of bachelor from <CPlaceholder editable={editable} size={37} name={"from_date"} value={student?.from_date || ""} onChange={onChange} /> B.S./A.D.
                to <CPlaceholder editable={editable} size={37} name={"to_date"} value={student?.to_date || ""} onChange={onChange} /> B.S./A.D. . <br />
                He/She passed/completed the <CPlaceholder editable={editable} size={112} name={"course"} value={student?.course} onChange={onChange} />
                level <br /> examination with specialization <CPlaceholder editable={editable} size={70} name={"specialization"} value={student?.specialization || ""} onChange={onChange} />
                in the year <CPlaceholder editable={editable} size={26} name={"exam_year"} value={student?.exam_year || ""} onChange={onChange} /> <br /> B.S./A.D.
                with <CPlaceholder editable={editable} size={32} name={"result"} value={student?.result || ""} onChange={onChange} />
                division/Grade Point Average (GPA). He/She bears a good moral <br /> character while in this {institutionTypeName}. <br />
                We wish him/her a successful career and a bright future.
            </p>
            <p className="text-base flex flex-col gap-y-4 mt-5">
                <span>Date of Birth :- <CPlaceholder editable={editable} size={90} name={"birth_date"} value={student?.birth_date || ""} onChange={onChange} /> </span>
                <span>{student?.uni_sf} Regd No. :- <CPlaceholder editable={editable} size={50} name={"regd_no"} value={student?.regd_no || ""} onChange={onChange} /> </span>
                <span>Date of Issue :- <CPlaceholder editable={editable} size={40} name={"issue_date"} value={student?.issue_date || ""} onChange={onChange} /> </span>
            </p>
        </>
    )
}

export { SchoolBody, CollegeBody };