import { __delete, __fetch, __save, __search, __update } from ".";

export async function fetchFees(school_id, class_id) {
    return __fetch('/api/fees', { school: school_id, class: class_id });
}

export async function searchFeeDetails(params) {
    /**
     * fetch fee details using academic details.
     */
    return __search('/api/search/fees', params);
}

// export async function fetchStudentFeeDetails(school_id, student_id) {
//     const data = await __fetch('/api/fees', { school_id, student_id })
//     return data?.length > 0 ? data : null;
// }

export async function saveFee(data, clean = true) {
    if (data?.id) return __update('/api/fees', data, clean);
    return __save('/api/fees', data, clean);
}

export async function deleteFee(fee_id, school_id) {
    return __delete('/api/fees', { id: fee_id, school: school_id });
}