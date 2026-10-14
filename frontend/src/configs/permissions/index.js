// PERMISSION__IDS
const PERMISSIONS = {
    // DASHBOARD_IDS : 1-100
    DASHBOARD: {
        SUMMARY: 1,
    },
    // STUDENT__ID : 101-200
    STUDENT: {
        ENROLLMENT: 101,
        UPDATE: 102,
        PAYMENT: 103,
        LEDGER_POSTING: 104,
        DUES_POSTING: 105,
        REMINDER_BILLS: 106,
        FAST_CASH_RECEIPT: 107,
        TAX_INVOICE: 108,
        DELETE_LEDGER: 109,
        DELETE_INVOICE: 110,
        // Bulk photo upload (admin assigns to class teachers / staff).
        BULK_PHOTOS: 111,
    },
    // STAFF__ID : 201-300
    STAFF: {
        ENROLLMENT: 201,
        UPDATE: 202,
        PAYMENT: 203,
        SALARY_POSTING: 204,
        DELETE_LEDGER: 209,
        DELETE_INVOICE: 210,
        PAY_SLIPS: 211,
        SALARY_SHEET: 212,
    },
    // MANAGEMENT__ID: 501-600
    MANAGE: {
        ACADEMIC_YEARS: 501,
        SECTIONS: 502,
        COURSES_SUBJECTS_PAGE: 509,
        COURSES: 503,
        SUBJECTS: 504,
        CLASS_PERIODS: 505,
        FEES: 506,
        BUS_STATIONS: 507,
        // The live map of the school's buses. Its own tick, apart from the
        // stations and their fees (507), which used to open it.
        BUS_TRACKING: 511,
        EXTRA_ACTIVITIES: 508,
        // 509, taken!
        BATCHES: 510,
    },
    // EXAM__ID: 601-700
    EXAM: {
        SETUP: 601,
        SCHEDULE_SETUP: 602,
        OPTIONAL_SUBJECT_ASSIGNMENT: 603,
        MARKS_ENTRY: 604,
        MARKS_ENTRY_SLIP: 605,
        // Enter marks for EVERY subject of a class, not just the staff's own —
        // for whoever makes the whole result. Without it a staff is limited to
        // the subjects they teach (MARKS_ENTRY).
        RESULT_MAKING: 610,
        GRADING_RULES_SETUP: 606,
        ENTRY_CARDS: 607,
        SEAT_PLAN: 609,
        RESULTS_PUBLISH: 608,
        VIEW_RESULTS: 650,
        CHARACTER_CERTIFICATE: 666,
        EXTRA_ACTIVITY_ENTRY: 676,
    },
    // REPORT_ID: 701-1000
    REPORTS: {
        RECENT_ENROLLMENTS: 701,
        RECENT_TRANSACTIONS: 702,
        RECENT_POSTINGS: 703,
        OVERALL_REMAINING_DUES: 704,
        OVERALL_STUDENT_LEDGERS: 705,
        LEDGER_POSTING_HISTORY: 714,
        TRANSACTIONS_HISTORY: 706,
        ENROLLMENT_HISTORY: 707,
        OPENING_BALANCE_REPORT: 708,
        NEW_ADMISSIONS_REPORT: 709,
        STUDENTS_PROFILE_PRINT: 713,
        STUDENTS_BALANCE_RANGE_REPORT: 710,
        TRANSPORTATION_REPORT: 711,
        DISCOUNTS_REPORT: 712,
        STAFF_DETAILS_REPORT: 715,
        ETHNIC_GROUP_REPORT: 716,
    },
    // ACCOUNTING_ID: 1000-1500
    ACCOUNTING: {
        ECONOMIC_YEAR: 1101,
        LEDGER: 1102,
        INCOME_ENTRY: 1103,
        EXPENSE_ENTRY: 1104,
        JOURNAL_ENTRY: 1105,
        CONTRA_ENTRY: 1106,
        // 
        INDIVIDUAL_LEDGER_REPORT: 1107,
        GROUPWISE_LEDGER_REPORT: 1108,
        PROFIT_LOSS_REPORT: 1109,
        BALANCE_SHEET: 1110,
        CASH_FLOW_STATEMENT: 1111,
        TRIAL_BALANCE: 1112,
        DAY_BOOK: 1113,
        // 
        LEDGERS: 1131,
        INCOME_ENTRIES: 1132,
        EXPENSE_ENTRIES: 1133,
        JOURNAL_ENTRIES: 1134,
        CONTRA_ENTRIES: 1135,
        // edit/delete on posted entries (1136-1141)
        INCOME_ENTRIES_EDIT: 1136,
        INCOME_ENTRIES_DELETE: 1137,
        EXPENSE_ENTRIES_EDIT: 1138,
        EXPENSE_ENTRIES_DELETE: 1139,
        JOURNAL_ENTRIES_EDIT: 1140,
        JOURNAL_ENTRIES_DELETE: 1141,
    },
    // INVENTORY_ID: 2301-2400
    INVENTORY: {
        ITEMS: 2301,
        PURCHASES: 2302,
        ISSUES: 2303,
        REPORTS: 2304,
        WASTAGE: 2305,
    },
    // 1500-1600
    ATTENDANCE: {
        ENTRY: 1501,
        MANAGEMENT: 1502,
        REPORT: 1503,
        OVERALL_REPORT: 1504,
        HISTORY: 1505,
    },
    // RFID_ID: 2401-2500
    RFID: {
        USERS_SETUP: 2401,
        REGISTERED_USERS: 2402,
        ATTENDANCE_LOGS: 2403,
        TIME_SET: 2404,
    },
    // 1600-2200
    COMMUNICATION: {
        SMS: {
            SETTINGS: 1601,
            TEMPLATES: 1602,
            BULK_SMS: 1603,
            DUES_REMINDER: 1604,
            SEND_MESSAGES: 1605,
            STAFF_SMS: 1606,
            REPORT: 1607,
        },
        // 1650-1700
        NOTICE: {
            CREATE: 1651,
            LIST: 1652,
            LETTER_TO_STUDENTS: 1660,
        },
        // 1700-1750
        NEWS: {
            CREATE: 1701,
            LIST: 1702,
        },
        // 1750-1800
        APP: {
            SLIDE_IMAGES: 1751,
        },
    },
    // LIBRARY_ID: 2201-2300
    LIBRARY: {
        SETUP: 2201,
        BOOK_SETUP: 2202,
        BOOK_TRANSACTION: 2203,
        REPORTS: 2204,
    },
    // HOSTEL_ID: 2501-2600
    // (2401-2500 is RFID — do not reuse it.)
    //
    // These are the SECOND gate, not the first. A staff member only ever sees
    // any of this if their school has the hostel module at all
    // (SchoolAdmin.uses_hostel, granted by the superadmin); these then decide
    // which parts of it that particular member of staff may open. A warden
    // typically gets ALLOCATION + ATTENDANCE + LEAVE + VISITORS and nothing
    // else — the setup and the fee report stay with the office.
    // EXTRA_BILLING_ID: 2601-2700
    //
    // The SECOND gate, not the first: a staff member only ever sees any of this
    // if their school has the module at all (SchoolAdmin.uses_extra_billing,
    // granted by the superadmin). These then decide which parts of it that
    // particular member of staff may open — a cashier typically gets PAYMENT
    // and REPORTS, while the setup and the bill run stay with the office.
    EXTRA_BILLING: {
        PARTIES: 2601,   // parties, charge heads, monthly rates
        BILLING: 2602,   // raising the months
        PAYMENT: 2603,   // collecting, receipts
        REPORTS: 2604,   // dues, statements, collection
    },
    HOSTEL: {
        SETUP: 2501,        // hostels, blocks, room types
        ROOMS: 2502,        // rooms and beds
        ALLOCATION: 2503,   // admit, transfer, check out
        ATTENDANCE: 2504,   // night roll call
        LEAVE: 2505,        // gate passes
        VISITORS: 2506,     // gate register
        COMPLAINTS: 2507,   // maintenance and grievances
        MESS: 2508,         // weekly menu
        DISCIPLINE: 2509,   // incident register
        REPORTS: 2510,      // dashboard + the printable registers
    },
}

