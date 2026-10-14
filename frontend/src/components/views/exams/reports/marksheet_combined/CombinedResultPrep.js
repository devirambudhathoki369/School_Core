import hasSplittedSubjects from "@/methods/exams/hasSplittedSubjects";
import { NSResultPrep } from "../number_system/NSResultPrep";
import { finalGP, getGPGrading, getPaperGradePoint, getRemarks } from "@/methods/exams/results";
import { isCriteriaValid } from "@/methods/exams/entryValidations";
import safeDecimal from "@/methods/safeDecimal";

const VIEWS = { SINGLE: 1, BULK: 2 };

class CombinedResultPrep extends NSResultPrep {
    constructor() { }

    static prepareCombinedMarkSheet(result, resultType, _remarks, _divisions, className, examName, examYear, examIds, isFinalResult = false, students = []) {
        let _view, _result
        const subjects = Object.values(result?.subjects_data || {});
        const _isHigherSecondaryResult = hasSplittedSubjects(subjects);
        const _customRollNumbers = this.generateRollNumbers(students);
        // 
        if (result?.student) {
            const stdId = result.student.id;
            _view = VIEWS.SINGLE;
            let student_results = {},
                subjects_data = result?.subjects_data || {},
                extra_activities = [], extra_activities_entries = {},
                attendance = parseInt(result?.attendance) || 0,
                attendance_total = 0;
            if (isFinalResult) {
                const students = [{ id: stdId }];
                // examwise result summed up with inclusions;
                student_results = this.finalResultMarksheet(students, result?.result || {}, result?.exams, examIds)
                subjects_data = this.finalResultMarksheetCriteria(result?.subjects_data, result?.exams, examIds);
                attendance_total += this.calculateFinalAttendance(result?.exams || {}, result?.attendance_total || {});
                for (let examId of examIds) {
                    if (result?.exams?.[examId]?.attendance_inclusion) {
                        attendance += result?.attendances?.[examId] || 0;
                    }
                }
            } else {
                student_results[stdId] = result?.result || {};
                ({ extra_activities, extra_activities_entries } = result);
                parseInt(result?.attendance_total) || 0;
            }
            attendance = attendance ? `${attendance}/${attendance_total}` : "";
            // 
            _result = {
                [stdId]: {
                    student: {
                        ...(result?.student || {}),
                        className,
                        examName,
                        year: examYear,
                        custom_roll_no: _customRollNumbers?.[stdId],
                    },
                    result: this.prepareResultCR(student_results?.[stdId], result?.subjects || [], subjects_data, _remarks || {}, isFinalResult)
                }
            };
            _result[stdId]['summary'] = this.getSummaryCR(_result?.[stdId]?.result, resultType, _remarks || {}, _divisions || {}, extra_activities, extra_activities_entries?.[stdId]);
            _result[stdId]['summary']['attendance'] = attendance;
        } else if (result?.students) {
            _view = VIEWS.BULK;
            let student_results,
                subjects_data = result?.subjects_data || {},
                attendance_total = 0;
            if (isFinalResult) {
                // examwise result summed up with inclusions;
                student_results = this.finalResultMarksheet(result?.students, result?.student_results, result?.exams, examIds);
                subjects_data = this.finalResultMarksheetCriteria(result?.subjects_data, result?.exams, examIds);
                attendance_total = this.calculateFinalAttendance(result?.exams || {}, result?.attendance_total || {});
            } else {
                attendance_total = parseInt(result?.attendance_total) || 0;
                student_results = result?.student_results || {};
            }
            _result = (result?.students || []).reduce((acc, std) => {
                let attendance;
                if (isFinalResult) {
                    attendance = 0;
                    for (let examId of examIds) {
                        if (result?.exams?.[examId]?.attendance_inclusion) {
                            attendance += result?.attendances?.[examId]?.[std.id] || 0;
                        }
                    }
                } else {
                    attendance = result?.attendances?.[std.id] || 0;
                }
                attendance = attendance ? `${attendance}/${attendance_total}` : "";
                // 
                acc[std.id] = {
                    student: {
                        ...std,
                        className,
                        examName,
                        year: examYear,
                        custom_roll_no: _customRollNumbers?.[std.id],
                    },
                    result: this.prepareResultCR(student_results?.[std.id], result?.subjects || [], subjects_data, _remarks || {}, isFinalResult)
                };
                acc[std.id]['summary'] = this.getSummaryCR(acc?.[std.id]?.result, resultType, _remarks || {}, _divisions || {}, result.extra_activities, result.extra_activities_entries?.[std.id]);
                acc[std.id]['summary']['attendance'] = attendance;
                return acc;
            }, {});
        }
        // 
        return {
            _view, _isHigherSecondaryResult,
            _result,
        }
    }

