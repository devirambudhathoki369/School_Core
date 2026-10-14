import { tickerWords } from "../data/content"
import { cx } from "../site/ui"
import site from "../site/site.module.css"
import styles from "./home.module.css"

/**
 * The portal's menu, running across a marigold band.
 *
 * It is decoration: the same modules are listed, with what they do, further
 * down the page, so a screen reader is not read the list twice over here. The
 * second copy is what lets the band loop without a seam.
 */
export default function Ticker() {
    return (
        <div className={cx(styles.ticker, site.onSun)} aria-hidden="true">
            <div className={styles.tickerTrack}>
                {[0, 1].map((copy) => (
                    <ul key={copy} className={styles.tickerList}>
                        {tickerWords.map((word) => (
                            <li key={word} className={styles.tickerWord}>
                                {word}
                                <span className={styles.tickerMark} />
                            </li>
                        ))}
                    </ul>
                ))}
            </div>
        </div>
    )
}
