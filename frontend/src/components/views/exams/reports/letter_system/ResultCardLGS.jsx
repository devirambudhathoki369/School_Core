import { Fragment } from "react";
import Signatures from "../Signatures";
import WaterMark from "../WaterMark";
import GradingGuide from "./GradingGuide";
import ReportHeader from "@/components/tables/ReportHeader";
import { Typography, Card } from "@material-tailwind/react";
import { useAppContext } from "@/contexts/AppContext";
import ResultCardStudentInfo from "../ResultCardStudentInfo";
import FailedStar from "../FailedStar";
import { useEffect, useState } from "react";
import { getDocumentStyle } from "@/services/functions/documentStyles";
import { documentStyleProps, documentShowsWatermark } from "@/methods/documentStyle";


// Two reports, one layout. The gradesheet keeps the wording it has always had;
// the progress report is the same document in the language a school sends home
// to a parent. Keeping them as one component means a fix to the table can never
// land on only one of them.
const REPORT_WORDING = {
    gradesheet: {
        title: "GRADE-SHEET",
        subjects: "SUBJECTS",
        obtained: "OBTAINED MARKS",
        totalGrade: ["TOTAL", "GRADE"],
        gradePoint: ["GRADE", "POINT"],
        finalGrade: "FINAL  GRADE",
        remarksColumn: "REMARKS",
        gpa: "Grade Point Average (G.P.A)",
        attendance: "Attendance",
        remarksLine: "Remarks",
        extraActivities: "Extra Activities",
        extraRemarks: "Remarks",
    },
    progress: {
        title: "PROGRESS REPORT",
        subjects: "SUBJECT / COURSE",
        obtained: "ASSESSMENT",
        totalGrade: ["OVERALL", "GRADE"],
        gradePoint: ["GRADE", "POINT"],
        finalGrade: "FINAL GRADE",
        remarksColumn: "TEACHER'S COMMENT",
        gpa: "Overall Grade Point Average (GPA)",
        attendance: "Attendance Record",
        remarksLine: "Class Teacher's Remarks",
        extraActivities: "Co-curricular Activities",
        extraRemarks: "Observation",
        // A progress report is addressed to a parent, so it reports on the
        // child rather than certifying a mark. "IN THE" is dropped: the school
        // writes the assessment's name itself and phrases it as it wants read.
        intro: "THE ACADEMIC PROGRESS OF",
        examLeadIn: "",
        closing: "IS PRESENTED BELOW.",
    },
};

// A progress report presents the term as internal-evaluation activities rather
// than naming the exam, with the terminal's number in Roman: First Terminal ->
// (I), Second -> (II), Third -> (III), Fourth/Final -> (IV). Detected from the
// exam's own name; when the term can't be read, the phrase stands without a
// numeral rather than falling back to the raw exam name.
const TERMINAL_ROMAN = [
    [/\b(first|1st)\b/i, "I"],
    [/\b(second|2nd)\b/i, "II"],
    [/\b(third|3rd)\b/i, "III"],
    [/\b(fourth|4th|final)\b/i, "IV"],
];
function internalExamLabel(examName) {
    const hit = TERMINAL_ROMAN.find(([re]) => re.test(examName || ""));
    return `ACTIVITIES BASED ON INTERNAL EVALUATION${hit ? ` (${hit[1]})` : ""}`;
}

