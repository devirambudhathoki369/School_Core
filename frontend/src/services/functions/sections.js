import { __delete, __fetch, __fetchAsOptions, __save, __update } from "."

const SECTIONS_API = "/api/sections";

export async function fetchSections(school_id, as_options = '', classwise = '') {
    if (as_options) return __fetchAsOptions(SECTIONS_API, { school: school_id, as_options, classwise },
        { name: 'section' });
    else return __fetch(SECTIONS_API, { school: school_id, classwise });
}

export async function saveSection(data) {
    if (data?.id) return __update(SECTIONS_API, data);
    return __save(SECTIONS_API, data);
}

export async function deleteSection(section_id, school_id) {
    return __delete(SECTIONS_API, { id: section_id, school: school_id });
}