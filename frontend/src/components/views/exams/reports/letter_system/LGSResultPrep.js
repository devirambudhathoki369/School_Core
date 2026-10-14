import hasSplittedSubjects from "@/methods/exams/hasSplittedSubjects";
import { finalGP, getGPGrading, getPaperGradePoint, getRemarks } from "@/methods/exams/results";
import CommonResultPrep, { subjectCriteriaFields, finalResultId } from "../CommonResultPrep";
import { isCriteriaValid } from "@/methods/exams/entryValidations";

const VIEWS = { SINGLE: 1, BULK: 2 };
const NG = "NG",
    PRACTICAL_SUBJECT = "practical_subject";
const failedStatusStyles = { color: 'red' };

class LGSResultPrep extends CommonResultPrep {
    constructor() { }

    // class result
    static prepareClassLedger(result, remarks, examIds, isFinalResult = false) {
        if (!result?.subjects) return {};
        const _subjects = result?.subjects
            .map(subjectId => {
                let criteria = result?.subjects_data?.[subjectId]?.criteria;
                if (criteria) {
                    for (let examId of examIds) {
                        if (isFinalResult) {
                            const inclusion = result?.exams?.[examId]?.inclusion || 0;
                            if (inclusion) {
                                let _criteria;
                                for (let field of subjectCriteriaFields) {
                                    _criteria = criteria?.[examId]?.[field];
                                    if (_criteria) {
                                        criteria[examId][field] = this.calculateWithInclusion(_criteria, inclusion)
                                    }
                                }
                            }
                        }
                    }
                    if (isFinalResult) {
                        criteria[finalResultId] = this.calculateFinalCriteria(criteria, examIds);
                    }
                    return { id: subjectId, ...result?.subjects_data?.[subjectId], criteria };
                }
                return {}
            }).filter(subject => subject?.id);
        const subjects_data = _subjects.reduce((acc, sub) => {
            acc[sub.id] = sub;
            return acc;
        }, {});
        // if subjects contains credit_hours_pr means they're higher secondary subjects else secondary;
        const _isHigherSecondaryResult = hasSplittedSubjects(_subjects);
        // 
        let attendanceTotal = 0;
        if (isFinalResult) {
            attendanceTotal = this.calculateFinalAttendance(result?.exams || {}, result?.attendance_total || {});
        } else {
            attendanceTotal = parseInt(result?.attendance_total) || 0;
        }
        let _studentResults = (result?.students || [])
            .reduce((acc, std, index) => {
                const stdId = std.id;
                acc[stdId] = { ...std, custom_roll_no: index + 1 };
                let numberedStudentResult = {};
                // 
                let finalAttendance = 0;
                for (let examId of examIds) {
                    let studentResult, gpa = 0, grade = '', extra_info = {}, hasFailed, attendance;
                    if (isFinalResult) {
                        studentResult = result?.student_results?.[examId]?.[stdId] || {};
                        const inclusion = result?.exams?.[examId]?.inclusion || 0;
                        studentResult = this.withInclusion(studentResult, inclusion);
                        numberedStudentResult[examId] = { ...studentResult };
                        if (result?.exams?.[examId]?.attendance_inclusion) {
                            attendance = result?.attendances?.[examId]?.[stdId] || 0;
                        }
                    } else {
                        studentResult = result?.student_results?.[stdId] || {};
                        attendance = result?.attendances?.[stdId] || 0;
                    }
                    let attendance_str;
                    if (attendance) {
                        finalAttendance += (attendance);
                        attendance_str = `${attendance}/${attendanceTotal}`;
                    }
                    ({ studentResult, gpa, grade, hasFailed, ...extra_info } = this.toLetterGrading(studentResult, subjects_data || {}, _isHigherSecondaryResult, examId));
                    const stdRemarks = (!hasFailed && !isFinalResult) ? getRemarks(gpa, remarks?.rules || []) : "";
                    //
                    acc[stdId][examId] = {
                        ...studentResult,
                        gpa, grade, remarks: stdRemarks, attendance_str,
                        extra_activities: result.extra_activities_entries?.[stdId],
                        ...extra_info
                    };
                }

                if (isFinalResult) {
                    numberedStudentResult = this.calculateFinalResult(numberedStudentResult, examIds);
                    const { studentResult: stdRes, gpa, grade, hasFailed, color, ...others } = this.toLetterGrading(numberedStudentResult, subjects_data || {}, _isHigherSecondaryResult, finalResultId);
                    const _remarks = getRemarks(gpa > 0 ? gpa : 0, remarks?.rules || []);
                    acc[stdId][finalResultId] = { ...stdRes, gpa, grade, remarks: _remarks, hasFailed, color, ...others };
                    acc[stdId]["gpa"] = gpa;
                    acc[stdId]["remarks"] = _remarks;
                    acc[stdId]["attendance_str"] = finalAttendance ? `${finalAttendance}/${attendanceTotal}` : "";
                    acc[stdId]["color"] = color;
                }
                return acc;
            }, []);
        _studentResults = (result?.students || []).reduce((acc, std) => {
            const stdId = std.id;
            if (!isFinalResult) {
                // Make it flat, (not examwise)!
                const examId = examIds[0];
                const { [examId]: examRes, ...stdInfo } = _studentResults[stdId];
                acc.push({ ...stdInfo, ...examRes });
            } else {
                acc.push(_studentResults[stdId]);
            }
            return acc;
        }, []);
        // 
        return {
            _subjects, _isHigherSecondaryResult,
            _studentResults,
        }
    }

