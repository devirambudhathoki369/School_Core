function valueExists(res) {
    return res !== undefined && res !== null;
}
function isCriteriaValid(criteriaValue) {
    return valueExists(criteriaValue) && criteriaValue != "" && criteriaValue > 0;
}

function hasPassed(totalObtainedMarks, obtainedThMarks, obtainedPrMarks, criteria = null) {
    let { pm, pm_th, pm_pr } = criteria;
    totalObtainedMarks = parseFloat(totalObtainedMarks);
    obtainedThMarks = parseFloat(obtainedThMarks);
    obtainedPrMarks = parseFloat(obtainedPrMarks);
    pm = parseFloat(pm);
    pm_th = parseFloat(pm_th);
    pm_pr = parseFloat(pm_pr);
    // 
    const passed = totalObtainedMarks >= pm;
    const passedInTheory = (isCriteriaValid(pm_th) && obtainedThMarks)
        ? obtainedThMarks >= pm_th : !obtainedThMarks ? true : false;
    const passedInPractical = (isCriteriaValid(pm_pr) && obtainedPrMarks)
        ? obtainedPrMarks >= pm_pr : !obtainedPrMarks ? true : false;
    return passed && passedInTheory && passedInPractical;
}
// 
function isMarksEntryValid(student_marks, criteria) {
    let { fm, fm_th, fm_pr } = criteria;
    fm = parseFloat(fm) || null;
    fm_th = parseFloat(fm_th) || null;
    fm_pr = parseFloat(fm_pr) || null;
    // console.log(data?.criteria, student_marks);
    // console.log(fm, (fm != "" && fm > 0), fm_th, (fm_th != "" && fm_th > 0), fm_pr, (fm_pr != "" && fm_pr > 0));
    const validTheoryCriteria = isCriteriaValid(fm_th),
        validPracticalCriteria = isCriteriaValid(fm_pr),
        validOverallCriteria = isCriteriaValid(fm);
    // console.log(validTheoryCriteria, validPracticalCriteria, validOverallCriteria);
    let errorEntry = null;
    const isValid = student_marks.every(result => {
        // console.log(result);
        if (result?.absent === true) return true;
        const validTheory = validTheoryCriteria ?
            (result.theory !== null && result.theory >= 0 && result.theory <= fm_th) :
            (result?.theory === null || false);
        const validPractical = validPracticalCriteria ?
            (result.practical !== null && result.practical >= 0 && result.practical <= fm_pr) :
            (result?.practical === null || false);
        const validOverall = validOverallCriteria ?
            (valueExists(result?.total) &&
                (result.total !== null && result.total >= 0 && result.total <= fm)) : false;
        let total = 0, validResult = true;
        if (result?.result !== "" && result?.total >= 0) {
            total = (result?.theory || 0) + (result?.practical || 0);
            total = parseFloat(total.toFixed(2)) || 0;
            validResult = total === result?.total || 0;
        }
        // console.log('absent?', result?.absent === true,
        //     'valid-theory', validTheory,
        //     'valid-practical', validPractical,
        //     'valid-overall', validOverall,
        //     'valid-result', validResult);
        const isStdResultValid = (validTheory &&
            validPractical &&
            validOverall &&
            validResult);
        if (!isStdResultValid) errorEntry = result;
        return isStdResultValid;
    });
    return { isValid, errorEntry };
}

export { hasPassed, isMarksEntryValid, isCriteriaValid };