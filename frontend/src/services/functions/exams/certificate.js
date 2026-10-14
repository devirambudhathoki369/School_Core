import { __fetch, __save, __update } from "..";

const CHARACTER_CERTIFICATE_API = "/api/character_certificate";

export async function saveCharacterCertificate(data) {
    if (data?.id) return __update(CHARACTER_CERTIFICATE_API, data);
    else return __save(CHARACTER_CERTIFICATE_API, data);
}

export async function fetchCharacterCertificates(school_id, student_id = '', page, cursor) {
    return __fetch(CHARACTER_CERTIFICATE_API, { school: school_id, student: student_id, page, cursor });
}