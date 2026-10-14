import { useEffect, useState } from "react"
import { whyJoinUs } from "../data/content"
import { bikramSambatYear, toDevanagariDigits } from "../data/bikram-sambat"
import { Kicker, TextLink, cx, reveal } from "../site/ui"
import site from "../site/site.module.css"
import styles from "./home.module.css"

/**
 * The Bikram Sambat year, set in Devanagari. `bsYear` is the year the page was
 * built in, which is what the first paint must show to match the HTML that was
 * sent; the effect then puts the visitor's own "now" in its place.
 */
export function BsYear({ bsYear, className }) {
    const [year, setYear] = useState(bsYear)

    useEffect(() => {
        setYear(bikramSambatYear())
    }, [])

    return (
        <p className={className} lang="ne">
            {toDevanagariDigits(year)}
        </p>
    )
}

export default function NepalSection({ bsYear }) {
    return (
        <section className={cx(site.band, site.bandPine, site.onDark, styles.nepal)} aria-labelledby="nepal-title">
            <div className={cx(site.wrap, styles.nepalGrid)}>
                <div {...reveal()}>
                    <Kicker>{whyJoinUs.kicker}</Kicker>
                    <h2 id="nepal-title" className={cx(site.h2, styles.nepalTitle)}>
                        {whyJoinUs.title}
                    </h2>
                    <p className={cx(site.lede, styles.nepalLede)}>{whyJoinUs.subtitle}</p>
                    <BsYear bsYear={bsYear} className={styles.year} />
                    <p className={styles.yearNote}>{whyJoinUs.yearNote}</p>
                </div>

                <div>
                    <div className={styles.reasons}>
                        {whyJoinUs.features.map((feature, index) => (
                            <div key={feature.title} className={styles.reason} {...reveal(index * 70)}>
                                <h3 className={styles.reasonTitle}>{feature.title}</h3>
                                <p className={styles.reasonText}>{feature.description}</p>
                            </div>
                        ))}
                    </div>
                    <p className={styles.sectionLink}>
                        <TextLink href="/why-centeducation">{whyJoinUs.link}</TextLink>
                    </p>
                </div>
            </div>
        </section>
    )
}
