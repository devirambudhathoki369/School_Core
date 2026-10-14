import { getRemarks, getTotal } from "@/methods/exams/results";
import hasSplittedSubjects from "@/methods/exams/hasSplittedSubjects";
import CommonResultPrep, { subjectCriteriaFields, finalResultId } from "../CommonResultPrep";
import { isCriteriaValid } from "@/methods/exams/entryValidations";

const failedStatusStyles = { color: 'red' };
const VIEWS = { SINGLE: 1, BULK: 2 };
const totalPassFails = { passed: 0, passed_th: 0, passed_pr: 0, failed: 0, failed_th: 0, failed_pr: 0 };

class NSResultPrep extends CommonResultPrep {
    constructor() { }

    static prepareClassLedger(result, remarks, divisions, examIds = null, isFinalResult = false) {
        // number system class ledger/result!
        let averages = {};
        let attendanceTotal = 0;
        if (isFinalResult) {
            attendanceTotal = this.calculateFinalAttendance(result?.exams || {}, result?.attendance_total || {});
        } else {
            attendanceTotal = parseInt(result?.attendance_total) || 0;
        }
        // 
        const _subjects = result?.subjects?.map(subjectId => {
            let criteria = result?.subjects_data?.[subjectId]?.criteria;
            if (criteria) {
                for (let examId of examIds) {
                    averages[subjectId] = averages[subjectId] || {};
                    averages[subjectId][examId] = { th: 0, pr: 0, total: 0, ...totalPassFails };
                    if (isFinalResult) {
                        const inclusion = result?.exams?.[examId]?.inclusion || 0;
                        let _criteria;
                        if (inclusion) {
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
            return {};
        }).filter(subject => subject?.id);
        // 
        // const _students = (result?.students || []).reduce((acc, std) => {
        //     acc[std.id] = std.name;
        //     return acc;
        // }, {});
        let _totals = {};
        if (!isFinalResult) {
            _totals = {
                'fm_total': getTotal(_subjects, 'fm'),
                'pm_total': getTotal(_subjects, 'pm'),
            };
        }
        // TODO: FIX THESE 3 LOOOOOOPS!!
        let positions = {};
        // 
        let average_total = 0, average_percentage = 0, average_attendance = 0;
        let studentResult;
        let _studentResults = (result?.students || [])
            .reduce((acc, std, index) => {
                const stdId = std.id;
                acc[stdId] = { ...std, custom_roll_no: index + 1 };
                let finalTotal = 0, finalTotalFm = 0, finalTotalPm = 0,
                    finalAttendance = 0;
                for (let examId of examIds) {
                    let attendance;
                    if (isFinalResult) {
                        studentResult = result?.student_results?.[examId]?.[stdId] || {};
                        const inclusion = result?.exams?.[examId]?.inclusion || 0;
                        studentResult = this.withInclusion(studentResult, inclusion);
                        if (result?.exams?.[examId]?.attendance_inclusion) {
                            attendance = result?.attendances?.[examId]?.[stdId] || 0;
                        }
                    } else {
                        studentResult = result?.student_results?.[stdId] || {};
                        attendance = result?.attendances?.[stdId] || 0;
                    }
                    let attendance_str, stdRemarks = '', stdResult = '', color = '';
                    if (attendance) {
                        finalAttendance += attendance;
                        average_attendance += attendance;
                        attendance_str = `${attendance}/${attendanceTotal}`;
                    }
                    // 
                    let hasFailed = this.hasFailed(studentResult);
                    let total_fm = 0, total_pm = 0;
                    let total = _subjects.reduce((acc, subject) => {
                        const { id: subjectID, type, criteria } = subject;
                        const subResult = studentResult?.[subjectID] || {};
                        const _total = parseFloat(subResult?.total || 0);
                        acc += _total;
                        // 
                        let subjFM, subjPM;
                        if (isFinalResult) {
                            subjFM = parseFloat(criteria?.[examId]?.fm || 0);
                            subjPM = parseFloat(criteria?.[examId]?.pm || 0);
                        } else {
                            subjFM = parseFloat(criteria?.fm || 0);
                            subjPM = parseFloat(criteria?.pm || 0);
                            // total pass/fail counts!
                            const { failed, failedInTh, failedInPr } = this.getResultWithStatus(subResult, criteria);
                            if (failed?.color) averages[subjectID][examId].failed += 1;
                            else averages[subjectID][examId].passed += 1;
                            if (failedInTh?.color) averages[subjectID][examId].failed_th += 1;
                            else averages[subjectID][examId].passed_th += 1;
                            if (failedInPr?.color) averages[subjectID][examId].failed_pr += 1;
                            else averages[subjectID][examId].passed_pr += 1;
                        }
                        total_fm += type === 1 ? subjFM : (subjFM / 2);
                        total_pm += type === 1 ? subjPM : (subjPM / 2);
                        // average calculation;
                        averages[subjectID][examId].th += parseFloat(subResult?.theory || 0);
                        averages[subjectID][examId].pr += parseFloat(subResult?.practical || 0);
                        averages[subjectID][examId].total += _total;
                        averages[subjectID][finalResultId] = this.calculateFinalAverages(averages[subjectID], examIds);
                        return acc;
                    }, 0);
                    finalTotal += total;
                    finalTotalFm += total_fm;
                    finalTotalPm += total_pm;
                    // 
                    const percentage = ((total / total_fm) * 100)?.toFixed(2);
                    stdRemarks = getRemarks(hasFailed ? 0 : percentage, remarks?.rules || []);
                    stdResult = getRemarks(hasFailed ? 0 : percentage, divisions?.rules || []);
                    // 
                    if (!hasFailed && !isFinalResult)
                        positions[stdId] = percentage;
                    else color = 'red';
                    average_total += parseFloat(total);
                    average_percentage += parseFloat(percentage);
                    total = total.toFixed(2);
                    acc[stdId][examId] = {
                        ...studentResult, attendance_str, total, percentage,
                        remarks: stdRemarks, result: stdResult, color,
                        extra_activities: result.extra_activities_entries?.[stdId] || {},
                    };
                }

                if (isFinalResult) {
                    let finalHasFailed = false;
                    acc[stdId]["total"] = finalTotal.toFixed(2);
                    const finalPercentage = ((finalTotal / finalTotalFm) * 100);
                    acc[stdId]["percentage"] = finalPercentage.toFixed(2);
                    // 
                    const finalResult = this.calculateFinalResult(acc[stdId], examIds);
                    finalHasFailed = finalTotal > finalTotalPm ? false : true;
                    let _hasFailed;
                    for (let subject of _subjects) {
                        const { id } = subject;
                        if (id in finalResult) {
                            _hasFailed = false;
                            const { theory, practical, absent, result: passed } = finalResult?.[id];
                            const finalCriteria = subject?.criteria?.[finalResultId];
                            const { pm_th, pm_pr } = finalCriteria || {};
                            let isFail = (absent === true || passed === false);
                            let failedInTh = (theory && pm_th) ? theory < pm_th : false,
                                failedInPr = (practical && pm_pr) ? practical < pm_pr : false;
                            if (isFinalResult) {
                                isFail = isFail || (failedInTh || failedInPr);
                            }
                            _hasFailed = _hasFailed || isFail;
                            finalResult["result"] = _hasFailed;
                            finalHasFailed = finalHasFailed || _hasFailed;
                        }
                    }
                    if (!finalHasFailed) positions[stdId] = finalPercentage;
                    acc[stdId][finalResultId] = finalResult;
                    acc[stdId]["remarks"] = getRemarks(finalHasFailed ? 0 : finalPercentage, remarks?.rules || []);
                    acc[stdId]["result"] = getRemarks(finalHasFailed ? 0 : finalPercentage, divisions?.rules || []);
                    acc[stdId]["attendance_str"] = finalAttendance ? `${finalAttendance}/${attendanceTotal}` : "";
                    acc[stdId]["color"] = finalHasFailed ? "red" : "";
                }
                return acc;
            }, {});
        // 
        positions = Object.entries(positions).sort((a, b) => parseFloat(b[1]) - parseFloat(a[1])); // Sort by percentage in desc order;
        let position = 1;
        positions.forEach((pos, index) => {
            let [stdId, percentage] = pos;
            if (index > 0) {
                const [pStdId, pStdPercentage] = positions[index - 1];
                // if percentage is same, student has obtained same position;
                if (pStdPercentage === percentage) {
                    position = _studentResults[pStdId].position_in_section;
                } else {
                    position++;
                }
            }
            _studentResults[stdId]["position_in_section"] = position;
        });
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
        const total_students = result?.students?.length || 1;
        average_total = (average_total / total_students).toFixed(2);
        average_percentage = (average_percentage / total_students).toFixed(2);
        average_attendance = (average_attendance / total_students).toFixed(0);
        // 
        return {
            _subjects, _totals,
            averages, total_students, average_total, average_percentage, average_attendance,
            _studentResults
        }
    }

    static prepareResult(result, subjects, subjects_data, isFinalResult = false) {
        // marksheet single student result!
        // works for both termwise/final result marksheets!
        let _hasFailed;
        return subjects.reduce((acc, subjectID) => {
            _hasFailed = false;
            let subjectResult = result?.[subjectID] || {};
            const { theory, practical, total, absent, result: passed } = subjectResult;
            const { criteria, subject, credit_hours } = subjects_data?.[subjectID] || {};
            const { pm_th, pm_pr, pm } = criteria || {};
            // 
            const isValid = (isCriteriaValid(pm_th) && theory) ||
                (isCriteriaValid(pm_pr) && practical);
            if (isValid) {
                let isFail = (absent === true || passed === false);
                let failedInTh = (theory && pm_th) ? theory < pm_th : false,
                    failedInPr = (practical && pm_pr) ? practical < pm_pr : false,
                    failed = (total && pm) ? total < pm : false;
                if (isFinalResult) {
                    isFail = isFail || (failedInTh || failedInPr || failed);
                }
                _hasFailed = _hasFailed || isFail;
                const color = _hasFailed ? "red" : "";
                acc.push({
                    id: subjectID, criteria,
                    subject, credit_hours,
                    theory, practical, total, isFail: _hasFailed, color,
                    // remarks: getRemarks(total, remarks?.rules || [])
                });
            }
            return acc;
        }, []);
    }

    static getSummary(result, _remarks, _divisions, extra_activities = [], extra_activities_entries) {
        // mark sheet summary!
        let total = 0, total_fm = 0, percentage = 0, position = '', remarks = '';
        (result || []).forEach(sub => {
            if (sub?.isFail) {
                position = 'Fail';
                remarks = getRemarks(0, _remarks?.rules || []);
            }
            total += parseFloat(sub.total) || 0;
            total_fm += parseFloat(sub?.criteria?.fm) || 0;
        })
        total = total?.toFixed(2) || 0;
        total_fm = total_fm > 0 ? total_fm : 1;
        percentage = ((total / total_fm) * 100).toFixed(2);
        if (!remarks) remarks = getRemarks(percentage, _remarks?.rules || []);
        if (!position) position = getRemarks(percentage, _divisions?.rules || []); // result;
        // 
        extra_activities = (extra_activities || []).reduce((acc, ea) => {
            acc.push({ name: ea.name, data: extra_activities_entries?.[ea.id] }) || '';
            return acc;
        }, []);
        return { total, percentage, position, remarks, extra_activities };
    }

    static prepareMarkSheet(result, _remarks, _divisions, className, examName, examYear, examIds, isFinalResult = false, students = []) {
        let _view, _result,
            _isHigherSecondaryResult = hasSplittedSubjects(Object.values(result?.subjects_data || {}));
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
                student_results = this.finalResultMarksheet(students, result?.result || {}, result?.exams, examIds);
                subjects_data = this.finalResultMarksheetCriteria(result?.subjects_data, result?.exams, examIds);
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
                        className,
                        examName,
                        year: examYear,
                        custom_roll_no: _customRollNumbers?.[stdId],
                    },
                    result: this.prepareResult(student_results?.[stdId], result?.subjects || [], subjects_data, isFinalResult)
                }
            };
            _result[stdId]['summary'] = this.getSummary(_result?.[stdId]?.result, _remarks || {}, _divisions || {}, extra_activities, extra_activities_entries?.[stdId]);
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
                student_results = result?.student_results || {};
                attendance_total = parseInt(result?.attendance_total) || 0;
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
                    result: this.prepareResult(student_results?.[std.id], result?.subjects || [], subjects_data, isFinalResult)
                };
                acc[std.id]['summary'] = this.getSummary(acc?.[std.id]?.result, _remarks || {}, _divisions || {}, result.extra_activities, result.extra_activities_entries?.[std.id]);
                acc[std.id]['summary']['attendance'] = attendance;
                return acc;
            }, {});
        }

        return {
            _view, _isHigherSecondaryResult,
            _result,
        }
    }

    static finalResultMarksheet(students, student_results, exams, examIds) {
        // final result marksheet with inclusion!
        // prepares examwise data to single entity as final-result!
        return students.reduce((acc, std) => {
            acc[std.id] = acc?.[std.id] || {};
            for (let examId of examIds) {
                let studentResult = student_results?.[examId]?.[std.id] || student_results?.[examId] || {};;
                const inclusion = exams?.[examId]?.inclusion || 0;
                studentResult = this.withInclusion(studentResult, inclusion);
                acc[std.id][examId] = studentResult;
            }
            acc[std.id] = this.calculateFinalResult(acc[std.id], examIds);
            return acc;
        }, {});
    }
    static finalResultMarksheetCriteria(subjects_data, exams, examIds) {
        // final result criteria!
        // prepares examwise data to single entity as final-result!
        return Object.entries(subjects_data)
            .reduce((acc, [subjectId, subjectData]) => {
                acc[subjectId] = acc?.[subjectId] || {};
                for (let examId of examIds) {
                    acc[subjectId][examId] = acc?.[subjectId]?.[examId] || {};
                    const inclusion = exams?.[examId]?.inclusion || 0;
                    let _criteria;
                    if (inclusion) {
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

    static calculateFinalAverages(averages, examIds) {
        // class ledger
        return examIds.reduce((acc, examId) => {
            acc.th += averages[examId].th;
            acc.pr += averages[examId].pr;
            acc.total += averages[examId].total;
            return acc;
        }, { th: 0, pr: 0, total: 0 });
    }

    static getResultWithStatus(subjectResult, subjectCriteria) {
        const { theory, practical, total } = subjectResult;
        const { pm_th, pm_pr, pm } = subjectCriteria;
        const failedInTh = theory < pm_th ? failedStatusStyles : {};
        const failedInPr = practical < pm_pr ? failedStatusStyles : {};
        const failed = total < pm ? failedStatusStyles : {};
        return { theory, practical, total, failed, failedInTh, failedInPr };
    }
}

export { NSResultPrep, VIEWS };