// One sentence under each page's title, saying what the page is for.
//
// Keyed by the view path the menu uses ("payment.student"). Staff open the same
// pages as the school, so they share the school's lines. A page without a line
// shows its title alone; that is better than a sentence that guesses.

const SCHOOL = {
    'view-bus-tracking': "Where each school bus is right now.",

    'enrollment.student': "Admit a new student into the current academic year.",
    'enrollment.staff': "Add a new member of staff.",
    'enrollment.class-promotion': "Move students up to their next class for the new year.",
    'enrollment.classwise-student-statistics': "How many students each class has.",
    'enrollment.bulk.student-enrollments': "Admit many students at once from a spreadsheet.",
    'enrollment.bulk.student-updates': "Change many students' details at once from a spreadsheet.",
    'student-photos': "Match uploaded photos to students, then confirm each match.",

    'payment.student': "Find the student, choose the months, and take the payment.",
    'payment.ledger-posting': "Post a month's fees to students' ledgers.",
    'payment.old-dues-posting': "Record what a student owed before they were added here.",
    'payment.reminder-bills': "Print fee reminder bills for a class.",
    'payment.tax-invoice': "Find and print tax invoices.",
    'payment.fast-cash-receipt': "Take a cash payment quickly and print the receipt.",

    'payroll.staff': "Set up what each member of staff is paid.",
    'payroll.salary-posting': "Post a month's salaries to staff ledgers.",
    'payroll.staff-ledger': "Everything posted and paid for one member of staff.",
    'payroll.pay-slips': "Print pay slips for a month.",
    'payroll.salary-sheet': "A month's salaries for all staff on one sheet.",

    'manage.setup-guide': "The steps to set up the school, in the order they need doing.",
    'manage.academic-year': "Open a new academic year, or change the current one.",
    'manage.academic-year-closing': "Close the academic year once its work is finished.",
    'manage.calendar-events': "Holidays and events for the year.",
    'academic-calendar': "Holidays and events for the year.",
    'manage.classes': "The classes the school teaches, and their periods.",
    'manage.sections': "The sections a class can be split into, such as A and B.",
    'manage.courses-subjects': "The subjects each class studies.",
    'manage.fees': "The fees each class pays.",
    'manage.bus-stations': "The stops the school's buses serve.",
    'manage.users': "Sign-ins for staff, and what each one can open.",

    'attendance.entry': "Take today's attendance for a class.",
    'attendance.management': "Correct attendance that has already been taken.",
    'attendance.report': "A class's attendance over a period.",
    'attendance.overall': "Each student's attendance across the year.",
    'attendance.history': "One student's attendance, day by day.",
    'attendance.staff-entry': "Take today's attendance for staff.",
    'attendance.staff-management': "Correct staff attendance that has already been taken.",
    'attendance.staff-report': "Staff attendance over a period.",
    'attendance.staff-history': "One staff member's attendance, day by day.",
    'attendance.rfid.users-setup': "Give students and staff their attendance cards.",
    'attendance.rfid.registered-users': "Everyone who has an attendance card.",
    'attendance.rfid.attd-logs': "Every punch the card readers have sent.",
    'attendance.rfid.time-set': "The times that count as arriving and leaving.",

    'exams.setup': "The year's exams and the classes that sit them.",
    'exams.schedule-setup': "The date and time of each paper.",
    'exams.grading-rules-setup': "How marks turn into grades.",
    'exams.optional-subject-assignment': "Which students take which optional subject.",
    'exams.marks-entry': "Enter each student's marks once. Grades, marksheets and the class result come from them.",
    'exams.marks-entry-slip': "Blank slips for teachers to write marks on.",
    'exams.extra-activities-entry': "Grades for activities outside the classroom.",
    'exams.entry-cards': "Admit cards for the exam hall.",
    'exams.seat-plan': "Where each student sits in each room.",
    'exams.publish-results': "Make results visible to students and guardians.",

    'accounting.economic-year': "The accounting year the books are kept in.",
    'accounting.economic-year-closing': "Close the accounting year.",
    'accounting.create-ledger': "Add an account to the books.",
    'accounting.income-entry': "Record money received.",
    'accounting.expense-entry': "Record money spent.",
    'accounting.journal-entry': "Record a transfer between accounts.",
    'accounting.ledgers': "Every account in the books.",
    'accounting.reports.individual-ledger': "Every entry in one account.",
    'accounting.reports.day-book': "Every entry made on a day.",
    'accounting.reports.trial-balance': "Every account's debits and credits, side by side.",
    'accounting.reports.profit-loss': "Income against expenses for the period.",
    'accounting.reports.balance-sheet': "What the school owns and what it owes.",

    'library.books': "Every book in the library.",
    'library.bar-codes': "Print barcode labels for books.",
    'library.book-transaction': "Lend books out and take them back.",

    'communication.sms.settings': "The SMS account the school sends from.",
    'communication.sms.templates': "Messages saved to send again.",
    'communication.sms.bulk-sms': "Send one message to many guardians.",
    'communication.sms.staff-sms': "Send a message to staff.",
    'communication.sms.dues-reminder': "Remind guardians by SMS of the fees they owe.",
    'communication.sms.report': "Every message the school has sent.",
    'communication.birthday-cards': "Birthday cards for students and staff.",

    'support': "Get help from the SchoolCore team.",
    'guides': "Step-by-step guides to each part of SchoolCore.",
    'profile': "The school's name, address and the details printed on its documents.",
};

const SUPERADMIN = {
    'setup.client': "The schools on SchoolCore, and what each one has.",
    'ui-theme': "The colours each school's screens are drawn in.",
    'database-backup': "Download a backup of a school's data.",
    'my-password': "Change your own password.",
};

export function describePage(type, viewKey) {
    const key = String(viewKey || '');
    if (type === 'superadmin') return SUPERADMIN[key] || '';
    if (type === 'admin' || type === 'staff') return SCHOOL[key] || '';
    return '';
}