function ResultCardLGS({ student, result, summary, remarks, profileImage, issueDate, filters, isHigherSecondaryResult, showSubjectCodes, variant = "gradesheet" }) {
    const { user: { user } } = useAppContext();
    const L = REPORT_WORDING[variant] || REPORT_WORDING.gradesheet;
    // The superadmin's styling for this school, if any is switched on for THIS
    // document. Absent or not switched on, the sheet renders exactly as before.
    const schoolId = user?.profile?.school || user?.profile?.id;
    const [docStyle, setDocStyle] = useState(null);
    useEffect(() => {
        let alive = true;
        (async () => {
            const style = await getDocumentStyle(schoolId);
            if (alive) setDocStyle(style);
        })();
        return () => { alive = false; };
    }, [schoolId]);
    const documentKey = variant === "progress" ? "progress_report" : "gradesheet_lgs";
    const themed = documentStyleProps(docStyle, documentKey);
    return (
        <>
            {isHigherSecondaryResult !== null &&
                <div className={`text-black flex flex-col w-[80%] print:w-screen mx-auto bg-white border-2 border-black border-solid print:h-screen print-border relative overflow-hidden ${themed.className}`}
                    style={themed.style}
                    onContextMenu={(e) => { e.preventDefault() }}>
                    <div className="">
                        <ReportHeader hidden={false} documentKey={documentKey} title={L.title} />
                        <Card className="shadow-none text-center">
                            {/* When the sheet is styled the masthead already
                                renders the title (positioned per the layout), so
                                the document must not print it a second time. */}
                            {!themed.className &&
                                <Typography color="black" variant="h3">{L.title}</Typography>}
                            <div className="text-black font-semibold mt-2 px-10">
                                <ResultCardStudentInfo reportType={"GRADE"} student={student} profileImage={profileImage} filters={filters}
                                    intro={L.intro} examLeadIn={L.examLeadIn ?? "IN THE"} closing={L.closing || "ARE GIVEN BELOW."}
                                    examName={variant === "progress" ? internalExamLabel(student?.examName) : undefined} />
                                <div className="py-2">
                                    {isHigherSecondaryResult ?
                                        <table className="result">
                                            <thead>
                                                <tr>
                                                    <th rowSpan={2}>S.N</th>
                                                    {showSubjectCodes && <th>CODE</th>}
                                                    <th rowSpan={2} className="w-[21.2rem] max-w-[21.2rem]">{L.subjects}</th>
                                                    <th>CREDIT <br /> HOURS</th>
                                                    <th>{L.gradePoint[0]} <br /> {L.gradePoint[1]}</th>
                                                    <th>GRADE</th>
                                                    <th>{L.finalGrade}</th>
                                                    <th>{L.remarksColumn}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {
                                                    result?.map((res, ri) => (
                                                        <Fragment key={ri}>
                                                            <tr>
                                                                <td>{2 * ri + 1}</td>
                                                                {showSubjectCodes && <td>{res?.code}</td>}
                                                                <td className="capitalize text-[1.1rem] text-left font-semibold">{res?.subject || ''}</td>
                                                                <td>{res?.credit_hours || ''}</td>
                                                                <td>{res?.gp_th || res?.gp || 0}</td>
                                                                <td>{res?.grade || res?.theory || ''}</td>
                                                                <td rowSpan={2}>{res?.total || ''}</td>
                                                                <td>{res?.isFail ? <FailedStar /> : ''}</td>
                                                            </tr>
                                                            <>
                                                                {res?.practical_subject ?
                                                                    <tr>
                                                                        <td>{2 * ri + 2}</td>
                                                                        {showSubjectCodes && <td>{res?.practical_subject?.code_pr}</td>}
                                                                        <td className="capitalize text-[1.1rem] text-left font-semibold">{res?.practical_subject?.subject || ''}</td>
                                                                        <td>{res?.practical_subject?.credit_hours || ''}</td>
                                                                        <td>{res?.practical_subject?.gp_pr || 0}</td>
                                                                        <td>{res?.practical_subject?.grade || ''}</td>
                                                                        <td>{res?.practical_subject?.isFail ? <FailedStar /> : ''}</td>
                                                                    </tr> :
                                                                    <tr></tr>
                                                                }
                                                            </>
                                                        </Fragment>
                                                    ))
                                                }
                                                <tr>
                                                    <td colSpan={showSubjectCodes ? 3 : 2} rowSpan={3} className="capitalize text-left">{L.remarksLine} : {summary?.remarks || ''}</td>
                                                    <td colSpan={4}>{L.gpa}</td>
                                                    <td colSpan={2}>{summary?.gpa || ''}</td>
                                                </tr>
                                                <tr>
                                                    <td colSpan={4}>{L.attendance}</td>
                                                    <td colSpan={2}>{summary?.attendance || ''}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        :
                                        <table className="result">
                                            <thead>
                                                <tr>
                                                    <th rowSpan={2}>S.N</th>
                                                    {showSubjectCodes && <th rowSpan={2}>CODE</th>}
                                                    <th rowSpan={2} className="w-[19rem] max-w-[19rem]">{L.subjects}</th>
                                                    <th rowSpan={2}>CREDIT <br /> HOURS</th>
                                                    <th colSpan={2}>{L.obtained}</th>
                                                    <th rowSpan={2}>{L.totalGrade[0]} <br /> {L.totalGrade[1]}</th>
                                                    <th rowSpan={2}>{L.gradePoint[0]} <br /> {L.gradePoint[1]}</th>
                                                    <th rowSpan={2}>{L.remarksColumn}</th>
                                                </tr>
                                                <tr>
                                                    <th>TH.</th>
                                                    <th>{filters?.practical}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {
                                                    result?.map((res, ri) => (
                                                        <tr key={ri}>
                                                            <td>{ri + 1}</td>
                                                            {showSubjectCodes && <td>{res?.code}</td>}
                                                            <td className="capitalize text-[1.1rem] text-left font-semibold">{res?.subject || ''}</td>
                                                            <td>{res?.credit_hours || ''}</td>
                                                            <td>{res?.theory || ''}</td>
                                                            <td>{res?.practical || ''}</td>
                                                            <td>{res?.total || ''}</td>
                                                            <td>{res?.gp || 0}</td>
                                                            <td></td>
                                                        </tr>
                                                    ))
                                                }
                                                <tr>
                                                    <td colSpan={showSubjectCodes ? 3 : 2} rowSpan={3} className="capitalize text-left">{L.remarksLine} : {summary?.remarks || ''}</td>
                                                    <td colSpan={4}>{L.gpa}</td>
                                                    <td colSpan={2}>{summary?.gpa || ''}</td>
                                                </tr>
                                                <tr>
                                                    <td colSpan={4}>{L.attendance}</td>
                                                    <td colSpan={2}>{summary?.attendance || ''}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    }
                                    {
                                        summary?.extra_activities?.length > 0 &&
                                        <table className="w-full result my-3">
                                            <thead>
                                                <th>{L.extraActivities}</th>
                                                <th>{L.extraRemarks}</th>
                                            </thead>
                                            <tbody>
                                                {
                                                    summary.extra_activities.map((ea, ai) => (
                                                        <tr key={ai}>
                                                            <td className="capitalize">{ea.name}</td>
                                                            <td>{ea.data}</td>
                                                        </tr>
                                                    ))
                                                }
                                            </tbody>
                                        </table>
                                    }
                                    <div className="w-[95%] mx-auto mt-2">
                                        <GradingGuide remark_rules={remarks} resultType={"gpa"} />
                                    </div>
                                    <Signatures schoolProfile={user?.profile || {}} issueDate={issueDate} />
                                </div>
                            </div>
                        </Card >
                    </div>
                    {documentShowsWatermark(docStyle, documentKey) &&
                        <WaterMark name={user?.profile?.school_name || user?.profile?.name} />}
                </div >
            }
        </>
    )
}

export default ResultCardLGS;