import { GRADE_POINTS, PERCENTAGE_LETTER_GRADING, GP_LETTER_GRADING } from "@/configs/letter_grading";
import { getRemarks } from "@/methods/exams/results";
import { useEffect, useState } from "react";

function GradingGuide({ remark_rules = [], resultType }) {
    const [gradingGuide, setGradingGuide] = useState([]);

    function prepareGradingGuide() {
        const _guides = [];
        const isLetterGrading = resultType === "gpa";
        const GRADINGS = resultType ? (isLetterGrading ? GP_LETTER_GRADING : PERCENTAGE_LETTER_GRADING) : [];
        GRADINGS.forEach((rule, index) => {
            const grade = rule.grading,
                point = isLetterGrading ? GRADE_POINTS?.[index].point : rule.max,
                remarks = getRemarks(point, remark_rules);
            _guides.push({
                grade, point, remarks
            })
        })
        return _guides;
    }

    useEffect(() => {
        setGradingGuide(prepareGradingGuide());
    }, [resultType]);
    return (
        <div className="w-full mx-auto">
            <div>
                <ol>
                    <li>ONE CREDIT HOUR EQUALS 32 HOURS</li>
                    <li>TH: THEORY(FINAL/EXTERNAL) IN: INTERNAL</li>
                </ol>
            </div>
            <div className="w-full mx-auto grid grid-cols-2 gap-x-2 items-start">
                <table className="result !w-full my-3 h-full">
                    <thead>
                        <tr>
                            <th>Grade</th>
                            {resultType === "gpa" ? <th>Grade <br /> point</th> : <th>Percentage</th>}
                            <th>Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        {
                            (gradingGuide || []).slice(0, 4).map((guide, gi) => (
                                <tr key={gi}>
                                    <td>{guide?.grade || ''}</td>
                                    <td>{guide?.point || ''}</td>
                                    <td className="capitalize">{guide?.remarks || ''}</td>
                                </tr>
                            ))
                        }
                    </tbody>
                </table>
                <table className="result !w-full my-3 h-full">
                    <thead>
                        <tr>
                            <th>Grade</th>
                            {resultType === "gpa" ? <th>Grade <br /> point</th> : <th>Percentage</th>}
                            <th className="capitalize">Remarks</th>
                        </tr>
                    </thead>
                    <tbody>
                        {
                            (gradingGuide || []).slice(4, 8).map((guide, gi) => (
                                <tr key={gi}>
                                    <td>{guide?.grade || ''}</td>
                                    <td>{guide?.point || 0}</td>
                                    <td className="capitalize">{guide?.remarks || ''}</td>
                                </tr>
                            ))
                        }
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default GradingGuide;