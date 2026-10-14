const courseSchema = {
    education_level: '', course: '', school: '',
    // +2 streams only: the faculty the stream belongs to (Management ▸
    // Computer Science). Required there, sent as null for every other level.
    faculty: '',
    // Program length — set exactly ONE (years OR semesters). Optional; used by
    // year-end closing to tell a graduating final level from a junior one.
    total_years: '', total_semesters: '',
}

export default courseSchema;