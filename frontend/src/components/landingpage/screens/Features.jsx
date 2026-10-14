import { useEffect, useRef, useState } from "react"
import { modules, setupNote } from "../data/content"
import { Frame } from "../product/drawings"
import { CallBand, Kicker, PageHero, Ticks, cx, reveal, useSite } from "../site/ui"
import site from "../site/site.module.css"
import styles from "./screens.module.css"

const TOTAL = String(modules.length).padStart(2, "0")

/**
 * Every module, one after the other, each with what it does, the register it
 * replaces and a drawing of its screen.
 *
 * The strip under the hero stays in view and marks the module being read. On
 * a phone it is wider than the screen, so it slides to keep that mark visible.
 */
export default function FeaturesScreen() {
    const { motion } = useSite()
    const [reading, setReading] = useState(modules[0].id)
    const stripRef = useRef(null)

    useEffect(() => {
        if (!("IntersectionObserver" in window)) return
        // a module is "being read" while it crosses a line a third of the way down
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) setReading(entry.target.id)
                }
            },
            { rootMargin: "-34% 0px -65% 0px" }
        )
        for (const item of modules) {
            const section = document.getElementById(item.id)
            if (section) observer.observe(section)
        }
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        const strip = stripRef.current
        const link = strip?.querySelector('[aria-current="true"]')
        if (!strip || !link || strip.scrollWidth <= strip.clientWidth) return
        const left = link.offsetLeft - (strip.clientWidth - link.offsetWidth) / 2
        strip.scrollTo({ left, behavior: motion ? "smooth" : "auto" })
    }, [reading, motion])

    return (
        <>
            <PageHero
                name="Features"
                title="Everything the office does. Nothing typed twice."
                lede="Twelve modules that share one set of students, staff and accounts. Each one replaces a register the office keeps today."
            />

            <nav className={styles.jump} aria-label="Modules on this page">
                <div ref={stripRef} className={cx(site.wrap, styles.jumpStrip)}>
                    {modules.map((item, index) => (
                        <a
                            key={item.id}
                            href={`#${item.id}`}
                            className={styles.jumpLink}
                            aria-current={reading === item.id ? "true" : undefined}>
                            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                            {item.title}
                        </a>
                    ))}
                </div>
            </nav>

            <div className={site.bandPaper}>
                <div className={site.wrap}>
                    {modules.map((item, index) => (
                        <section
                            key={item.id}
                            id={item.id}
                            tabIndex={-1}
                            className={styles.feature}
                            aria-labelledby={`${item.id}-title`}>
                            <div className={styles.featureText} {...reveal()}>
                                <p className={styles.featureNo}>
                                    {String(index + 1).padStart(2, "0")} <span>/ {TOTAL}</span>
                                </p>
                                <h2 id={`${item.id}-title`} className={styles.featureTitle}>
                                    {item.title}
                                </h2>
                                <p className={styles.featureLine}>{item.line}</p>
                                <Ticks points={item.points} />
                                <p className={styles.featureTag}>
                                    <span className={site.tag}>Replaces {item.replaces}</span>
                                </p>
                            </div>
                            <Frame scene={item.scene} {...reveal(100)} />
                        </section>
                    ))}
                </div>
            </div>

            <section className={cx(site.band, site.bandPine, site.onDark)} aria-labelledby="setup-title">
                <div className={cx(site.wrap, styles.noteGrid)} {...reveal()}>
                    <div>
                        <Kicker>Underneath all twelve</Kicker>
                        <h2 id="setup-title" className={cx(site.h2, styles.noteTitle)}>
                            {setupNote.title}
                        </h2>
                    </div>
                    <p className={site.lede}>{setupNote.text}</p>
                </div>
            </section>

            <CallBand />
        </>
    )
}
