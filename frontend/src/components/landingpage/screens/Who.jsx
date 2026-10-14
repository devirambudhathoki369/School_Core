import { ComputerDesktopIcon, DevicePhoneMobileIcon } from "@heroicons/react/24/outline"
import { platforms, roles, rolesIntro, rolesNote } from "../data/content"
import { Frame } from "../product/drawings"
import Phone from "../product/Phone"
import { CallBand, Kicker, PageHero, Ticks, cx, reveal } from "../site/ui"
import site from "../site/site.module.css"
import styles from "./screens.module.css"

const TOTAL = String(roles.length).padStart(2, "0")

const platformIcons = {
    "computer-desktop": ComputerDesktopIcon,
    "device-phone-mobile": DevicePhoneMobileIcon,
}

/** One section per kind of person, each with the screen they would open. */
export default function WhoScreen() {
    return (
        <>
            <PageHero name="Who it is for" title={rolesIntro.title} lede={rolesIntro.subtitle} />

            <div className={site.bandPaper}>
                <div className={site.wrap}>
                    {roles.map((role, index) => (
                        <section key={role.id} id={role.id} className={styles.feature} aria-labelledby={`${role.id}-title`}>
                            <div className={styles.featureText} {...reveal()}>
                                <p className={styles.featureNo}>
                                    {String(index + 1).padStart(2, "0")} <span>/ {TOTAL}</span>
                                </p>
                                <h2 id={`${role.id}-title`} className={styles.featureTitle}>
                                    {role.title}
                                </h2>
                                <p className={styles.featureLine}>{role.line}</p>
                                <p className={styles.featureMore}>{role.more}</p>
                                <Ticks points={role.points} />
                            </div>
                            {role.scene === "phone" ? (
                                <div className={styles.phoneStage} {...reveal(100)}>
                                    <span className={styles.phoneDisc} aria-hidden="true" />
                                    <Phone className={styles.phoneOnDisc} />
                                    <p className={styles.phoneNote}>Sample data</p>
                                </div>
                            ) : (
                                <Frame scene={role.scene} {...reveal(100)} />
                            )}
                        </section>
                    ))}
                </div>
            </div>

            <section className={cx(site.band, site.bandPine, site.onDark)} aria-labelledby="access-title">
                <div className={cx(site.wrap, styles.noteGrid)}>
                    <div {...reveal()}>
                        <Kicker>Sign-ins</Kicker>
                        <h2 id="access-title" className={cx(site.h2, styles.noteTitle)}>
                            {rolesNote.title}
                        </h2>
                        <p className={cx(site.lede, styles.noteLede)}>{rolesNote.text}</p>
                    </div>
                    <ul className={styles.rows} {...reveal(100)}>
                        {platforms.map((platform) => {
                            const PlatformIcon = platformIcons[platform.icon] || ComputerDesktopIcon
                            return (
                                <li key={platform.id} className={styles.row}>
                                    <PlatformIcon className={styles.rowIcon} aria-hidden="true" />
                                    <div>
                                        <h3 className={styles.rowTitle}>{platform.title}</h3>
                                        <p className={styles.rowText}>{platform.description}</p>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </div>
            </section>

            <CallBand />
        </>
    )
}
