import safeDecimal from "@/methods/safeDecimal";

const finalResultId = "x111",
    finalResultExam = { id: finalResultId };
const subjectResultFields = ["theory", "practical", "total"],
    subjectCriteriaFields = ["fm", "pm", "fm_th", "pm_th", "fm_pr", "pm_pr"];

class CommonResultPrep {
    constructor() { }

    static generateRollNumbers(students = []) {
        return (students || []).reduce((acc, std, index) => {
            acc[std?.value || std?.id] = index + 1;// id is in default[], value is in select options[];
            return acc;
        }, {});
    }

    static withInclusion(data, inclusion) {
        return Object.entries(data)
            .reduce((acc, [subjectId, subjectResult]) => {
                for (let field of subjectResultFields) {
                    const val = subjectResult?.[field];
                    if (Number.isFinite(val)) {
                        subjectResult[field] = this.calculateWithInclusion(val, inclusion);
                    }
                }
                acc[subjectId] = subjectResult;
                return acc;
            }, {});
    }
    static calculateWithInclusion(obtainedMarks, inclusion) {
        return safeDecimal((inclusion / 100) * obtainedMarks);
    }

    static calculateFinalCriteria(criteria, examIds) {
        // class ledger!
        return examIds.reduce((acc, examId) => {
            for (let field of subjectCriteriaFields) {
                acc[field] = parseFloat(acc[field]) || 0;
                acc[field] += parseFloat(criteria?.[examId]?.[field]) || 0;
                acc[field] = safeDecimal(acc[field]);
            }
            return acc;
        }, {});
    }

    static calculateFinalResult(studentResults, examIds) {
        // SUMS UP!!!
        return examIds.reduce((acc, examId) => {
            const examResult = studentResults[examId];
            Object.entries(examResult)
                .map(([subjectId, subjectResult]) => {
                    if (!isNaN(subjectId)) {
                        acc[subjectId] = acc?.[subjectId] || {};
                        for (let field of subjectResultFields) {
                            acc[subjectId][field] = acc?.[subjectId]?.[field] || 0;
                            acc[subjectId][field] += parseFloat(subjectResult?.[field] || 0) || 0;
                            acc[subjectId][field] = safeDecimal(acc[subjectId][field]);
                        }
                        /* IT DOESN'T MATTER IF SOMEONE WAS FAIL/ABSENT IN ANY EXAMS! */
                        acc[subjectId]["absent"] = false;
                        acc[subjectId]["result"] = true;
                        // Update "absent"
                        // if (subjectResult?.hasOwnProperty('absent')) {
                        //     acc[subjectId]["absent"] = subjectResult["absent"];
                        // } else if (!acc[subjectId].hasOwnProperty('absent')) {
                        //     acc[subjectId]["absent"] = false; // Default value if not already set
                        // }
                        // Update "result"
                        // if (subjectResult?.hasOwnProperty('result')) {
                        //     acc[subjectId]["result"] = subjectResult["result"];
                        // } else if (!acc[subjectId].hasOwnProperty('result')) {
                        //     acc[subjectId]["result"] = true; // Default value if not already set
                        // }
                    }
                });
            return acc;
        }, {});
    }

    static hasFailed(studentResult) {
        return Object.values(studentResult)
            .some(subRes => subRes.absent === true || subRes.result === false);
    }

    static calculateFinalAttendance(exams, attendance_totals) {
        return Object.values(exams).reduce((acc, { id, attendance_inclusion }) => {
            if (attendance_inclusion) acc += parseInt(attendance_totals?.[id]) || 0;
            return acc;
        }, 0);
    }
}

export { finalResultId, finalResultExam };
export { subjectResultFields, subjectCriteriaFields };
export default CommonResultPrep;