    static toLetterGrading(stdResult, subjects_data, isHigherSecondaryResult, examId) {
        let sum_of_weighted_grade_point = 0, sum_of_credit_hours = 0, finalHasFailed = false;
        const res = {
            studentResult: Object.keys(stdResult || {}).reduce((acc, subjectID) => {
                let _hasFailed = false;
                let { theory, practical, total, absent, result: passed, ...other_info } = stdResult?.[subjectID] || {};
                const { criteria, credit_hours, credit_hours_pr } = subjects_data?.[subjectID] || {};
                const { fm, pm, fm_th, pm_th, fm_pr, pm_pr } = criteria?.[examId] || criteria || {};
                // 
                let isFail = (passed === false || absent === true);
                let failedInTh = (theory && pm_th) ? theory < pm_th : false,
                    failedInPr = (practical && pm_pr) ? practical < pm_pr : false;
                if (examId === finalResultId) {
                    isFail = isFail || (failedInTh || failedInPr);
                }
                _hasFailed = _hasFailed || isFail;
                finalHasFailed = finalHasFailed || _hasFailed;
                // 
                let gp = 1;
                // A paper the school counts as passed is never worth zero —
                // see getPaperGradePoint. The ledger and the gradesheet must
                // agree, so both read the grade point the same way.
                const gp_th = _hasFailed ? 0 : getPaperGradePoint(theory, fm_th, pm_th),
                    gp_pr = (_hasFailed && !practical) ? 0 : getPaperGradePoint(practical, fm_pr, pm_pr);
                if (gp_th && gp_pr && credit_hours && credit_hours_pr) {
                    gp = _hasFailed ? 0 : finalGP(gp_th, gp_pr, credit_hours, credit_hours_pr);
                } else {
                    gp = _hasFailed ? 0 : getPaperGradePoint(total, fm, pm);
                }
                // console.log(">>", subjectID, _hasFailed, theory, fm_th, pm_th, theory < pm_th, gp_th);
                theory = failedInTh ? "NG" : (gp_th > 0 ? getGPGrading(gp_th) : null);
                if (fm_pr && pm_pr) {
                    practical = failedInPr ? "NG" : (gp_pr > 0 ? getGPGrading(gp_pr) : null);
                }
                total = getGPGrading(gp);
                // 
                const total_credit_hours = credit_hours + (credit_hours_pr || 0);
                sum_of_weighted_grade_point += (gp * total_credit_hours);
                sum_of_credit_hours += total_credit_hours;
                // 
                acc[subjectID] = { theory, practical, total, gp, gp_th, gp_pr, ...other_info, isFail: _hasFailed };
                return acc;
            }, {}),
            hasFailed: finalHasFailed,
            gpa: finalHasFailed ? 0 :
                (sum_of_weighted_grade_point / sum_of_credit_hours).toFixed(2),
            color: finalHasFailed ? "red" : "",
        };
        res['grade'] = getGPGrading(res.gpa);
        return res;
    }

