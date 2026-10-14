import { __save, __fetch, __search, __update, __delete } from ".";

function cleanFalsyFields(data) {
    for (let [key, value] of Object.entries(data)) {
        if (value && value.constructor === Object) {
            Object.assign(data[key], cleanEmptyFields(value));
            if (Object.keys(data[key]).length === 0) delete data[key]; // remove {} as well;
        }
        else if (value === false) delete data[key];
    }
    return data;
}

/**
 * @REQUIRES
 * - params : {first_name, middle_name, last_name, grade_details, status}
 * - include_classname
 * - include_discounts
 * - include_station >> if include_station is true, pass station: <station_id> (optional)
 * - transportation_fee
 * - include_images
 * - include_balance
 * - id_cards
 * - result >> if result is true, pass id: <class_id>, academic_year: <academic_year_id>, subject: <subject_id>
 * - detailed
 * @RETURNS
 * list of students.
 */
export async function searchStudents(params,
    include_discounts = false,
    include_station = false,
    transportation_fee = false,
    include_images = false,
    id_cards = false,
    result = false,
) {
    return __search('/api/search/students', {
        ...params,
        ...cleanFalsyFields({ include_discounts, include_station, transportation_fee, include_images, id_cards, result })
    });
}

const STUDENTS_API = "/api/students";
/**
 * GET : /api/student/?student_id=?&school_id=?
 */
export async function getStudentDetails(student_id, school_id) {
    const data = await __fetch(STUDENTS_API, { student: student_id, school: school_id });
    return data?.first_name ? data : null;
}

export async function getRecentEnrollments(school_id, page, cursor) {
    // if (!page) return null;
    let res = await __fetch(STUDENTS_API, { school: school_id, page, cursor });
    res['results'] = res?.['results']
        .map(item => ({
            ...item,
            'gender': item.gender === 1 ? 'male' : item.gender === 2 ? 'female' : 'others'
        }));
    return res;
}

export async function saveStudent(data) {
    return __save(STUDENTS_API, data);
}

export async function updateStudent(data, clean = false) {
    return __update(STUDENTS_API, data, clean);
}

/** Take a student's photo or one of their documents off the record. */
export async function removeStudentImage(student_id, school_id, name) {
    return __update(STUDENTS_API, { id: student_id, school: school_id, remove: name });
}

// Bulk photo upload (admin + staff). `pairs` is [{student_id, file}, ...].
// Posted as multipart with pairs[i][student] + pairs[i][photo]. Returns
// [status, message, data] like other service helpers.
const STUDENTS_BULK_PHOTOS_API = "/api/students/bulk-photos";
export async function bulkUploadStudentPhotos({ school, class_info, pairs }) {
    const fd = new FormData();
    fd.append("school", school);
    fd.append("class_info", class_info);
    pairs.forEach((p, i) => {
        fd.append(`pairs[${i}][student]`, p.student_id);
        fd.append(`pairs[${i}][photo]`, p.file, p.file.name);
    });
    return __save(STUDENTS_BULK_PHOTOS_API, fd, false);
}

// Pending-photo pool. Admin uploads → staff pairs later.
const STUDENTS_PENDING_PHOTOS_API = "/api/students/pending-photos";
export async function uploadPendingStudentPhotos({ school, class_info, files, notes = [] }) {
    const fd = new FormData();
    fd.append("school", school);
    fd.append("class_info", class_info);
    files.forEach((f) => fd.append("photos", f, f.name));
    notes.forEach((n) => fd.append("notes", n || ""));
    return __save(STUDENTS_PENDING_PHOTOS_API, fd, false);
}
export async function listPendingStudentPhotos(school, class_info, merge_sections = false) {
    const params = { school, class_info };
    if (merge_sections) params.merge_sections = true;
    const data = await __fetch(STUDENTS_PENDING_PHOTOS_API, params);
    return data?.data || [];
}
export async function pairPendingStudentPhoto({ school, class_info, pending_id, student }) {
    return __update(STUDENTS_PENDING_PHOTOS_API, {
        school, class_info, pending_id, student,
    }, false);
}
export async function deletePendingStudentPhoto({ school, id, class_info }) {
    // Bypasses the global confirm in __delete by going through server directly.
    // We confirm in-app instead so callers can batch / clear-all without a prompt.
    const params = { school };
    if (id) params.id = id;
    if (class_info) params.class_info = class_info;
    try {
        const { default: server } = await import("../server");
        const res = await server.delete(STUDENTS_PENDING_PHOTOS_API, { params });
        return [res.status || 200, res.data?.message || "", res.data];
    } catch (e) {
        return [e?.response?.status || 400, e?.response?.data?.message || e.message, null];
    }
}


// STUDENT TRANSPORTATION;
const API_STD_TRANSPORTATION = "/api/students/transportations";
export async function getStudentTransportations(student_id, school_id, active = null, as_title = '') {
    const params = { student: student_id, school: school_id, as_title };
    active && (params['active'] = active);
    return __fetch(API_STD_TRANSPORTATION, params);
}

export async function saveStudentTransportation(data) {
    if (data?.id) return __update(API_STD_TRANSPORTATION, data);
    return __save(API_STD_TRANSPORTATION, data);
}

export async function deleteStudentTransportation(transportation_id, student_id, school_id) {
    return __delete(API_STD_TRANSPORTATION, {
        id: transportation_id, student: student_id, school: school_id
    })
}

export async function searchStudentsTransportation(school_id, class_info_id, station_id, include_contact = '') {
    return __search('api/search/students', {
        school: school_id,
        class_info: class_info_id,
        station: station_id,
        include_station: true,
        include_contact,
        station_name: true,
        strict: true,
    });
}

// STUDENT DISCOUNT;
const API_STD_DISCOUNT = "/api/students/discounts";
export async function getStudentDiscounts(student_id, school_id) {
    return __fetch(API_STD_DISCOUNT, { student: student_id, school: school_id })
}
export async function saveStudentDiscount(data) {
    if (data?.id) return __update(API_STD_DISCOUNT, data);
    return __save(API_STD_DISCOUNT, data);
}
/**
 * - id : discount-id \
 * - student_id \
 * - school_id
 */
export async function deleteStudentDiscount(discount_id, student_id, school_id) {
    return __delete(API_STD_DISCOUNT, {
        id: discount_id, student: student_id, school: school_id
    });
}

// CLASS PROMOTION
export async function promoteClass(data) {
    return __update(STUDENTS_API, data);
}

// STUDENT MEDICAL INFO;
const API_STD_MEDICAL = "/api/students/medical";
export async function getStudentMedicalInfo(student_id, school_id) {
    return __fetch(API_STD_MEDICAL, { student: student_id, school: school_id });
}
export async function saveStudentMedicalInfo(data) {
    if (data?.id) return __update(API_STD_MEDICAL, data);
    return __save(API_STD_MEDICAL, data);
}
export async function deleteStudentMedicalInfo(record_id, student_id, school_id) {
    return __delete(API_STD_MEDICAL, {
        id: record_id, student: student_id, school: school_id
    });
}