    static prepareResultCR(result, subjects, subjects_data, remarks, isFinalResult = false) {
        let _hasFailed;
        return subjects.reduce((acc, subjectID) => {
            _hasFailed = false;
            const { theory, practical, total, absent, result: passed } = result?.[subjectID] || {};
            const { criteria, subject, credit_hours, credit_hours_pr } = subjects_data?.[subjectID] || {};
            const { fm, pm, fm_th, pm_th, fm_pr, pm_pr } = criteria || {};
            // 
            const isValid = (isCriteriaValid(pm_th) && theory) ||
                (isCriteriaValid(pm_pr) && practical);
            if (isValid) {
                let isFail = (passed === false || absent === true);
                let failedInTh = (theory && pm_th) ? theory < pm_th : false,
                    failedInPr = (practical && pm_pr) ? practical < pm_pr : false,
                    failed = (total && pm) ? total < pm : false;
                if (isFinalResult) {
                    isFail = isFail || (failedInTh || failedInPr || failed);
                }
                _hasFailed = _hasFailed || isFail;
                // 
                let gp = 1;
                // A paper the school counts as passed is never worth zero — see
                // getPaperGradePoint. The combined marksheet prints the same
                // subjects as the gradesheet, so it has to read the grade point
                // the same way or the two documents disagree.
                const gp_th = _hasFailed ? 0 : getPaperGradePoint(theory, fm_th, pm_th),
                    gp_pr = (_hasFailed && !practical) ? 0 : getPaperGradePoint(practical, fm_pr, pm_pr);
                if (gp_th && gp_pr && credit_hours && credit_hours_pr) {
                    gp = _hasFailed ? 0 : finalGP(gp_th, gp_pr, credit_hours, credit_hours_pr);
                } else {
                    gp = _hasFailed ? 0 : getPaperGradePoint(total, fm, pm);
                }
                const grade = getGPGrading(gp);
                const color = _hasFailed ? "red" : "";
                acc.push({
                    id: subjectID, criteria,
                    subject, credit_hours, credit_hours_pr,
                    theory, practical, total, grade, gp, isFail: _hasFailed, color,
                    // remarks: getRemarks(total, remarks?.rules || [])
                });
            }
            return acc;
        }, []);
    }

    static getSummaryCR(result, resultType, _remarks, _divisions, extra_activities, extra_activities_entries) {
        let total = 0, total_fm = 0, percentage = 0, position = '', remarks = '', gpa = '';
        let sum_of_weighted_grade_point = 0, sum_of_credit_hours = 0;
        (result || []).forEach(sub => {
            if (sub?.isFail) {
                position = 'Fail';
                gpa = '-';
                remarks = getRemarks(0, _remarks?.rules || []);
            }
            let credit_hours = sub?.credit_hours || 0,
                credit_hours_pr = sub?.credit_hours_pr || 0,
                gp = sub?.gp || 0;
            const total_credit_hours = credit_hours + credit_hours_pr;
            sum_of_credit_hours += total_credit_hours;
            sum_of_weighted_grade_point += (gp * total_credit_hours);
            // 
            total += parseFloat(sub.total) || 0;
            total_fm += parseFloat(sub?.criteria?.fm) || 0;
        });
        total = safeDecimal(total || 0);
        total_fm = total_fm > 0 ? total_fm : 1;
        percentage = ((total / total_fm) * 100).toFixed(2);
        // 
        if (!gpa) gpa = (sum_of_weighted_grade_point / sum_of_credit_hours).toFixed(2);
        // 
        if (!remarks) remarks = getRemarks(resultType === "per" ? percentage : gpa, _remarks?.rules || []);
        if (!position) position = getRemarks(percentage, _divisions?.rules || []);
        // 
        extra_activities = (extra_activities || []).reduce((acc, ea) => {
            acc.push({ name: ea.name, data: extra_activities_entries?.[ea.id] || '' });
            return acc;
        }, []);
        return { total, percentage, gpa, position, remarks, extra_activities };
    }
}

export default CombinedResultPrep;