    // gradesheet!
    static prepareGradesheet(result, remarks, className, examName, examYear, examIds, isFinalResult = false, students = []) {
        let _view, _result;
        const subjects = Object.values(result?.subjects_data || {});
        const _isHigherSecondaryResult = hasSplittedSubjects(subjects),
            _showSubjectCodes = this.hasSubjectCodes(_isHigherSecondaryResult, subjects),
            _customRollNumbers = LGSResultPrep.generateRollNumbers(students);
        // 
        if (result?.student) {
            const stdId = result.student.id;
            _view = VIEWS.SINGLE
            let student_results = {},
                subjects_data = result?.subjects_data || {},
                extra_activities = [], extra_activities_entries = {},
                attendance = parseInt(result?.attendance) || 0,
                attendance_total = 0;
            if (isFinalResult) {
                const students = [{ id: stdId }];
                // examwise result summed up with inclusions;
                student_results = this.finalResultGradesheet(students, result?.result || {}, result?.exams, examIds);
                subjects_data = this.finalResultGradesheetCriteria(result?.subjects_data, result?.exams, examIds);
                for (let examId of examIds) {
                    if (result?.exams?.[examId]?.attendance_inclusion) {
                        attendance += result?.attendance?.[examId] || 0;
                    }
                }
                attendance_total = this.calculateFinalAttendance(result?.exams || {}, result?.attendance_total || {});
            } else {
                student_results[stdId] = result?.result || {};
                ({ extra_activities, extra_activities_entries } = result);
                attendance_total = parseInt(result?.attendance_total) || 0;
            }
            attendance = attendance ? `${attendance}/${attendance_total}` : "";
            // 
            _result = {
                [stdId]: {
                    student: {
                        ...(result?.student || {}),
                        className: className,
                        examName,
                        year: examYear,
                        custom_roll_no: _customRollNumbers?.[stdId],
                    },
                    result: this.prepareResult(student_results?.[stdId], result?.subjects || [], subjects_data, remarks || {}, _isHigherSecondaryResult, isFinalResult),
                }
            };
            _result[stdId]['summary'] = this.getSummary(_result?.[stdId]?.result, remarks || {}, extra_activities, extra_activities_entries?.[stdId]);
            _result[stdId]['summary']['attendance'] = attendance;
        } else if (result?.students) {
            _view = VIEWS.BULK;
            let student_results,
                subjects_data = result?.subjects_data || {},
                extra_activities = [], extra_activities_entries = {},
                attendance_total = 0;
            if (isFinalResult) {
                // examwise result summed up with inclusions;
                student_results = this.finalResultGradesheet(result?.students, result?.student_results, result?.exams, examIds);
                subjects_data = this.finalResultGradesheetCriteria(result?.subjects_data, result?.exams, examIds);
                attendance_total = this.calculateFinalAttendance(result?.exams || {}, result?.attendance_total || {});
            } else {
                student_results = result?.student_results || {};
                ({ extra_activities, extra_activities_entries } = result);
                attendance_total = parseInt(result?.attendance_total) || 0;
            }
            // 
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
                        className: className,
                        examName,
                        year: examYear,
                        custom_roll_no: _customRollNumbers?.[std.id],
                    },
                    result: this.prepareResult(student_results?.[std.id], result?.subjects || [], subjects_data, remarks || {}, _isHigherSecondaryResult, isFinalResult),
                };
                acc[std.id]['summary'] = this.getSummary(acc?.[std.id]?.result, remarks || {}, extra_activities, extra_activities_entries?.[std.id]);
                acc[std.id]['summary']['attendance'] = attendance;
                return acc;
            }, {});
        }
        return {
            _view, _isHigherSecondaryResult, _showSubjectCodes,
            _result
        }
    }
    static finalResultGradesheet(students, student_results, exams, examIds) {
        // final result gradesheet with inclusion!
        // prepares examwise data to single entity as final-result!
        return students.reduce((acc, std) => {
            acc[std.id] = acc?.[std.id] || {};
            for (let examId of examIds) {
                let studentResult = student_results?.[examId]?.[std.id] || student_results?.[examId] || {};
                const inclusion = exams?.[examId]?.inclusion || 0;
                studentResult = this.withInclusion(studentResult, inclusion);
                acc[std.id][examId] = studentResult;
            }
            acc[std.id] = this.calculateFinalResult(acc[std.id], examIds);
            return acc;
        }, {});
    }
    static finalResultGradesheetCriteria(subjects_data, exams, examIds) {
        // final result criteria!
        // prepares examwise data to single entity as final-result!
        return Object.entries(subjects_data)
            .reduce((acc, [subjectId, subjectData]) => {
                acc[subjectId] = acc?.[subjectId] || {};
                for (let examId of examIds) {
                    acc[subjectId][examId] = acc?.[subjectId]?.[examId] || {};
                    const inclusion = exams?.[examId]?.inclusion || 0;
                    if (inclusion) {
                        let _criteria;
                        for (let field of subjectCriteriaFields) {
                            _criteria = subjectData.criteria?.[examId]?.[field];
                            if (_criteria) {
                                acc[subjectId][examId][field] = this.calculateWithInclusion(_criteria, inclusion)
                            }
                        }
                    }
                }
                acc[subjectId] = {
                    ...subjectData,
                    criteria: this.calculateFinalCriteria(acc[subjectId], examIds)
                };
                return acc;
            }, {});
    }

    static prepareResult(result, subjects, subjects_data, remarks, isHigherSecondaryResult, isFinalResult = false) {
        let _hasFailed;
        return subjects.reduce((acc, subjectID) => {
            _hasFailed = false;
            let { theory, practical, total, absent, result: passed } = result?.[subjectID] || {};
            const { code, subject, code_pr, subject_pr, credit_hours, credit_hours_pr, criteria } = subjects_data?.[subjectID] || {};
            const { fm, pm, fm_th, pm_th, fm_pr, pm_pr } = criteria || {};

            const isValid = (isCriteriaValid(pm_th) && theory !== undefined) ||
                (isCriteriaValid(pm_pr) && practical !== undefined);
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
                // getPaperGradePoint. This is what stopped a "just passed"
                // paper (8 of 25 = 32%, against a scale that starts at 35%)
                // printing a blank grade beside a bare 0, and it keeps the
                // subject's final grade on the credit-weighted formula instead
                // of silently dropping to total/fm for those rows alone.
                const gp_th = _hasFailed ? 0 : getPaperGradePoint(theory, fm_th, pm_th),
                    gp_pr = (_hasFailed && !practical) ? 0 : getPaperGradePoint(practical, fm_pr, pm_pr);
                // partitioned-subject-result;
                if (gp_th && gp_pr && credit_hours && credit_hours_pr) {
                    gp = _hasFailed ? 0 : finalGP(gp_th, gp_pr, credit_hours, credit_hours_pr);
                } else {
                    gp = _hasFailed ? 0 : getPaperGradePoint(total, fm, pm);
                }
                // console.log(_hasFailed, theory, practical, criteria, gp, gp_th, gp_pr);
                theory = failedInTh ? NG : (gp_th > 0 ? getGPGrading(gp_th) : null);
                if (fm_pr && pm_pr) {
                    practical = failedInPr ? NG : (gp_pr > 0 ? getGPGrading(gp_pr) : null);
                }
                total = getGPGrading(gp);
                // 
                if (isHigherSecondaryResult && subject_pr && credit_hours_pr) {
                    acc.push({
                        id: subjectID, code, subject, credit_hours,
                        grade: theory, total, gp, gp_th, isFail: theory === NG || isFail,
                        [PRACTICAL_SUBJECT]: {
                            id: subjectID, code_pr, subject: subject_pr, credit_hours: credit_hours_pr,
                            grade: practical, gp, gp_pr, isFail: practical === NG || isFail,
                        }
                    });
                } else {
                    // normal-subject-result;
                    acc.push({
                        id: subjectID, code, subject, credit_hours,
                        theory, practical, total, gp, isFail
                    });
                }
            }
            return acc;
        }, []);
    }

    static getSummary(result, _remarks, extra_activities, extra_activities_entries) {
        let sum_of_weighted_grade_point = 0, sum_of_credit_hours = 0;
        let gpa = '', remarks = '';
        (result || []).forEach(sub => {
            if (sub?.isFail) {
                gpa = -1;
            } else {
                let credit_hours = sub?.credit_hours || 0,
                    credit_hours_pr = sub?.practical_subject?.credit_hours || 0,
                    gp = sub?.gp || 0;

                const total_credit_hours = credit_hours + credit_hours_pr;
                sum_of_credit_hours += total_credit_hours;
                sum_of_weighted_grade_point += (gp * total_credit_hours);
            }
        });
        // 
        if (!gpa) gpa = (sum_of_weighted_grade_point / sum_of_credit_hours).toFixed(2);
        remarks = getRemarks(gpa > 0 ? gpa : 0, _remarks?.rules || []);
        extra_activities = (extra_activities || []).reduce((acc, ea) => {
            acc.push({ name: ea.name, data: extra_activities_entries?.[ea.id] || '' });
            return acc;
        }, []);
        return { gpa: gpa > 0 ? gpa : '-', remarks, extra_activities };
    }

    // 
    static hasSubjectCodes(isHigherSecondaryResult, subjects) {
        return subjects.every(sub => isHigherSecondaryResult ? (sub?.code && sub?.code_pr) : sub?.code);
    }

    static getResultWithStatus(subjectResult) {
        const { theory, practical, total, ...others } = subjectResult;
        const failedInTh = theory === NG ? failedStatusStyles : {};
        const failedInPr = practical === NG ? failedStatusStyles : {};
        const failed = total === NG ? failedStatusStyles : {};
        return { theory, practical, total, ...others, failed, failedInTh, failedInPr };
    }
}

export { LGSResultPrep, VIEWS };