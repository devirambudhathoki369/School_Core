import { CheckIcon } from "@heroicons/react/24/outline"
import { beforeAfter, bsMonths, whyJoinUs } from "../data/content"
import { BsYear } from "../home/Nepal"
import { CallBand, Kicker, PageHero, cx, reveal } from "../site/ui"
import site from "../site/site.module.css"
import styles from "./screens.module.css"

const FISCAL_YEAR_STARTS = "Shrawan" // the Nepali fiscal year runs Shrawan to Ashad

export default function WhyScreen({ bsYear }) {
    const [calendar, ...others] = whyJoinUs.features

    return (
        <>
            <PageHero name="Why SchoolCore" title={whyJoinUs.title} lede={whyJoinUs.subtitle} />

            <section className={cx(site.band, site.bandPaper)} aria-labelledby="calendar-title">
                <div className={site.wrap}>
                    <div className={styles.calendar}>
                        <div {...reveal()}>
                            <Kicker>The calendar</Kicker>
                            <h2 id="calendar-title" className={cx(site.h2, styles.calendarTitle)}>
                                {calendar.title}
                            </h2>
                            <p className={cx(site.lede, styles.calendarLede)}>{calendar.description}</p>
                        </div>
                        <div className={styles.calendarYear} {...reveal(100)}>
                            <BsYear bsYear={bsYear} className={styles.yearMark} />
                            <p className={styles.yearNote}>{whyJoinUs.yearNote}</p>
                        </div>
                    </div>

                    <ol className={styles.months} aria-label="The twelve months of the Nepali year" {...reveal(60)}>
                        {bsMonths.map((month, index) => (
                            <li key={month.en} className={styles.month} data-first={month.en === FISCAL_YEAR_STARTS ? "" : undefined}>
                                <span className={styles.monthNo} aria-hidden="true">
                                    {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className={styles.monthNe} lang="ne">
                                    {month.ne}
                                </span>
                                <span className={styles.monthEn}>{month.en}</span>
                                {month.en === FISCAL_YEAR_STARTS && <span className={styles.monthTag}>Fiscal year starts</span>}
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            <section className={cx(site.band, site.bandCard)} aria-labelledby="reasons-title">
                <div className={site.wrap}>
                    <div className={site.head} {...reveal()}>
                        <Kicker>And three more reasons</Kicker>
                        <h2 id="reasons-title" className={site.h2}>
                            We do the setting up with you, and your data stays yours.
                        </h2>
                    </div>
                    <div className={styles.trio}>
                        {others.map((feature, index) => (
                            <div key={feature.title} className={styles.trioItem} {...reveal(index * 80)}>
                                <span className={styles.numeral} aria-hidden="true">
                                    {index + 2}
                                </span>
                                <h3 className={styles.trioTitle}>{feature.title}</h3>
                                <p className={styles.trioText}>{feature.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section className={cx(site.band, site.bandSand)} aria-labelledby="changes-title">
                <div className={site.wrap}>
                    <div className={site.head} {...reveal()}>
                        <Kicker>{beforeAfter.kicker}</Kicker>
                        <h2 id="changes-title" className={site.h2}>
                            {beforeAfter.title}
                        </h2>
                    </div>
                    <table className={styles.changes} {...reveal(60)}>
                        <thead>
                            <tr>
                                <th scope="col">
                                    <span className={styles.srOnly}>What</span>
                                </th>
                                <th scope="col">{beforeAfter.beforeLabel}</th>
                                <th scope="col">{beforeAfter.afterLabel}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {beforeAfter.rows.map((row) => (
                                <tr key={row.what}>
                                    <th scope="row">{row.what}</th>
                                    <td data-label={beforeAfter.beforeLabel} className={styles.before}>
                                        {row.before}
                                    </td>
                                    <td data-label={beforeAfter.afterLabel} className={styles.after}>
                                        <span className={styles.afterIn}>
                                            <CheckIcon aria-hidden="true" />
                                            {row.after}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            <CallBand />
        </>
    )
}
