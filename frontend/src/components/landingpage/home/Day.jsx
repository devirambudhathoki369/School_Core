import { useEffect, useState } from "react"
import { schoolDay } from "../data/content"
import { SATURDAY, nepalClock } from "../data/nepal-clock"
import { Kicker, cx, reveal } from "../site/ui"
import site from "../site/site.module.css"
import styles from "./home.module.css"

// Where each step sits on the arc the sun travels: left as a share of the
// width, top in pixels. The arc is `M0 110 Q500 -60 1000 110` in a box 120 high.
const ARC = [
    { left: "10%", top: 79 },
    { left: "30%", top: 39 },
    { left: "50%", top: 25 },
    { left: "70%", top: 39 },
    { left: "90%", top: 79 },
]

/** Which part of the school day it is in Nepal at `clock`, and how to say so. */
function readDay(clock) {
    const { steps } = schoolDay
    if (!clock) return { now: -1, text: "" }
    if (clock.weekday === SATURDAY) return { now: -1, text: "It is Saturday in Tulsipur. School is closed today." }
    if (clock.minutes < steps[0].from) {
        return { now: -1, text: `It is ${clock.label} in Tulsipur. The first bus leaves at 6:30.` }
    }
    let now = 0
    steps.forEach((step, index) => {
        if (clock.minutes >= step.from) now = index
    })
    return { now, text: `It is ${clock.label} in Tulsipur: ${steps[now].now}.` }
}

/**
 * A school day, with the sun on the step the day has reached in Nepal.
 *
 * The page is built ahead of time, so the clock is read in the browser after
 * the first paint; until then the day is drawn with no step picked out.
 */
export default function DaySection() {
    const [clock, setClock] = useState(null)

    useEffect(() => {
        const read = () => setClock(nepalClock())
        read()
        const timer = setInterval(read, 30 * 1000)
        return () => clearInterval(timer)
    }, [])

    const { now, text } = readDay(clock)
    const sun = now >= 0 ? ARC[now] : null

    return (
        <section className={cx(site.band, site.bandPaper)} aria-labelledby="day-title">
            <div className={site.wrap}>
                <div className={site.headSplit} {...reveal()}>
                    <div>
                        <Kicker>{schoolDay.kicker}</Kicker>
                        <h2 id="day-title" className={site.h2}>
                            {schoolDay.title}
                        </h2>
                    </div>
                    <div>
                        <p className={site.lede}>{schoolDay.subtitle}</p>
                        <p className={styles.nowLine}>
                            {text && (
                                <>
                                    <span className={styles.nowDot} aria-hidden="true" />
                                    {text}
                                </>
                            )}
                        </p>
                    </div>
                </div>

                <div className={styles.arc} aria-hidden="true">
                    <svg viewBox="0 0 1000 120" preserveAspectRatio="none" className={styles.arcLine}>
                        <path d="M0 110Q500 -60 1000 110" />
                    </svg>
                    {ARC.map((point, index) => (
                        <span
                            key={point.left}
                            className={styles.arcStop}
                            data-past={now >= index ? "" : undefined}
                            style={{ left: point.left, top: `${point.top}px` }}
                        />
                    ))}
                    {sun && <span className={styles.arcSun} style={{ left: sun.left, top: `${sun.top}px` }} />}
                </div>

                <ol className={styles.steps}>
                    {schoolDay.steps.map((step, index) => (
                        <li
                            key={step.title}
                            className={styles.step}
                            data-now={index === now ? "" : undefined}
                            {...reveal(index * 70)}>
                            <span className={styles.stepMark} aria-hidden="true" />
                            <p className={styles.stepTime}>
                                {step.time} <span className={styles.stepMeridiem}>{step.meridiem}</span>
                                {index === now && <span className={styles.stepNow}>Now</span>}
                            </p>
                            <h3 className={styles.stepTitle}>{step.title}</h3>
                            <p className={styles.stepText}>{step.text}</p>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    )
}