const TESTED_PERMISSIONS = [1,
    101, 102, 103, 104, 105, 106, 107, 109, 110, 111,
    509, 503, 504, 505, 506, 507, 508, 511,
    601, 602, 603, 604, 605, 606, 607, 608, 610, 650, 666, 676,
    701, 702, 703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713, 715, 716,
    1101, 1102, 1103, 1104, 1105, 1106,/* */ 1107, 1108, 1109, 1110, 1131, 1132, 1133, 1134,
    // 1111 (cash flow) and 1112 (trial balance) were left out when those
    // reports shipped -- the list stopped at 1110 -- so neither could be
    // granted to a staff member at all. Both are ordinary accounting
    // reports; being ungrantable was an omission, not a policy.
    1111, 1112, 1113,
    1136, 1137, 1138, 1139, 1140, 1141,
    2301, 2302, 2303, 2304, 2305,
    2401, 2402, 2403, 2404,
    1501, 1502, 1503, 1504, 1505,
    1601, 1602, 1603, 1604, 1606, 1607,
    1651, 1652, 1660,
    1701, 1702,
    1751,
    2201, 2202, 2203, 2204,
    2501, 2502, 2503, 2504, 2505, 2506, 2507, 2508, 2509, 2510,
    2601, 2602, 2603, 2604,
];

/*
const PERMISSIONS_MENU = Object.keys(PERMISSIONS).reduce((acc, key) => {
    const permission = PERMISSIONS[key];
    const _permissions = Object.entries(permission).reduce((acc, [name, value]) => {
        if (TESTED_PERMISSIONS.includes(value)) {
            name = `${key} ${name}`;
            acc.push({ key, name, value });
        }
        return acc;
    }, [])
    acc.push(..._permissions);
    return acc;
}, []);
*/

export { PERMISSIONS, TESTED_PERMISSIONS };