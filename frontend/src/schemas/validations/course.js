import { object } from "yup";
import { text, select, number } from ".";

const courseValidationSchema = object({
    education_level: select("Education Level").must(),
    course: text("Course").must().size(2, 50),
    school: select("Auth"),
    faculty: select("Faculty")
        .when('education_level', {
            is: (val) => parseInt(val) === 3,
            then: (schema) => schema.must(),
            otherwise: (schema) => schema
        }),
    // Optional program length (years OR semesters). Kept lenient — the backend
    // treats an unset length as "unknown" and falls back to a heuristic.
    total_years: number("Total years"),
    total_semesters: number("Total semesters"),
})

export default courseValidationSchema;