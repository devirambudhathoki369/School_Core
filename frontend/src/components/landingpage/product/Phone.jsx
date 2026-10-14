import { BanknotesIcon, BellAlertIcon, CheckBadgeIcon, MapPinIcon } from "@heroicons/react/24/solid"
import { cx } from "../site/ui"
import styles from "./product.module.css"

// What a parent's phone shows on an ordinary day. The fee figures are the ones
// on the receipt drawn elsewhere on the site.
const NOTES = [
    {
        icon: MapPinIcon,
        tone: "sun",
        title: "Bus 2 is near your stop",
        text: "About 4 minutes away.",
        time: "6:52 AM",
    },
    {
        icon: CheckBadgeIcon,
        tone: "teal",
        title: "Present today",
        text: "Checked in at 9:43 AM.",
        time: "9:43 AM",
    },
    {
        icon: BanknotesIcon,
        tone: "pine",
        title: "Fee received",
        text: "Rs 5,000.00 for Ashwin. Remaining dues Rs 0.00.",
        time: "11:42 AM",
    },
    {
        icon: BellAlertIcon,
        tone: "sand",
        title: "Notice from the school",
        text: "Parents' meeting on Friday at 11 AM.",
        time: "2:10 PM",
    },
]

/** The notifications themselves, without the phone around them. */
export function NoteList({ count = NOTES.length, from = 0 }) {
    return (
        <ul className={styles.notes}>
            {NOTES.slice(from, from + count).map((note) => {
                const NoteIcon = note.icon
                return (
                    <li key={note.title} className={styles.note}>
                        <span className={styles.noteIcon} data-tone={note.tone}>
                            <NoteIcon />
                        </span>
                        <span className={styles.noteBody}>
                            <span className={styles.noteHead}>
                                <span className={styles.noteTitle}>{note.title}</span>
                                <span className={styles.noteTime}>{note.time}</span>
                            </span>
                            <span className={styles.noteText}>{note.text}</span>
                        </span>
                    </li>
                )
            })}
        </ul>
    )
}

/** A drawing of the app on a parent's phone: one picture to a screen reader. */
export default function Phone({ className }) {
    return (
        <div
            className={cx(styles.phone, className)}
            role="img"
            aria-label="The app on a parent's phone, showing four notifications from the school: the bus is near, the student is present, a fee was received, and a notice">
            <div className={styles.phoneScreen}>
                <p className={styles.phoneBar}>
                    <span>2:14</span>
                    <span className={styles.phoneNotch} />
                    <span className={styles.phoneSignal} />
                </p>
                <p className={styles.phoneTitle}>Today</p>
                <NoteList />
            </div>
        </div>
    )
}
