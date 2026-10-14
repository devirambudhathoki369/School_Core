import genAcademicYearMappingKey from "./genAcademicYearMappingKey";

function switchAcademicYear(name, value, state, _update) {
    try {
        value = parseInt(value);
    } catch (e) {
        return;
    }
    let key = genAcademicYearMappingKey(name, value, state);
    if (key) _update(key);
}

export default switchAcademicYear;