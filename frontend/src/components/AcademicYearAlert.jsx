import AcademicYearNotice from "./AcademicYearNotice";

/**
 * Kept as a name because `result_publish` imports it. It said
 * "Selected academic year is X!" in a warning box — the right FACT in the wrong
 * register — and `AcademicYearNotice` now says the same thing quietly, with a
 * way to change the year, so this is that component under its old name.
 */
function AcademicYearAlert() {
    return <AcademicYearNotice />;
}

export default AcademicYearAlert;
