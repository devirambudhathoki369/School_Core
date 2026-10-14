import { __fetch, __save, __update, __delete } from ".";

const NOTICE_API = "/api/notices";

/**
 * A notice can carry a picture, so it goes up as multipart rather than JSON.
 *
 * Only built when there is actually a file to send: a plain text notice stays a
 * JSON request, which is what the edit-only-the-title path already expects and
 * what every previous caller of this function sent.
 *
 * `remove_image` is the explicit "take the picture off" signal. A partial update
 * that simply omits `image` means "leave it as it is" — that is what editing
 * only the title has to do — so removal cannot be expressed by absence.
 */
function toFormData(data) {
    const fd = new FormData();
    Object.entries(data).forEach(([key, value]) => {
        if (key === "image" || value === null || value === undefined) return;
        fd.append(key, value);
    });
    if (data.image instanceof File) fd.append("image", data.image, data.image.name);
    return fd;
}

function needsUpload(data) {
    return data?.image instanceof File || !!data?.remove_image;
}

export function saveNotice(data) {
    const multipart = needsUpload(data);
    let payload;
    if (multipart) {
        // `clean = false` below: cleanEmptyFields would strip the File and the
        // remove_image flag on the way past.
        payload = toFormData(data);
    } else {
        // A notice fetched for editing carries `image` as the URL it is served
        // from. Sending that back would hand the serializer's ImageField a
        // string and fail the whole update — including the title the user
        // actually came to change. Nothing to upload means don't mention it.
        const { image, remove_image, ...rest } = data || {};
        payload = rest;
    }
    if (data?.id) return __update(NOTICE_API, payload, !multipart);
    return __save(NOTICE_API, payload, !multipart);
}

export function deleteNotice(school_id, id) {
    return __delete(NOTICE_API, { school: school_id, id });
}

export function fetchNotices(school_id, page, cursor, id = '') {
    return __fetch(NOTICE_API, { school: school_id, page, cursor, id });
}
