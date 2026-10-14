import { aboutContent, company, setupSteps } from "../data/content"
import { CallBand, Kicker, PageHero, cx, reveal } from "../site/ui"
import site from "../site/site.module.css"
import styles from "./screens.module.css"

const SHEET = [
    { term: "Product", text: company.name },
    { term: "Made by", text: company.maker },
    { term: "Office", text: company.address },
    { term: "Runs on", text: "Web, Android and iPhone" },
    { term: "Calendar", text: "Bikram Sambat" },
]

export default function AboutScreen() {
    return (
        <>
            <PageHero name="About" title={aboutContent.title} lede={aboutContent.subtitle} />

            <section className={cx(site.band, site.bandPaper)} aria-labelledby="story-title">
                <div className={cx(site.wrap, styles.story)}>
                    <div {...reveal()}>
                        <Kicker>What we set out to fix</Kicker>
                        <h2 id="story-title" className={cx(site.h2, styles.storyTitle)}>
                            One record, instead of six registers.
                        </h2>
                        {aboutContent.story.map((paragraph) => (
                            <p key={paragraph} className={styles.storyText}>
                                {paragraph}
                            </p>
                        ))}
                    </div>
                    <dl className={styles.sheet} {...reveal(100)}>
                        {SHEET.map((row) => (
                            <div key={row.term} className={styles.sheetRow}>
                                <dt>{row.term}</dt>
                                <dd>{row.text}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            <section className={cx(site.band, site.bandPine, site.onDark)} aria-label="Mission, vision and values">
                <div className={cx(site.wrap, styles.creed)}>
                    {aboutContent.facts.map((fact, index) => (
                        <div key={fact.term} className={styles.creedItem} {...reveal(index * 80)}>
                            <h2 className={styles.creedTerm}>{fact.term}</h2>
                            <p className={styles.creedText}>{fact.text}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className={cx(site.band, site.bandCard)} aria-labelledby="start-title">
                <div className={site.wrap}>
                    <div className={site.head} {...reveal()}>
                        <Kicker>{setupSteps.kicker}</Kicker>
                        <h2 id="start-title" className={site.h2}>
                            {setupSteps.title}
                        </h2>
                    </div>
                    <ol className={styles.start}>
                        {setupSteps.steps.map((step, index) => (
                            <li key={step.title} className={styles.startStep} {...reveal(index * 80)}>
                                <span className={styles.numeral} aria-hidden="true">
                                    {index + 1}
                                </span>
                                <h3 className={styles.trioTitle}>{step.title}</h3>
                                <p className={styles.trioText}>{step.text}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <CallBand />
        </>
    )
}
