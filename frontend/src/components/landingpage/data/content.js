// Everything the public website says. The components only lay it out.
//
// Every claim here is something the product does today: each module below is a
// group in the portal's own menu, and each point under it is a page in that
// group. The screens drawn on the site are examples (they say so beside them);
// their figures are fixed text that adds up, never worked out in the browser.

export const company = {
    name: "CentEducation",
    maker: "Cent IT Solutions Pvt. Ltd.",
    makerShort: "Cent IT Solutions",
    phone: "9815582814",
    address: "Tulsipur-6, Dang, Nepal",
    openDays: "Sunday to Friday",
    blurb: "A complete school management system, made in Dang. On the web, Android and iPhone.",
}

// What the Contact page shows until the live details arrive, and keeps if they
// never do. The same record the signed-out Support page falls back to.
export const supportFallback = {
    name: "Cent IT Solutions Pvt. Ltd.",
    address: "Madannagar, Tulsipur-6, Dang, Lumbini",
    open_days: "Sunday – Friday",
    open_time: "9:00 AM – 5:00 PM",
    open_from_hour: 9,
    open_to_hour: 17,
    closed_weekdays: [5],
    contact: "9815582814",
    email: "centit37@gmail.com",
    whatsapp_contact: "https://wa.me/9815582814",
    fb_page_id: "61579363944373",
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export const heroContent = {
    kicker: "School management system · Made in Dang, Nepal",
    titleStart: "Every bill, bell and bus.",
    titleMark: "One system.",
    subtitle:
        "CentEducation runs the fee counter, the attendance register, the exam section, the accounts and the bus route. In Bikram Sambat, on the web and on the phone.",
    primaryButton: "Book a demo",
    secondaryButton: "See every feature",
    facts: [
        { figure: "12", label: "modules under one sign-in" },
        { figure: "3", label: "ways in: web, Android, iPhone" },
        { figure: "BS", label: "dates and fiscal years throughout" },
        { figure: "1", label: "phone number for setup and support" },
    ],
}

// Runs across the band under the hero. The portal's own menu, read aloud.
export const tickerWords = [
    "Fees & billing",
    "Attendance",
    "Exams & results",
    "Accounts",
    "Payroll",
    "Bus tracking",
    "SMS & notices",
    "Library",
    "Hostel",
    "Inventory",
    "ID cards",
    "Reports",
]

// A school day. `from` is the minute of the day (Nepal time) the step starts
// at; the page uses it to say which part of the day it is in Tulsipur now.
export const schoolDay = {
    kicker: "A school day",
    title: "From the first bus to the evening's accounts.",
    subtitle: "An ordinary day when the office runs on CentEducation.",
    steps: [
        {
            time: "6:30",
            meridiem: "AM",
            from: 390,
            title: "The bus leaves",
            text: "The office sees every bus live on the map, and parents get an alert on the app as it nears their stop.",
            now: "the buses are on their routes",
        },
        {
            time: "10:00",
            meridiem: "AM",
            from: 600,
            title: "The register is done",
            text: "Students tap a card at the gate, or the teacher marks the class on the app. Parents of absent students hear about it the same morning.",
            now: "the register is being taken",
        },
        {
            time: "11:30",
            meridiem: "AM",
            from: 690,
            title: "The fee counter opens",
            text: "Find the student, tick the months, print the receipt. Discounts, old dues and the remaining balance are already worked out.",
            now: "the fee counter is open",
        },
        {
            time: "2:00",
            meridiem: "PM",
            from: 840,
            title: "Marks go in once",
            text: "Teachers enter marks by subject. Grades, marksheets and the class result all come out of that one entry.",
            now: "marks are going in",
        },
        {
            time: "6:00",
            meridiem: "PM",
            from: 1080,
            title: "The day is closed",
            text: "Management gets the day's collection by SMS. The ledgers and the trial balance are already up to date.",
            now: "the day's accounts are closed",
        },
    ],
}

export const modulesIntro = {
    kicker: "What is inside",
    title: "Twelve modules. One sign-in.",
    subtitle:
        "Each one replaces a register, a file or a spreadsheet the office keeps today. They share the same students, staff and accounts, so nothing is typed twice.",
    link: "See every feature",
}

// The twelve modules. `id` is the anchor on the Features page; `scene` names
// the drawing that goes with it (see product/drawings.jsx).
export const modules = [
    {
        id: "records",
        title: "Admissions & records",
        line: "Every student and staff member, entered once.",
        description: "Admission details, guardians, photos and documents for every student, found in seconds.",
        replaces: "the admission register",
        scene: "records",
        points: [
            "Admission with guardians, photo and documents",
            "Bulk enrolment and bulk updates, with photos matched to names",
            "Class promotion when the year ends",
            "ID cards printed from the school's own design",
            "Student numbers by class, at any moment",
        ],
    },
    {
        id: "fees",
        title: "Fees & billing",
        line: "The fee counter: find, tick, print.",
        description: "Post fees for a whole class, print receipts, give discounts, carry old dues forward and remind parents by SMS.",
        replaces: "receipt books and the dues register",
        scene: "payment",
        points: [
            "A month's fees posted to a whole class at once",
            "Receipts with discounts, old dues and the remaining balance worked out",
            "A fast cash receipt for the busy hour",
            "Reminder bills on paper, dues reminders by SMS",
            "Tax invoices where the school needs them",
            "Every receipt shows who entered it, and when",
        ],
    },
    {
        id: "accounts",
        title: "Accounts",
        line: "From the first voucher to the balance sheet.",
        description: "Vouchers, ledgers, trial balance, profit and loss and balance sheet, by Nepali fiscal year.",
        replaces: "the cash book and the ledger",
        scene: "accounts",
        points: [
            "Income, expense, journal and contra vouchers",
            "Day book and ledgers, one account or a whole group",
            "Trial balance, profit and loss, balance sheet and cash flow",
            "Nepali fiscal years, and closed years stay open to read",
        ],
    },
    {
        id: "payroll",
        title: "Payroll",
        line: "Salary day without a calculator.",
        description: "Salary sheets with TDS, provident fund and insurance worked out, and a pay slip for every staff member.",
        replaces: "the salary register",
        scene: "payroll",
        points: [
            "A salary sheet with TDS, provident fund and insurance worked out",
            "Salary posting and a ledger for each staff member",
            "A pay slip for everyone, on paper or on their own sign-in",
        ],
    },
    {
        id: "attendance",
        title: "Attendance",
        line: "The register takes itself.",
        description: "Card readers at the gate or one tap on the app, for students and staff. Monthly reports without a paper register.",
        replaces: "the attendance register",
        scene: "attendance",
        points: [
            "Card readers at the gate, or one tap per class on the app",
            "Students and staff, with the time in and the time out",
            "Parents of absent students told the same morning",
            "Monthly and whole-year reports, by class or by person",
        ],
    },
    {
        id: "exams",
        title: "Exams & results",
        line: "Marks go in once.",
        description: "Marks entry, letter grading, marksheets, seat plans and certificates, ready to print.",
        replaces: "the mark ledger",
        scene: "exam",
        points: [
            "Exam schedule, entry cards and seat plans",
            "Marks entry by subject, with a slip to check it against",
            "Percentage or letter grading, by the school's own grading rules",
            "Class results, marksheets and gradesheets, term and final",
            "Character certificates",
        ],
    },
    {
        id: "transport",
        title: "Transport",
        line: "Know where every bus is.",
        description: "Stations and routes, every bus live on a map, and an alert to the parent as it nears their stop.",
        replaces: "phone calls asking where the bus is",
        scene: "bus",
        points: [
            "Stations, and who boards at each one",
            "Every bus live on a map in the office",
            "An alert on the parent's phone as the bus nears their stop",
            "Transport fees on the same bill as tuition",
        ],
    },
    {
        id: "messages",
        title: "SMS, notices & the app",
        line: "One message, the right people.",
        description: "SMS and app notifications to one class or the whole school, with a record of what was sent.",
        replaces: "the notice diary",
        scene: "phone",
        points: [
            "SMS to a class, the staff or the whole school, from saved templates",
            "App notifications for fees, attendance and notices",
            "Notices, news and events on the app",
            "A report of every SMS sent and the credits it used",
            "Letters to students and birthday cards",
        ],
    },
    {
        id: "library",
        title: "Library",
        line: "Every book has a number and a borrower.",
        description: "A catalogue with accession numbers, issue and return at the desk, and a list of what is overdue.",
        replaces: "the issue register",
        scene: "library",
        points: [
            "A catalogue with accession numbers and printed bar codes",
            "Issue and return at the desk, for students and teachers",
            "Fines worked out, with a daily report",
            "What each member has borrowed, on one page",
        ],
    },
    {
        id: "hostel",
        title: "Hostel",
        line: "The warden's registers, in one place.",
        description: "Rooms and beds, roll call, gate passes, visitors and the mess menu, with hostel fees on the same bill.",
        replaces: "the warden's registers",
        scene: "hostel",
        points: [
            "Rooms and beds, and who is in which",
            "Roll call, gate passes and visitors",
            "Mess menu, complaints and a discipline register",
            "Hostel fees on the same bill as everything else",
        ],
    },
    {
        id: "inventory",
        title: "Inventory",
        line: "What the store has, and where it went.",
        description: "Items, purchases, issues and wastage, with the stock on hand worked out.",
        replaces: "the stock register",
        scene: "inventory",
        points: [
            "Items and categories",
            "Purchases coming in, issues going out",
            "Wastage written down, not forgotten",
            "Stock on hand, as a report",
        ],
    },
    {
        id: "reports",
        title: "Reports & your data",
        line: "Every list prints. Every list exports.",
        description: "Every list prints and exports to Excel. Pick the columns you want and the printout follows.",
        replaces: "hunting through old files",
        scene: "reports",
        points: [
            "Dues, ledgers, collections and admissions as ready reports",
            "Choose the columns: the printout and the Excel file follow",
            "A complete backup of the school's data, downloaded when you like",
            "Past years stay open to read after they are closed",
        ],
    },
]

export const setupNote = {
    title: "Set once, used everywhere",
    text: "Classes, sections, subjects, the fee structure, bus stations and the academic calendar are set up once. Every module reads from them.",
}

export const rolesIntro = {
    kicker: "Who it is for",
    title: "Everyone sees their own part of it.",
    subtitle: "One sign-in per person, and each person sees only what their work needs.",
    link: "See what each person gets",
}

export const roles = [
    {
        id: "management",
        title: "Principal & management",
        line: "The whole school on one screen.",
        scene: "dashboard",
        points: [
            "Today's attendance, collection and dues at a glance",
            "The day's collection by SMS every evening",
            "Any report, printed or exported in a click",
        ],
        more: "The dashboard opens on today: who is present, what was collected, what is still due. Nothing on it needs to be asked for.",
    },
    {
        id: "accountant",
        title: "Accountant",
        line: "The fee counter and the books, together.",
        scene: "payment",
        points: [
            "Fee posting for a whole class at once",
            "Receipts that show who entered them, and when",
            "Vouchers through to the balance sheet",
            "Payroll with TDS and provident fund",
        ],
        more: "A receipt printed at the counter is already in the student's ledger and in the day's collection. The books are never a second job.",
    },
    {
        id: "teachers",
        title: "Teachers",
        line: "Less register work, more class time.",
        scene: "exam",
        points: ["Class attendance from the phone", "Marks entry by subject and exam", "Their own pay slips and ledger"],
        more: "A teacher marks the class once and enters marks once. The register, the marksheet and the class result are made from that.",
    },
    {
        id: "parents",
        title: "Parents & students",
        line: "The school, on the phone in their hand.",
        scene: "phone",
        points: [
            "A notification when fees are billed or paid",
            "Attendance and absence alerts",
            "An alert as the bus nears their stop",
            "School notices as they are published",
        ],
        more: "Parents stop calling the office to ask. What they would ask is already on their phone.",
    },
]

export const rolesNote = {
    title: "The school decides who opens what",
    text: "Staff roles are set by the school. An accountant's sign-in opens the fee counter and the books; a teacher's opens their classes. Nobody is shown a page their work does not need.",
}

export const platformsIntro = {
    kicker: "Where it runs",
    title: "On the office computer. In a parent's pocket.",
    subtitle: "The same school, the same figures, wherever it is opened.",
}

export const platforms = [
    {
        id: 1,
        title: "Web",
        description: "Any browser, on any computer. Nothing to install in the office.",
        icon: "computer-desktop",
    },
    {
        id: 2,
        title: "Android",
        description: "For staff, students and parents, with notifications on the phone.",
        icon: "device-phone-mobile",
    },
    {
        id: 3,
        title: "iPhone",
        description: "The same account and the same data on iOS.",
        icon: "device-phone-mobile",
    },
]

export const whyJoinUs = {
    kicker: "Why CentEducation",
    title: "Built in Dang, for the way Nepali schools actually run.",
    subtitle: "The calendar, the fiscal year, the fee heads and the paperwork are the ones your office already uses.",
    yearNote: "This year, in the calendar your school already uses.",
    link: "Why schools choose it",
    features: [
        {
            title: "Bikram Sambat first",
            description:
                "Dates, months, fiscal years and every report follow the Nepali calendar. Nobody in the office converts anything.",
        },
        {
            title: "Set up with you",
            description:
                "We load your classes, students and fee structure with you, and train the office before the first receipt is printed.",
        },
        {
            title: "Works with your hardware",
            description:
                "Attendance card readers and bus GPS trackers feed the same system. No second software for the gate or the bus.",
        },
        {
            title: "Your data stays yours",
            description:
                "Download a complete backup of your school's records whenever you like. Past years stay open to read after they are closed.",
        },
    ],
}

// The Nepali months, as the school calendar names them.
export const bsMonths = [
    { ne: "बैशाख", en: "Baisakh" },
    { ne: "जेठ", en: "Jestha" },
    { ne: "असार", en: "Ashad" },
    { ne: "साउन", en: "Shrawan" },
    { ne: "भदौ", en: "Bhadra" },
    { ne: "असोज", en: "Ashwin" },
    { ne: "कात्तिक", en: "Kartik" },
    { ne: "मंसिर", en: "Mangsir" },
    { ne: "पुस", en: "Poush" },
    { ne: "माघ", en: "Magh" },
    { ne: "फागुन", en: "Falgun" },
    { ne: "चैत", en: "Chaitra" },
]

// Why page: the register on the left, what replaces it on the right.
export const beforeAfter = {
    kicker: "Register by register",
    title: "What changes in the office.",
    beforeLabel: "On paper",
    afterLabel: "On CentEducation",
    rows: [
        {
            what: "Fee receipt",
            before: "Written by hand from the receipt book, dues added up from the register.",
            after: "Printed in seconds, with discounts, old dues and the remaining balance already worked out.",
        },
        {
            what: "Attendance",
            before: "A register per class, counted at the end of the month.",
            after: "A card tap at the gate or one tap on the app. The month's report is ready any day.",
        },
        {
            what: "Results",
            before: "Marks copied from slips to the ledger, then to each marksheet.",
            after: "Marks entered once. Grades, marksheets and the class result come out of that entry.",
        },
        {
            what: "Accounts",
            before: "Cash book, ledger and trial balance kept separately from the fee counter.",
            after: "Every receipt is already in the books. The trial balance is up to date tonight.",
        },
        {
            what: "Telling parents",
            before: "A notice in the diary and a round of phone calls.",
            after: "One SMS or app notification to a class or the whole school, with a record of what was sent.",
        },
        {
            what: "The bus",
            before: "Parents call the office to ask where it is.",
            after: "The office sees it on the map, and the parent's phone says when it is near.",
        },
    ],
}

export const setupSteps = {
    kicker: "Getting started",
    title: "How a school starts.",
    steps: [
        { title: "A call", text: "Tell us about your school. We show you the system and answer your questions in plain words." },
        { title: "Set up together", text: "We load your classes, students and fee structure with you, so the first day starts with your own data." },
        { title: "The office is trained", text: "The people who will use it are trained before the first receipt is printed." },
        { title: "We stay on the phone", text: "The number you called at the start is the number you call afterwards." },
    ],
}

export const aboutContent = {
    kicker: "About",
    title: "A school system, made in Tulsipur.",
    subtitle:
        "CentEducation is made by Cent IT Solutions Pvt. Ltd. in Tulsipur, Dang. We make the software, set it up with the school, and stay on the phone afterwards.",
    story: [
        "A school office in Nepal runs on registers: one for admissions, one per class for attendance, a receipt book, a mark ledger, a cash book. Each is kept carefully, and each is copied from the last by hand.",
        "CentEducation keeps all of them as one record. A student is entered once. The fee counter, the class register, the marksheet, the bus list and the parent's phone all read from that entry, in the Bikram Sambat calendar the office already works in.",
    ],
    facts: [
        {
            term: "Mission",
            text: "Give schools technology that makes administration simple and leaves more time for learning.",
        },
        {
            term: "Vision",
            text: "Every school with management tools good enough that educators can simply teach.",
        },
        {
            term: "Values",
            text: "Reliable, simple to use, and built around the people who use it. Technology should serve education, not complicate it.",
        },
    ],
}

export const contactInfo = {
    kicker: "Contact",
    title: "Let us show you around.",
    subtitle:
        "Call us and tell us a little about your school. We will walk you through the system and answer your questions in plain words.",
    callLabel: "Call us",
    callButton: "Call now",
    existingTitle: "Already using CentEducation?",
    existingText: "Sign in to your portal, or open the help desk for guides and support.",
}

export const faqsIntro = {
    kicker: "Before you call",
    title: "Questions schools ask first.",
}

export const siteFaqs = [
    {
        question: "Does it work in Bikram Sambat?",
        answer: "Yes. Dates, months, academic years and fiscal years are all in the Nepali calendar, on every screen and every printout. Nobody in the office converts a date.",
    },
    {
        question: "What do we need to install?",
        answer: "Nothing in the office: it opens in a browser on any computer. Staff, students and parents can also use the app on Android or iPhone.",
    },
    {
        question: "We already have card readers at the gate and GPS on the buses. Can we keep them?",
        answer: "Attendance card readers and bus GPS trackers feed the same system. Tell us what you have when you call, and we will tell you plainly whether it connects.",
    },
    {
        question: "What happens to the records we already have?",
        answer: "We load your classes, students and fee structure with you before the first receipt is printed. Dues from earlier years are carried in as opening balances.",
    },
    {
        question: "Can each staff member see only their own work?",
        answer: "Yes. The school sets its own staff roles, and each sign-in opens only the pages that role is given.",
    },
    {
        question: "Can we take our data out?",
        answer: "Yes. A school admin can download a complete backup of the school's records at any time, and past years stay open to read after they are closed.",
    },
    {
        question: "How much does it cost?",
        answer: "It depends on the size of the school and the modules it will use. Call us and we will give you a figure for your school.",
    },
]

// ---------------------------------------------------------------------------
// The sections below are not on the site at present. Their copy is kept as it
// was, for the older components that still read it.
// ---------------------------------------------------------------------------

// Testimonials
export const testimonials = [
    {
        id: 1,
        name: "Dr. Sarah Johnson",
        role: "Principal",
        institution: "Greenwood Academy",
        image: "/placeholder.svg?height=80&width=80",
        rating: 5,
        text: "CentEducation didn't just change our school—it saved it. We went from drowning in admin work to having extra hours weekly for actual education. Parent complaints dropped significantly, and our staff morale is at an all-time high.",
    },
    {
        id: 2,
        name: "Michael Chen",
        role: "IT Director",
        institution: "Metro University",
        image: "/placeholder.svg?height=80&width=80",
        rating: 5,
        text: "I've implemented dozens of systems in my career. CentEducation's rollout was flawless—zero downtime, zero complaints. Our faculty adoption rate was exceptional from week one.",
    },
    {
        id: 3,
        name: "Lisa Rodriguez",
        role: "Administrator",
        institution: "Sunrise Elementary",
        image: "/placeholder.svg?height=80&width=80",
        rating: 5,
        text: "The ROI was immediate and dramatic. We eliminated several part-time admin positions through automation alone, saving significantly annually. But the real win? Our teachers can finally focus on teaching, not paperwork.",
    },
    {
        id: 4,
        name: "David Thompson",
        role: "Dean",
        institution: "Tech Institute",
        image: "/placeholder.svg?height=80&width=80",
        rating: 5,
        text: "Fee collection used to be our nightmare—now it's automated perfection. Late payments dropped significantly, cash flow improved dramatically, and parents actually thank us for the convenient payment options.",
    },
]

// FAQs
export const faqs = [
    {
        id: 1,
        question: "How long does it take to implement CentEducation?",
        answer:
            "Implementation typically takes 24-48 hours depending on your institution size. Our team handles data migration, system setup, and initial training to ensure a smooth transition.",
        icon: "clock",
    },
    {
        id: 2,
        question: "Is my data secure with CentEducation?",
        answer:
            "Absolutely. We use bank-level encryption, secure cloud infrastructure, and comply with all educational data privacy regulations. Your data is backed up daily and stored in multiple secure locations.",
        icon: "shield-check",
    },
    {
        id: 3,
        question: "Can I customize CentEducation for my institution's specific needs?",
        answer:
            "Yes, CentEducation is highly customizable. We can adapt the system to match your existing workflows, add custom fields, and integrate with your current tools and systems.",
        icon: "cog-6-tooth",
    },
    {
        id: 4,
        question: "What kind of support do you provide?",
        answer:
            "We provide 24/7 technical support, comprehensive training for your staff, regular system updates, and dedicated account management. Our support team is always ready to help.",
        icon: "life-buoy",
    },
    {
        id: 5,
        question: "How much does CentEducation cost?",
        answer:
            "Our pricing is based on your institution size and specific needs. We offer flexible plans starting from affordable monthly subscriptions. Contact us for a personalized quote.",
        icon: "currency-dollar",
    },
    {
        id: 6,
        question: "Can I try CentEducation before committing?",
        answer:
            "Yes! We offer a free 30-day trial with full access to all features. Our team will help you set up a demo environment with sample data to test the system thoroughly.",
        icon: "play",
    },
    {
        id: 7,
        question: "Does CentEducation work offline?",
        answer:
            "Our mobile apps have offline capabilities for essential functions like attendance marking and grade entry. Data syncs automatically when you're back online.",
        icon: "wifi",
    },
    {
        id: 8,
        question: "How do you handle system updates?",
        answer:
            "Updates are deployed automatically without any downtime. We release new features monthly and security updates as needed. You'll always have access to the latest version.",
        icon: "arrow-path",
    },
]

// Featured Clients
export const clients = [
    {
        id: 1,
        name: "Greenwood Academy",
        logo: "/placeholder.svg?height=80&width=200",
        description: "Leading private school",
    },
    {
        id: 2,
        name: "Metro University",
        logo: "/placeholder.svg?height=80&width=200",
        description: "State university system",
    },
    {
        id: 3,
        name: "Sunrise Elementary",
        logo: "/placeholder.svg?height=80&width=200",
        description: "Public elementary school",
    },
    {
        id: 4,
        name: "Tech Institute",
        logo: "/placeholder.svg?height=80&width=200",
        description: "Technical education center",
    },
    {
        id: 5,
        name: "Global College",
        logo: "/placeholder.svg?height=80&width=200",
        description: "International college",
    },
    {
        id: 6,
        name: "Future High School",
        logo: "/placeholder.svg?height=80&width=200",
        description: "Modern high school",
    },
]
