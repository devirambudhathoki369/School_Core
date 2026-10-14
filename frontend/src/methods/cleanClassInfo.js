function cleanFields(data, fields, nullValue = null) {
    fields.map(field => {
        data[field] = nullValue;
    })
    return data;
}

export default function cleanClassInfo(data, nullValue = null) {
    const EL = parseInt(data?.education_level);
    let fieldsToBeCleaned;
    if (EL === 1) fieldsToBeCleaned = ['grade', 'faculty', 'course', 'year', 'semester'];
    else if (EL === 2 || EL === 10) fieldsToBeCleaned = ['faculty', 'course', 'year', 'semester'];
    // Level 3 keeps `course`: for high school that field holds the STREAM under
    // the faculty (Management ▸ Computer Science). Year and semester still go —
    // +2 is graded, not termed.
    else if (EL === 3) fieldsToBeCleaned = ['year', 'semester'];
    else if (EL === 4) fieldsToBeCleaned = ['grade', 'faculty'];
    else if (EL === 5) fieldsToBeCleaned = ['grade', 'faculty'];
    else if (EL === 8) fieldsToBeCleaned = ['grade', 'faculty'];
    else if (EL === 9) fieldsToBeCleaned = ['grade', 'faculty'];
    if (fieldsToBeCleaned) {
        data = cleanFields(data, fieldsToBeCleaned, nullValue);
    }
    return data;
}