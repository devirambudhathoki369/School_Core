import { useEffect, useRef, useState } from "react"
import {
    AcademicCapIcon,
    BanknotesIcon,
    ClipboardDocumentCheckIcon,
    MapIcon,
    Squares2X2Icon,
} from "@heroicons/react/24/outline"
import { cx, useSite } from "../site/ui"
import { AttendanceScene, BusScene, DashboardScene, ExamScene, PaymentScene } from "./scenes"
import styles from "./product.module.css"

// The portal's own menu, in the order a school day meets it.
const SCREENS = [
    { id: "dashboard", name: "Dashboard", icon: Squares2X2Icon, Scene: DashboardScene },
    { id: "payment", name: "Payment", icon: BanknotesIcon, Scene: PaymentScene },
    { id: "attendance", name: "Attendance", icon: ClipboardDocumentCheckIcon, Scene: AttendanceScene },
    { id: "exam", name: "Exam and result", icon: AcademicCapIcon, Scene: ExamScene },
    { id: "bus", name: "Bus tracking", icon: MapIcon, Scene: BusScene },
]

const TURN_MS = 5200

/**
 * The portal in miniature: its menu down the side, one screen at a time.
 *
 * It turns to the next screen by itself until the visitor takes over (points
 * at it, tabs into it, or picks a screen), and never when motion is off. The
 * menu is a real tab list: arrow keys move through it.
 */
export default function ProductWindow({ className }) {
    const { motion } = useSite()
    const [active, setActive] = useState(0)
    const [held, setHeld] = useState(false)
    const [seen, setSeen] = useState(false)
    const windowRef = useRef(null)
    const tabRefs = useRef([])
    const turning = motion && !held && seen

    // it only turns while it is on screen
    useEffect(() => {
        const element = windowRef.current
        if (!element || !("IntersectionObserver" in window)) return
        const observer = new IntersectionObserver(([entry]) => setSeen(entry.isIntersecting), { threshold: 0.35 })
        observer.observe(element)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        if (!turning) return
        const timer = setTimeout(() => setActive((index) => (index + 1) % SCREENS.length), TURN_MS)
        return () => clearTimeout(timer)
    }, [turning, active])

    const pick = (index) => {
        setActive(index)
        setHeld(true)
    }

    const onKeyDown = (event) => {
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key]
        let next
        if (step) next = (active + step + SCREENS.length) % SCREENS.length
        else if (event.key === "Home") next = 0
        else if (event.key === "End") next = SCREENS.length - 1
        else return
        event.preventDefault()
        pick(next)
        tabRefs.current[next]?.focus()
    }

    const { id, Scene } = SCREENS[active]

    return (
        <div
            ref={windowRef}
            className={cx(styles.window, className)}
            onPointerEnter={() => setHeld(true)}
            onPointerLeave={(event) => event.pointerType === "mouse" && setHeld(false)}
            onFocusCapture={() => setHeld(true)}>
            <div className={styles.windowBar}>
                <p className={styles.windowSchool}>
                    <span className={styles.windowCrest} aria-hidden="true" />
                    Your School Name
                </p>
                <p className={styles.windowTag}>Sample data</p>
            </div>
            <div className={styles.windowBody}>
                <div className={styles.rail} role="tablist" aria-label="Screens of the portal" onKeyDown={onKeyDown}>
                    {SCREENS.map((screen, index) => {
                        const ScreenIcon = screen.icon
                        const selected = index === active
                        return (
                            <button
                                key={screen.id}
                                ref={(element) => (tabRefs.current[index] = element)}
                                type="button"
                                role="tab"
                                id={`screen-tab-${screen.id}`}
                                aria-selected={selected}
                                aria-controls="screen-panel"
                                tabIndex={selected ? 0 : -1}
                                className={styles.railItem}
                                onClick={() => pick(index)}>
                                <ScreenIcon aria-hidden="true" />
                                <span>{screen.name}</span>
                                {selected && turning && <span key={active} className={styles.railTimer} aria-hidden="true" />}
                            </button>
                        )
                    })}
                </div>
                <div id="screen-panel" role="tabpanel" aria-labelledby={`screen-tab-${id}`} className={styles.stage}>
                    <div key={id} className={styles.stageIn}>
                        <Scene />
                    </div>
                </div>
            </div>
        </div>
    )
}
