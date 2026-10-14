import Link from "next/link"
import { company, heroContent } from "../data/content"
import ProductWindow from "../product/Window"
import { ArrowButton, Kicker, cx } from "../site/ui"
import site from "../site/site.module.css"
import styles from "./home.module.css"

export default function HeroSection() {
    return (
        <section className={cx(styles.hero, site.onDark)}>
            <div className={cx(site.wrap, styles.heroGrid)}>
                <div>
                    <Kicker>{heroContent.kicker}</Kicker>
                    <h1 className={styles.h1}>
                        {heroContent.titleStart}{" "}
                        <span className={styles.h1Mark}>
                            {heroContent.titleMark}
                            {/* drawn under the words like a pen stroke */}
                            <svg viewBox="0 0 300 16" preserveAspectRatio="none" className={styles.h1Stroke} aria-hidden="true">
                                <path d="M3 11C52 4 118 3 168 8s88 5 129-3" />
                            </svg>
                        </span>
                    </h1>
                    <p className={styles.heroLede}>{heroContent.subtitle}</p>
                    <div className={styles.heroActions}>
                        <ArrowButton href="/contact">{heroContent.primaryButton}</ArrowButton>
                        <Link href="/features" className={site.btnLine}>
                            {heroContent.secondaryButton}
                        </Link>
                    </div>
                    <p className={styles.heroNote}>
                        Or call{" "}
                        <a href={`tel:${company.phone}`} className={styles.heroTel}>
                            {company.phone}
                        </a>
                        , {company.openDays}.
                    </p>
                </div>

                <div className={styles.heroStage}>
                    <ProductWindow />
                </div>
            </div>

            <div className={site.wrap}>
                <ul className={styles.facts}>
                    {heroContent.facts.map((fact) => (
                        <li key={fact.label} className={styles.fact}>
                            <span className={styles.factFigure}>{fact.figure}</span>
                            <span className={styles.factLabel}>{fact.label}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    )
}
