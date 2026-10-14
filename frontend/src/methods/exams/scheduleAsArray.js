export default function scheduleAsArray(subjects, schedule, strict = true) {
    subjects = subjects.reduce((acc, subject) => {
        const subsc = schedule?.[subject.id];
        if (strict) {
            if (subsc) {
                acc.push({ ...subject, date: subsc });
            }
        } else {
            acc.push({ ...subject, date: subsc || "" });
        }
        return acc;
    }, []);
    subjects = sortSchedule(subjects);
    return subjects;
}

export function sortSchedule(scheduleArray) {
    return scheduleArray.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date);
    })
}