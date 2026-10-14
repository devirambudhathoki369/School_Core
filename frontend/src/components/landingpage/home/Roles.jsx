import {
    AcademicCapIcon,
    BuildingLibraryIcon,
    CalculatorIcon,
    ComputerDesktopIcon,
    DevicePhoneMobileIcon,
} from "@heroicons/react/24/outline"
import { platforms, platformsIntro, roles, rolesIntro } from "../data/content"
import Phone from "../product/Phone"
import { Kicker, TextLink, Ticks, cx, reveal } from "../site/ui"
import site from "../site/site.module.css"
import styles from "./home.module.css"

// Each role gets one of the site's four grounds, so the four read as a set of
// printed cards rather than four copies of one box.
const ROLE_LOOK = {
    management: { icon: BuildingLibraryIcon, ground: "pine" },
    accountant: { icon: CalculatorIcon, ground: "sun" },
    teachers: { icon: AcademicCapIcon, ground: "mint" },
    parents: { icon: DevicePhoneMobileIcon, ground: "paper" },
}

const GROUND_TOKENS = { pine: site.onDark, sun: site.onSun }

export function RolesSection() {
    return (
        <section className={cx(site.band, site.bandCard)} aria-labelledby="roles-title">
            <div className={site.wrap}>
                <div className={site.headSplit} {...reveal()}>
                    <div>
                        <Kicker>{rolesIntro.kicker}</Kicker>
                        <h2 id="roles-title" className={site.h2}>
                            {rolesIntro.title}
                        </h2>
                    </div>
                    <p className={site.lede}>{rolesIntro.subtitle}</p>
                </div>

                <div className={styles.roles}>
                    {roles.map((role, index) => {
                        const { icon: RoleIcon, ground } = ROLE_LOOK[role.id]
                        return (
                            <article
                                key={role.id}
                                className={cx(styles.role, GROUND_TOKENS[ground])}
                                data-ground={ground}
                                {...reveal(index * 70)}>
                                <p className={styles.roleTop}>
                                    <RoleIcon className={styles.roleIcon} aria-hidden="true" />
                                    <span className={styles.roleNo} aria-hidden="true">
                                        {String(index + 1).padStart(2, "0")}
                                    </span>
                                </p>
                                <h3 className={styles.roleTitle}>{role.title}</h3>
                                <p className={styles.roleLine}>{role.line}</p>
                                <Ticks points={role.points} />
                            </article>
                        )
                    })}
                </div>

                <p className={styles.sectionLink}>
                    <TextLink href="/who-its-for">{rolesIntro.link}</TextLink>
                </p>
            </div>
        </section>
    )
}

const platformIcons = {
    "computer-desktop": ComputerDesktopIcon,
    "device-phone-mobile": DevicePhoneMobileIcon,
}

export function PlatformsSection() {
    return (
        <section className={cx(site.band, site.bandMint)} aria-labelledby="platforms-title">
            <div className={cx(site.wrap, styles.pocket)}>
                <div {...reveal()}>
                    <Kicker>{platformsIntro.kicker}</Kicker>
                    <h2 id="platforms-title" className={cx(site.h2, styles.pocketTitle)}>
                        {platformsIntro.title}
                    </h2>
                    <p className={cx(site.lede, styles.pocketLede)}>{platformsIntro.subtitle}</p>

                    <ul className={styles.platforms}>
                        {platforms.map((platform) => {
                            const PlatformIcon = platformIcons[platform.icon] || ComputerDesktopIcon
                            return (
                                <li key={platform.id} className={styles.platform}>
                                    <PlatformIcon className={styles.platformIcon} aria-hidden="true" />
                                    <div>
                                        <h3 className={styles.platformTitle}>{platform.title}</h3>
                                        <p className={styles.platformText}>{platform.description}</p>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                </div>

                <div className={styles.pocketStage} {...reveal(120)}>
                    <span className={styles.pocketDisc} aria-hidden="true" />
                    <Phone className={styles.pocketPhone} />
                    <p className={styles.sample}>Sample data</p>
                </div>
            </div>
        </section>
    )
}
