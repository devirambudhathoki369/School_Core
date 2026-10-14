import { useState } from "react"
import Link from "next/link"
import { ArrowUpRightIcon } from "@heroicons/react/24/outline"
import { modules, modulesIntro } from "../data/content"
import { DRAWINGS } from "../product/drawings"
import { Kicker, TextLink, cx, reveal } from "../site/ui"
import site from "../site/site.module.css"
import styles from "./home.module.css"

const FIRST_PICK = 1 // Fees & billing: the page opens on the receipt

/**
 * The twelve modules as an index, with a plate beside it that turns to
 * whichever row is under the pointer or the keyboard.
 *
 * The plate is an echo of the list, so it is hidden from screen readers: each
 * row already says what the module is, and links to its part of the Features
 * page, where the same drawing is described in words.
 */
export default function ModulesSection() {
    const [picked, setPicked] = useState(FIRST_PICK)
    const current = modules[picked]
    const Drawing = DRAWINGS[current.scene]

    return (
        <section className={cx(site.band, site.bandSand)} aria-labelledby="modules-title">
            <div className={site.wrap}>
                <div className={site.headSplit} {...reveal()}>
                    <div>
                        <Kicker>{modulesIntro.kicker}</Kicker>
                        <h2 id="modules-title" className={site.h2}>
                            {modulesIntro.title}
                        </h2>
                    </div>
                    <p className={site.lede}>{modulesIntro.subtitle}</p>
                </div>

                <div className={styles.index}>
                    <ol className={styles.indexList} {...reveal()}>
                        {modules.map((item, index) => (
                            <li key={item.id}>
                                <Link
                                    href={`/features#${item.id}`}
                                    className={styles.indexRow}
                                    data-picked={index === picked ? "" : undefined}
                                    onMouseEnter={() => setPicked(index)}
                                    onFocus={() => setPicked(index)}>
                                    <span className={styles.indexNo} aria-hidden="true">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <span className={styles.indexTitle}>{item.title}</span>
                                    <span className={styles.indexLine}>{item.line}</span>
                                    <ArrowUpRightIcon className={styles.indexArrow} aria-hidden="true" />
                                </Link>
                            </li>
                        ))}
                    </ol>

                    <div className={styles.plate} aria-hidden="true">
                        <div key={current.id} className={styles.plateIn}>
                            <p className={styles.plateLabel}>
                                <span>{String(picked + 1).padStart(2, "0")}</span>
                                Replaces {current.replaces}
                            </p>
                            <div className={styles.plateDrawing}>
                                <Drawing />
                            </div>
                        </div>
                    </div>
                </div>

                <p className={styles.sectionLink}>
                    <TextLink href="/features">{modulesIntro.link}</TextLink>
                </p>
            </div>
        </section>
    )
}
