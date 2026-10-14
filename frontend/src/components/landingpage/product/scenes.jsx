import { CheckIcon, PrinterIcon } from "@heroicons/react/24/outline"
import { cx } from "../site/ui"
import styles from "./product.module.css"

// Drawings of the portal's screens, not the screens themselves. Each one is a
// single picture to a screen reader (its `label`), and every figure in it is
// fixed text: the sums below are done here, in the comments, not in a browser.

const SEATS = Array.from({ length: 40 }, (_, index) => index + 1)
const ABSENT_SEATS = [17, 32] // 40 seats, 38 present, 2 absent

function Scene({ label, children, className }) {
    return (
        <div className={cx(styles.scene, className)} role="img" aria-label={label}>
            {children}
        </div>
    )
}

/** A ring filled to a whole percentage. The circle's circumference is 100. */
function Ring({ percent, tone }) {
    return (
        <svg viewBox="0 0 36 36" className={styles.ring} aria-hidden="true">
            <circle cx="18" cy="18" r="15.9155" className={styles.ringTrack} />
            <circle
                cx="18"
                cy="18"
                r="15.9155"
                className={cx(styles.ringFill, tone === "sun" && styles.ringSun)}
                strokeDasharray={`${percent} ${100 - percent}`}
            />
        </svg>
    )
}

