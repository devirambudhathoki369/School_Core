import { __fetch } from ".";

const DEVICES_API = "/rfid/devices";

/**
 * Attendance readers / access panels registered to a school.
 *
 * Each row carries an `online` flag the backend computes from `last_seen`
 * (heard from within the last 180s) rather than the stored `state` column,
 * which only changes when something writes to it.
 *
 * Returns [] for a school with no devices — which is the normal case, and the
 * dashboard renders nothing at all for it.
 */
export async function fetchSchoolDevices(school_id) {
    const data = await __fetch(DEVICES_API, { school: school_id });
    return Array.isArray(data) ? data : [];
}
