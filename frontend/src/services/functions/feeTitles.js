import { __delete, __fetch, __fetchAsOptions, __save, __update } from ".";

/**
 * /api/fees/titles
 */
export async function fetchFeeTitles(school_id, as_options = '', class_id) {
    if (as_options) {
        return __fetchAsOptions('/api/fees/titles',
            { school: school_id, class: class_id, as_options },
            { name: 'title' });
    }
    return __fetch('/api/fees/titles', { school: school_id, class: class_id }, {});
}

export async function saveFeeTitle(data) {
    if (data?.id) return __update('/api/fees/titles', data);
    return __save('/api/fees/titles', data);
}

export async function deleteFeeTitle(feetitle_id, school_id) {
    return __delete('/api/fees/titles', { id: feetitle_id, school: school_id });
}