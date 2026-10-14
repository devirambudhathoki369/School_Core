export const DEVICES_API_PATH = "/rfid/devices";
export const DEVICES_PULL_LOGS_PATH = "/rfid/devices/pull-logs";
export const RFID_USERS_API_PATH = "/rfid/users";
export const RFID_STRIP_ZEROS_PATH = "/rfid/users/strip-zeros";
// Re-queues the enrolment of everyone we hold for a device, so a device that
// was reset, swapped, or that rejected an enrolment can be brought back in line
// with what the web says is registered on it.
export const RFID_USERS_SYNC_PATH = "/rfid/users/sync";
export const RFID_ATTD_LOGS_PATH = "/rfid/logs";

export const ROLES = {
    STUDENT: "student",
    STAFF: "staff",
};