// 608 of 640 students and 38 of 40 staff are both exactly 95%.
// 352 boys and 288 girls are 55% and 45% of 640.
export function DashboardScene() {
    const tiles = [
        { label: "Students", figure: "640", tone: "teal" },
        { label: "Staff", figure: "40", tone: "sun" },
        { label: "Fees today", figure: "Rs 1,84,500", tone: "pine" },
        { label: "SMS credits", figure: "2,350", tone: "sage" },
    ]
    // Shrawan, Bhadra and Ashwin have been collected; Ashwin is the month in progress.
    const months = [62, 78, 54, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    // the bars are 100%, 75% and 50% of the longest: 80, 60 and 40 students
    const stations = [
        { name: "Station 3", count: "80", size: "full" },
        { name: "Station 1", count: "60", size: "three-quarters" },
        { name: "Station 5", count: "40", size: "half" },
    ]
    return (
        <Scene label="The school dashboard: 640 students, 40 staff, Rs 1,84,500 collected today, and today's attendance at 95 percent for students and staff">
            <div className={styles.kpis}>
                {tiles.map((tile) => (
                    <div key={tile.label} className={styles.kpi}>
                        <span className={styles.kpiChip} data-tone={tile.tone} />
                        <span className={styles.kpiLabel}>{tile.label}</span>
                        <span className={styles.kpiFigure}>{tile.figure}</span>
                    </div>
                ))}
            </div>
            <div className={styles.dashRow}>
                <div className={styles.tile}>
                    <p className={styles.tileTitle}>Today's attendance</p>
                    <div className={styles.roster}>
                        <Ring percent={95} />
                        <div>
                            <p className={styles.rosterFigure}>
                                608 <span>of 640 students</span>
                            </p>
                            <p className={styles.rosterNote}>95% present · 32 absent</p>
                        </div>
                    </div>
                    <div className={styles.roster}>
                        <Ring percent={95} tone="sun" />
                        <div>
                            <p className={styles.rosterFigure}>
                                38 <span>of 40 staff</span>
                            </p>
                            <p className={styles.rosterNote}>95% present · 2 absent</p>
                        </div>
                    </div>
                </div>
                <div className={styles.tile}>
                    <p className={styles.tileTitle}>Fee collections</p>
                    <p className={styles.collected}>
                        Rs 21,36,000 <span>this month</span>
                    </p>
                    <div className={styles.columns}>
                        {months.map((height, index) => (
                            <span
                                key={index}
                                className={cx(styles.column, index === 2 && styles.columnNow, height === 0 && styles.columnEmpty)}
                                style={height ? { height: `${height}px` } : undefined}
                            />
                        ))}
                    </div>
                    <p className={styles.columnsFoot}>
                        <span>Shrawan</span>
                        <span>Ashad</span>
                    </p>
                </div>
            </div>
            <div className={cx(styles.dashRow, styles.dashWide)}>
                <div className={styles.tile}>
                    <p className={styles.tileTitle}>Students by gender</p>
                    <p className={styles.split}>
                        <span className={styles.splitA} />
                        <span className={styles.splitB} />
                    </p>
                    <p className={styles.splitFoot}>
                        <span>Boys 352 · 55%</span>
                        <span>Girls 288 · 45%</span>
                    </p>
                </div>
                <div className={styles.tile}>
                    <p className={styles.tileTitle}>Busiest stations</p>
                    <ul className={styles.ranks}>
                        {stations.map((station) => (
                            <li key={station.name} className={styles.rank}>
                                <span>{station.name}</span>
                                <span className={styles.rankBar} data-size={station.size} />
                                <span>{station.count}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </Scene>
    )
}

// 3,500 + 1,200 + 500 - 200 = 5,000.
export const BILL = {
    student: "Class 7 'A' · Roll no. 14",
    number: "No. 000482",
    date: "2083-06-22",
    lines: [
        { label: "Tuition fee · Ashwin", amount: "3,500.00" },
        { label: "Transport · Ashwin", amount: "1,200.00" },
        { label: "Exam fee · First term", amount: "500.00" },
        { label: "Discount", amount: "−200.00", soft: true },
    ],
    total: "Rs 5,000.00",
    dues: "Rs 0.00",
    enteredBy: "Entered by accounts",
    enteredAt: "11:42 AM",
}

export function Receipt({ className }) {
    return (
        <div className={cx(styles.receipt, className)}>
            <div className={styles.receiptHead}>
                <div>
                    <p className={styles.receiptSchool}>Your School Name</p>
                    <p className={styles.receiptMuted}>Fee receipt</p>
                </div>
                <div className={styles.receiptNo}>
                    <p>{BILL.number}</p>
                    <p className={styles.receiptMuted}>{BILL.date}</p>
                </div>
            </div>
            <p className={styles.receiptStudent}>{BILL.student}</p>
            <div className={styles.receiptLines}>
                {BILL.lines.map((line) => (
                    <p key={line.label} className={cx(styles.receiptLine, line.soft && styles.receiptSoft)}>
                        <span>{line.label}</span>
                        <span>{line.amount}</span>
                    </p>
                ))}
            </div>
            <p className={styles.receiptTotal}>
                <span>Total paid</span>
                <span>{BILL.total}</span>
            </p>
            <p className={styles.receiptDues}>
                <span>Remaining dues</span>
                <span>{BILL.dues}</span>
            </p>
            <p className={styles.receiptFoot}>
                {BILL.enteredBy}
                <br />
                {BILL.enteredAt}
            </p>
            <span className={styles.stamp}>PAID</span>
        </div>
    )
}

export function PaymentScene() {
    const months = [
        { name: "Shrawan", state: "paid" },
        { name: "Bhadra", state: "paid" },
        { name: "Ashwin", state: "picked" },
        { name: "Kartik", state: "open" },
    ]
    return (
        <Scene label="The fee counter: a student of class 7 A pays tuition, transport and exam fees for Ashwin, less a discount, Rs 5,000 in all, and the receipt is printed with no dues remaining">
            <div className={styles.payGrid}>
                <div className={styles.tile}>
                    <p className={styles.payStudent}>
                        <span className={styles.avatar} />
                        <span>
                            <span className={styles.payName}>{BILL.student}</span>
                            <span className={styles.payMeta}>Bus: Station 3 · Dues Rs 5,000.00</span>
                        </span>
                    </p>
                    <div className={styles.monthChips}>
                        {months.map((month) => (
                            <span key={month.name} className={styles.monthChip} data-state={month.state}>
                                {month.state === "paid" && <CheckIcon />}
                                {month.name}
                            </span>
                        ))}
                    </div>
                    <div className={styles.billLines}>
                        {BILL.lines.map((line) => (
                            <p key={line.label} className={cx(styles.billLine, line.soft && styles.receiptSoft)}>
                                <span>{line.label}</span>
                                <span>{line.amount}</span>
                            </p>
                        ))}
                        <p className={styles.billTotal}>
                            <span>To pay</span>
                            <span>{BILL.total}</span>
                        </p>
                    </div>
                    <span className={styles.printButton}>
                        <PrinterIcon />
                        Print receipt
                    </span>
                </div>
                <Receipt className={styles.payReceipt} />
            </div>
        </Scene>
    )
}

export function SeatGrid() {
    return (
        <div className={styles.seats}>
            {SEATS.map((seat) => (
                <span key={seat} className={cx(styles.seat, ABSENT_SEATS.includes(seat) && styles.seatAbsent)} />
            ))}
        </div>
    )
}

export function AttendanceScene() {
    const taps = [
        { time: "9:41 AM", who: "Roll no. 08" },
        { time: "9:43 AM", who: "Roll no. 21" },
        { time: "9:44 AM", who: "Roll no. 35" },
        { time: "9:46 AM", who: "Roll no. 02" },
    ]
    return (
        <Scene label="Attendance for class 7 A: 38 of 40 students present, 2 absent, and an SMS sent to the parents of both absent students">
            <div className={styles.attGrid}>
                <div className={styles.tile}>
                    <p className={styles.tileHead}>
                        <span className={styles.tileTitle}>Class 7 'A'</span>
                        <span className={styles.tileMeta}>Today, 10:05 AM</span>
                    </p>
                    <SeatGrid />
                    <p className={styles.attCount}>
                        <span className={styles.attPresent}>38 present</span>
                        <span className={styles.attAbsent}>2 absent</span>
                    </p>
                    <p className={styles.attNote}>
                        <CheckIcon />
                        Absent SMS sent to 2 parents
                    </p>
                </div>
                <div className={styles.tile}>
                    <p className={styles.tileHead}>
                        <span className={styles.tileTitle}>At the gate</span>
                        <span className={styles.live}>
                            <span className={styles.liveDot} />
                            Live
                        </span>
                    </p>
                    <ul className={styles.taps}>
                        {taps.map((tap) => (
                            <li key={tap.time} className={styles.tap}>
                                <span className={styles.tapCard} />
                                <span className={styles.tapWho}>{tap.who}</span>
                                <span className={styles.tapTime}>{tap.time}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </Scene>
    )
}

// Letter grades as the national scale has them: 90 and over A+, 80 A, 70 B+,
// 60 B, 50 C+.
export const MARKS = [
    { roll: "01", marks: "92", grade: "A+" },
    { roll: "02", marks: "84", grade: "A" },
    { roll: "03", marks: "76", grade: "B+" },
    { roll: "04", marks: "68", grade: "B" },
    { roll: "05", marks: "55", grade: "C+" },
]

export function ExamScene() {
    const made = ["Class result", "Gradesheets", "Marks entry slip"]
    return (
        <Scene label="Marks entry for Science, first term: marks typed once for each roll number, with the letter grade worked out beside each, and the class result and gradesheets made from the same entry">
            <div className={styles.examGrid}>
                <div className={styles.tile}>
                    <p className={styles.tileHead}>
                        <span className={styles.tileTitle}>Marks entry</span>
                        <span className={styles.tileMeta}>Science · First term</span>
                    </p>
                    <div className={styles.marks}>
                        <p className={cx(styles.marksRow, styles.marksHead)}>
                            <span>Roll</span>
                            <span>Marks / 100</span>
                            <span>Grade</span>
                        </p>
                        {MARKS.map((row) => (
                            <p key={row.roll} className={styles.marksRow}>
                                <span>{row.roll}</span>
                                <span className={styles.marksCell}>{row.marks}</span>
                                <span className={styles.grade}>{row.grade}</span>
                            </p>
                        ))}
                    </div>
                </div>
                <div className={cx(styles.tile, styles.madeTile)}>
                    <p className={styles.tileTitle}>From this one entry</p>
                    <ul className={styles.made}>
                        {made.map((item) => (
                            <li key={item}>
                                <CheckIcon />
                                {item}
                            </li>
                        ))}
                    </ul>
                    <p className={styles.madeFoot}>
                        <span className={styles.madeFigure}>40 of 40</span>
                        entered for 7 'A'
                    </p>
                </div>
            </div>
        </Scene>
    )
}

/** The route: five stops, the bus at the third. Drawn once, used in two sizes. */
export function RouteMap({ className }) {
    return (
        <svg viewBox="0 0 320 190" className={cx(styles.map, className)} aria-hidden="true">
            <rect width="320" height="190" className={styles.mapGround} />
            <path d="M-10 52h340M-10 138h340M70-10v210M205-10v210M262-10v210" className={styles.mapRoad} />
            <path d="M-10 96 120 84l90 26 120-18" className={styles.mapRoadWide} />
            <rect x="84" y="20" width="44" height="22" rx="4" className={styles.mapBlock} />
            <rect x="218" y="150" width="32" height="24" rx="4" className={styles.mapBlock} />
            <rect x="20" y="150" width="38" height="24" rx="4" className={styles.mapBlock} />
            <path d="M34 150 70 96l50-12 44 14" className={styles.routeDone} />
            <path d="M164 98 210 110l52-8 28-52" className={styles.routeAhead} />
            <circle cx="34" cy="150" r="5.5" className={styles.stopDone} />
            <circle cx="70" cy="96" r="5.5" className={styles.stopDone} />
            <circle cx="262" cy="102" r="5.5" className={styles.stopAhead} />
            <circle cx="290" cy="50" r="7" className={styles.stopSchool} />
            <circle cx="164" cy="98" r="15" className={styles.busHalo} />
            <circle cx="164" cy="98" r="8.5" className={styles.busDot} />
            <text x="290" y="34" textAnchor="middle" className={styles.mapLabel}>
                School
            </text>
            <text x="34" y="172" textAnchor="middle" className={styles.mapLabel}>
                Stop 1
            </text>
        </svg>
    )
}

export function BusScene() {
    return (
        <Scene label="Live bus tracking: bus 2 on its morning route, at stop 3 of 5, about 4 minutes from the next stop, with the parents waiting there already alerted">
            <div className={styles.busGrid}>
                <div className={cx(styles.tile, styles.mapTile)}>
                    <RouteMap />
                </div>
                <div className={cx(styles.tile, styles.busTile)}>
                    <p className={styles.tileHead}>
                        <span className={styles.tileTitle}>Bus 2</span>
                        <span className={styles.live}>
                            <span className={styles.liveDot} />
                            Live
                        </span>
                    </p>
                    <p className={styles.tileMeta}>Morning route</p>
                    <p className={styles.busFigure}>
                        Stop 3 <span>of 5</span>
                    </p>
                    <p className={styles.busNote}>Next stop in about 4 min</p>
                    <p className={styles.attNote}>
                        <CheckIcon />
                        Parents at the next stop alerted
                    </p>
                </div>
            </div>
        </Scene>
    )
}

// Debits: 2,45,000 + 6,10,000 + 1,75,000 = 10,30,000.
// Credits: 7,80,000 + 2,50,000 = 10,30,000.
export const TRIAL_BALANCE = [
    { account: "Cash in hand", debit: "2,45,000.00" },
    { account: "Bank", debit: "6,10,000.00" },
    { account: "Fee income", credit: "7,80,000.00" },
    { account: "Salary expense", debit: "1,75,000.00" },
    { account: "Capital", credit: "2,50,000.00" },
]

export function AccountsScene() {
    return (
        <Scene label="A trial balance for Ashwin 2083: five accounts whose debits and credits both come to Rs 10,30,000">
            <div className={styles.tile}>
                <p className={styles.tileHead}>
                    <span className={styles.tileTitle}>Trial balance</span>
                    <span className={styles.tileMeta}>Ashwin 2083</span>
                </p>
                <div className={styles.ledger}>
                    <p className={cx(styles.ledgerRow, styles.marksHead)}>
                        <span>Account</span>
                        <span>Debit</span>
                        <span>Credit</span>
                    </p>
                    {TRIAL_BALANCE.map((row) => (
                        <p key={row.account} className={styles.ledgerRow}>
                            <span>{row.account}</span>
                            <span>{row.debit || ""}</span>
                            <span>{row.credit || ""}</span>
                        </p>
                    ))}
                    <p className={cx(styles.ledgerRow, styles.ledgerTotal)}>
                        <span>Total</span>
                        <span>10,30,000.00</span>
                        <span>10,30,000.00</span>
                    </p>
                </div>
                <p className={styles.attNote}>
                    <CheckIcon />
                    Debits and credits agree
                </p>
            </div>
        </Scene>
    )
}

export function RecordsScene() {
    const fields = [
        ["Admission no.", "2083-0142"],
        ["Class", "7 'A' · Roll no. 14"],
        ["Guardian", "On file"],
        ["Bus", "Station 3"],
        ["Documents", "3 attached"],
    ]
    return (
        <Scene label="A student's record, with admission number, class, guardian, bus station and documents, beside the ID card printed from it">
            <div className={styles.recGrid}>
                <div className={styles.tile}>
                    <p className={styles.tileHead}>
                        <span className={styles.tileTitle}>Student record</span>
                        <span className={styles.tileMeta}>Running</span>
                    </p>
                    <dl className={styles.fields}>
                        {fields.map(([term, value]) => (
                            <div key={term} className={styles.field}>
                                <dt>{term}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
                <div className={styles.idCard}>
                    <p className={styles.idSchool}>Your School Name</p>
                    <span className={styles.idPhoto} />
                    <p className={styles.idName}>Student's name</p>
                    <p className={styles.idMeta}>Class 7 'A' · Roll no. 14</p>
                    <span className={styles.idCode} />
                </div>
            </div>
        </Scene>
    )
}

// Gross: 40,000 + 5,000 = 45,000. TDS is 1% of the gross (450), provident
// fund 10% of the basic (4,000). Net: 45,000 - 450 - 4,000 - 500 = 40,050.
const PAY_SLIP = [
    { label: "Basic salary", amount: "40,000.00" },
    { label: "Allowance", amount: "5,000.00" },
    { label: "Gross", amount: "45,000.00", strong: true },
    { label: "TDS · 1%", amount: "−450.00", soft: true },
    { label: "Provident fund · 10% of basic", amount: "−4,000.00", soft: true },
    { label: "Insurance", amount: "−500.00", soft: true },
]

export function PayrollScene() {
    return (
        <Scene label="A pay slip for Ashwin 2083: a gross salary of Rs 45,000, less TDS, provident fund and insurance, leaves Rs 40,050 to pay">
            <div className={styles.tile}>
                <p className={styles.tileHead}>
                    <span className={styles.tileTitle}>Pay slip</span>
                    <span className={styles.tileMeta}>Ashwin 2083</span>
                </p>
                <div className={styles.billLines}>
                    {PAY_SLIP.map((line) => (
                        <p
                            key={line.label}
                            className={cx(styles.billLine, line.soft && styles.receiptSoft, line.strong && styles.billStrong)}>
                            <span>{line.label}</span>
                            <span>{line.amount}</span>
                        </p>
                    ))}
                    <p className={styles.billTotal}>
                        <span>Net pay</span>
                        <span>Rs 40,050.00</span>
                    </p>
                </div>
            </div>
        </Scene>
    )
}

// The fine is Rs 5 a day: 3 days late is Rs 15.
const LOANS = [
    { number: "1042", title: "Science, Class 7", note: "Due 2083-06-22", state: "Issued" },
    { number: "0877", title: "Nepali Byakaran", note: "Back on the shelf", state: "Returned", tone: "done" },
    { number: "1210", title: "Mathematics, Class 8", note: "3 days late · fine Rs 15.00", state: "Overdue", tone: "late" },
]

export function LibraryScene() {
    return (
        <Scene label="The library desk: three books by accession number, one issued, one returned and one three days overdue with a fine of Rs 15">
            <div className={styles.tile}>
                <p className={styles.tileHead}>
                    <span className={styles.tileTitle}>Issue and return</span>
                    <span className={styles.tileMeta}>Today</span>
                </p>
                <ul className={styles.loans}>
                    {LOANS.map((loan) => (
                        <li key={loan.number} className={styles.loan}>
                            <span className={styles.loanNo}>{loan.number}</span>
                            <span className={styles.loanBody}>
                                <span className={styles.loanTitle}>{loan.title}</span>
                                <span className={styles.loanNote}>{loan.note}</span>
                            </span>
                            <span className={styles.loanState} data-tone={loan.tone}>
                                {loan.state}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </Scene>
    )
}

// Four rooms of four beds: 16 residents, 14 in and 2 out on a gate pass.
const ROOMS = [
    { name: "101", beds: ["in", "in", "in", "in"] },
    { name: "102", beds: ["in", "in", "out", "in"] },
    { name: "103", beds: ["in", "in", "in", "in"] },
    { name: "104", beds: ["in", "out", "in", "in"] },
]

export function HostelScene() {
    return (
        <Scene label="The hostel at evening roll call: four rooms of four beds, 14 of 16 residents in and 2 out on a gate pass">
            <div className={styles.tile}>
                <p className={styles.tileHead}>
                    <span className={styles.tileTitle}>Block A · Roll call</span>
                    <span className={styles.tileMeta}>9:00 PM</span>
                </p>
                <div className={styles.rooms}>
                    {ROOMS.map((room) => (
                        <div key={room.name} className={styles.room}>
                            <p className={styles.roomName}>Room {room.name}</p>
                            <p className={styles.beds}>
                                {room.beds.map((bed, index) => (
                                    <span key={index} className={styles.bed} data-state={bed} />
                                ))}
                            </p>
                        </div>
                    ))}
                </div>
                <p className={styles.attCount}>
                    <span>14 of 16 in</span>
                    <span className={styles.attAbsent}>2 on a gate pass</span>
                </p>
            </div>
        </Scene>
    )
}

// On hand = purchased - issued - wasted: 500 - 320 - 0, 60 - 43 - 2, 120 - 96 - 4.
const STOCK = [
    { item: "Exercise books", purchased: "500", issued: "320", wasted: "0", onHand: "180" },
    { item: "Chalk boxes", purchased: "60", issued: "43", wasted: "2", onHand: "15" },
    { item: "Board markers", purchased: "120", issued: "96", wasted: "4", onHand: "20" },
]

export function InventoryScene() {
    return (
        <Scene label="A stock report: for three items, what was purchased, issued and wasted, and what is left on hand">
            <div className={styles.tile}>
                <p className={styles.tileHead}>
                    <span className={styles.tileTitle}>Stock on hand</span>
                    <span className={styles.tileMeta}>Ashwin 2083</span>
                </p>
                <div className={styles.ledger}>
                    <p className={cx(styles.stockRow, styles.marksHead)}>
                        <span>Item</span>
                        <span>In</span>
                        <span>Out</span>
                        <span>Waste</span>
                        <span>Left</span>
                    </p>
                    {STOCK.map((row) => (
                        <p key={row.item} className={styles.stockRow}>
                            <span>{row.item}</span>
                            <span>{row.purchased}</span>
                            <span>{row.issued}</span>
                            <span>{row.wasted}</span>
                            <span className={styles.stockLeft}>{row.onHand}</span>
                        </p>
                    ))}
                </div>
            </div>
        </Scene>
    )
}

// 40 + 38 + 42 = 120 students. 62,500 + 48,000 + 71,250 = 1,81,750.
const DUES = [
    { name: "Class 7 'A'", students: "40", dues: "62,500.00" },
    { name: "Class 7 'B'", students: "38", dues: "48,000.00" },
    { name: "Class 8 'A'", students: "42", dues: "71,250.00" },
]

export function ReportsScene() {
    const columns = [
        { name: "Class", shown: true },
        { name: "Students", shown: true },
        { name: "Dues", shown: true },
        { name: "Phone", shown: false },
    ]
    return (
        <Scene label="A dues report by class with its columns chosen: three classes, 120 students and Rs 1,81,750 due in all, ready to print or export to Excel">
            <div className={styles.tile}>
                <p className={styles.tileHead}>
                    <span className={styles.tileTitle}>Remaining dues</span>
                    <span className={styles.tileMeta}>Print · Excel</span>
                </p>
                <p className={styles.monthChips}>
                    {columns.map((column) => (
                        <span key={column.name} className={styles.monthChip} data-state={column.shown ? "picked" : "open"}>
                            {column.shown && <CheckIcon />}
                            {column.name}
                        </span>
                    ))}
                </p>
                <div className={styles.ledger}>
                    <p className={cx(styles.ledgerRow, styles.marksHead)}>
                        <span>Class</span>
                        <span>Students</span>
                        <span>Dues</span>
                    </p>
                    {DUES.map((row) => (
                        <p key={row.name} className={styles.ledgerRow}>
                            <span>{row.name}</span>
                            <span>{row.students}</span>
                            <span>{row.dues}</span>
                        </p>
                    ))}
                    <p className={cx(styles.ledgerRow, styles.ledgerTotal)}>
                        <span>Total</span>
                        <span>120</span>
                        <span>1,81,750.00</span>
                    </p>
                </div>
            </div>
        </Scene>
    )
}
