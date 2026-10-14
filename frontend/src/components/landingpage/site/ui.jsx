import { createContext, useContext } from "react"
import Link from "next/link"
import { ArrowRightIcon, CheckIcon, PhoneIcon } from "@heroicons/react/24/outline"
import { company } from "../data/content"
import styles from "./site.module.css"

/** Joins class names, skipping the ones that are not there. */
export function cx(...names) {
    return names.filter(Boolean).join(" ")
}

// What the layout knows that a section may need: whether things may move.
export const SiteContext = createContext({ motion: true })
export const useSite = () => useContext(SiteContext)

/** An element that arrives as it scrolls into view. `delay` is in ms. */
export function reveal(delay = 0) {
    return { "data-reveal": "", style: delay ? { "--d": `${delay}ms` } : undefined }
}

export function Kicker({ children }) {
    return (
        <p className={styles.kicker}>
            <span className={styles.kickerMark} aria-hidden="true" />
            {children}
        </p>
    )
}

/** The primary action: a pill with its arrow in a disc. */
export function ArrowButton({ href, children, small, ink, className }) {
    return (
        <Link href={href} className={cx(styles.btn, small && styles.btnSm, ink && styles.btnInk, className)}>
            {children}
            <span className={styles.btnDisc} aria-hidden="true">
                <ArrowRightIcon />
            </span>
        </Link>
    )
}

export function TextLink({ href, children }) {
    return (
        <Link href={href} className={styles.textLink}>
            {children}
            <ArrowRightIcon aria-hidden="true" />
        </Link>
    )
}

export function Ticks({ points }) {
    return (
        <ul className={styles.ticks}>
            {points.map((point) => (
                <li key={point} className={styles.tick}>
                    <CheckIcon className={styles.tickIcon} aria-hidden="true" />
                    {point}
                </li>
            ))}
        </ul>
    )
}

/** The pine band an inner page opens with. */
export function PageHero({ name, title, lede, children }) {
    return (
        <section className={cx(styles.pageHero, styles.onDark)}>
            <div className={cx(styles.wrap, styles.pageHeroIn)}>
                <nav aria-label="Breadcrumb">
                    <ol className={styles.crumbs}>
                        <li>
                            <Link href="/">Home</Link>
                        </li>
                        <li aria-hidden="true">/</li>
                        <li className={styles.crumbNow} aria-current="page">
                            {name}
                        </li>
                    </ol>
                </nav>
                <h1 className={styles.pageTitle}>{title}</h1>
                {lede && <p className={styles.pageLede}>{lede}</p>}
                {children}
            </div>
        </section>
    )
}

/** The marigold band every page but Contact closes with. */
export function CallBand() {
    return (
        <section className={cx(styles.call, styles.onSun)} aria-labelledby="call-title">
            <div className={cx(styles.wrap, styles.callGrid)}>
                <div {...reveal()}>
                    <Kicker>Book a demo</Kicker>
                    <h2 id="call-title" className={styles.callTitle}>
                        Let us show you around.
                    </h2>
                    <p className={styles.callText}>
                        Call us and tell us a little about your school. We will walk you through the system and answer your
                        questions in plain words.
                    </p>
                </div>
                <div className={styles.callSide} {...reveal(120)}>
                    <p className={styles.callLabel}>Call us · {company.openDays}</p>
                    <a href={`tel:${company.phone}`} className={styles.callNumber}>
                        {company.phone}
                    </a>
                    <div className={styles.callActions}>
                        <a href={`tel:${company.phone}`} className={cx(styles.btn, styles.btnInk, styles.btnPlain)}>
                            <PhoneIcon width={18} height={18} strokeWidth={2.2} aria-hidden="true" />
                            Call now
                        </a>
                        <Link href="/contact" className={styles.btnLine}>
                            Other ways to reach us
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    )
}
