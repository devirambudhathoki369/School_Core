import { __fetch, __fetchAsOptions, __save, __update } from ".";

const API__ECONOMIC_YEAR = '/api/economic_year',
    API__ACADEMIC_YEAR = '/api/academic_year',
    API__ACADEMIC_YEAR_MAPPING = '/api/assign/academic_year';

// ECONOMIC-YEAR
export async function saveEconomicYear(data) {
    return __save(API__ECONOMIC_YEAR, data);
}
export async function getEconomicYears(as_options = '') {
    return as_options ?
        __fetchAsOptions(API__ECONOMIC_YEAR, { as_options }, { name: 'name' }) :
        __fetch(API__ECONOMIC_YEAR);
}

// ACADEMIC-YEAR
export async function saveAcademicYear(data) {
    return __save(API__ACADEMIC_YEAR, data);
}
// `closed`: omit for the running years only (the default everywhere), or pass
// 'all' to get open AND closed ones — what a year LIST wants to show.
export async function getAcademicYears(school, as_options = '', closed = '') {
    const params = closed ? { school, closed } : { school };
    return as_options ?
        __fetchAsOptions(API__ACADEMIC_YEAR, { ...params, as_options }, { name: 'name' }) :
        __fetch(API__ACADEMIC_YEAR, params);
}
export async function getClosedAcademicYears(school, as_options = '') {
    const closed = "True";
    return as_options ?
        __fetchAsOptions(API__ACADEMIC_YEAR, { school, closed, as_options }, { name: 'name' }) :
        __fetch(API__ACADEMIC_YEAR, { school, closed });
}

// FACULTY-WISE-ACADEMIC-YEAR-MAPPING
export async function getAcademicYearMappings(school) {
    return __fetch(API__ACADEMIC_YEAR_MAPPING, { school });
}

export async function saveAcademicYearMapping(data) {
    if (data?.id) return __update(API__ACADEMIC_YEAR_MAPPING, data);
    return __save(API__ACADEMIC_YEAR_MAPPING, data);
}