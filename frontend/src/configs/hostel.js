/**
 * MUST MATCH smsys.backend/hostel/constants.py.
 *
 * These numbers cross the wire in both directions — a value that means
 * "vacated" in the database and "transferred" on screen is the kind of bug only
 * ever found during a fee dispute. When you change one file, change the other.
 */

export const HOSTEL_TYPES = [
    { value: 1, name: "Boys" },
    { value: 2, name: "Girls" },
    { value: 3, name: "Mixed" },
];

export const ROOM_AVAILABLE = 1;
export const ROOM_STATUSES = [
    { value: 1, name: "Available" },
    { value: 2, name: "Under maintenance" },
    { value: 3, name: "Blocked" },
];

export const ALLOC_ACTIVE = 1;
export const ALLOC_VACATED = 2;
export const ALLOC_TRANSFERRED = 3;
export const ALLOCATION_STATUSES = [
    { value: 1, name: "Active" },
    { value: 2, name: "Vacated" },
    { value: 3, name: "Transferred" },
];

export const ATT_PRESENT = 1;
export const ATT_ABSENT = 2;
export const ATT_ON_LEAVE = 3;
export const ATT_LATE = 4;
export const ATTENDANCE_STATUSES = [
    { value: 1, name: "Present" },
    { value: 2, name: "Absent" },
    { value: 3, name: "On leave" },
    { value: 4, name: "Late" },
];

export const LEAVE_TYPES = [
    { value: 1, name: "Day out" },
    { value: 2, name: "Home leave" },
    { value: 3, name: "Medical" },
    { value: 4, name: "Emergency" },
];
export const LEAVE_APPROVED = 2;
export const LEAVE_RETURNED = 4;
export const LEAVE_STATUSES = [
    { value: 1, name: "Pending" },
    { value: 2, name: "Approved" },
    { value: 3, name: "Rejected" },
    { value: 4, name: "Returned" },
];

export const COMPLAINT_CATEGORIES = [
    { value: 1, name: "Maintenance" },
    { value: 2, name: "Electrical" },
    { value: 3, name: "Plumbing / water" },
    { value: 4, name: "Cleanliness" },
    { value: 5, name: "Mess / food" },
    { value: 6, name: "Discipline" },
    { value: 7, name: "Security" },
    { value: 8, name: "Other" },
];
export const COMPLAINT_RESOLVED = 3;
export const COMPLAINT_STATUSES = [
    { value: 1, name: "Open" },
    { value: 2, name: "In progress" },
    { value: 3, name: "Resolved" },
    { value: 4, name: "Closed" },
];

export const PRIORITIES = [
    { value: 1, name: "Low" },
    { value: 2, name: "Normal" },
    { value: 3, name: "High" },
];

// Nepal's week starts on Sunday — this is the calendar the schools already read.
export const WEEKDAYS = [
    { value: 1, name: "Sunday" },
    { value: 2, name: "Monday" },
    { value: 3, name: "Tuesday" },
    { value: 4, name: "Wednesday" },
    { value: 5, name: "Thursday" },
    { value: 6, name: "Friday" },
    { value: 7, name: "Saturday" },
];

export const MEALS = [
    { value: 1, name: "Breakfast" },
    { value: 2, name: "Lunch" },
    { value: 3, name: "Snacks" },
    { value: 4, name: "Dinner" },
];

/** `nameOf(HOSTEL_TYPES, 2)` -> "Girls". */
export function nameOf(options, value, fallback = "") {
    const hit = (options || []).find((o) => String(o.value) === String(value));
    return hit ? hit.name : fallback;
}
