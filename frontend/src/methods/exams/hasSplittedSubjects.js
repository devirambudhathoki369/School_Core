function hasSplittedSubjects(subjects) {
    return subjects.some(sub => typeof (sub?.credit_hours_pr) === "number");
}

export default hasSplittedSubjects;