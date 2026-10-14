import { __delete, __fetch, __save, __update } from ".";

const BATCH_API = "/api/batches";

// List batches for a school (optionally filtered by course).
export async function fetchBatches(school, course = "") {
    return __fetch(BATCH_API, { school, course });
}

// Create or update a batch (cohort/intake).
export async function saveBatch(data) {
    if (data?.id) return __update(BATCH_API, data, false);
    return __save(BATCH_API, data, false);
}

export async function deleteBatch(school, id) {
    return __delete(BATCH_API, { school, id });
}

// Semesters a higher-ed program can be in (mirrors SEMESTER_CHOICES).
export const SEMESTER_OPTIONS = [
    { name: "1st", value: 1 }, { name: "2nd", value: 2 }, { name: "3rd", value: 3 },
    { name: "4th", value: 4 }, { name: "5th", value: 5 }, { name: "6th", value: 6 },
    { name: "7th", value: 7 }, { name: "8th", value: 8 }, { name: "9th", value: 9 },
    { name: "10th", value: 10 },
];

// Years a year-wise program can be in (mirrors YEAR_CHOICES) — diploma
// programs like Forestry/Pharmacy run year-wise, not semester-wise.
export const YEAR_OPTIONS = [
    { name: "1st year", value: 1 }, { name: "2nd year", value: 2 },
    { name: "3rd year", value: 3 }, { name: "4th year", value: 4 },
];

// How a program is organised.
export const STRUCTURE_OPTIONS = [
    { name: "Semester-wise", value: "semester" },
    { name: "Year-wise", value: "year" },
];
