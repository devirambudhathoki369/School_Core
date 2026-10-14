import { cx } from "../site/ui"
import {
    AccountsScene,
    AttendanceScene,
    BusScene,
    DashboardScene,
    ExamScene,
    HostelScene,
    InventoryScene,
    LibraryScene,
    PaymentScene,
    PayrollScene,
    RecordsScene,
    ReportsScene,
} from "./scenes"
import { NoteList } from "./Phone"
import styles from "./product.module.css"

/** What reaches a parent's phone, as a screen of its own. */
function PhoneNotes() {
    return (
        <div
            className={styles.scene}
            role="img"
            aria-label="Four notifications on a parent's phone: the bus is near, the student is present, a fee was received, and a notice from the school">
            <NoteList />
        </div>
    )
}

// The drawing for each `scene` named in data/content.js.
export const DRAWINGS = {
    dashboard: DashboardScene,
    records: RecordsScene,
    payment: PaymentScene,
    accounts: AccountsScene,
    payroll: PayrollScene,
    attendance: AttendanceScene,
    exam: ExamScene,
    bus: BusScene,
    phone: PhoneNotes,
    library: LibraryScene,
    hostel: HostelScene,
    inventory: InventoryScene,
    reports: ReportsScene,
}

/** A drawing on its pine mount, marked as sample data. */
export function Frame({ scene, className, ...rest }) {
    const Drawing = DRAWINGS[scene]
    return (
        <figure className={cx(styles.frame, className)} {...rest}>
            <div className={styles.frameIn}>
                <Drawing />
            </div>
            <figcaption className={styles.frameNote}>Sample data</figcaption>
        </figure>
    )
}
