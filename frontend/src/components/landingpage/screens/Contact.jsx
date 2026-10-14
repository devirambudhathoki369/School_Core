import { useEffect, useState } from "react"
import {
    ArrowRightIcon,
    ArrowUpRightIcon,
    ClockIcon,
    EnvelopeIcon,
    MapPinIcon,
    PhoneIcon,
    PlusIcon,
} from "@heroicons/react/24/outline"
import { MessengerMark, WhatsappMark } from "@/components/supports/marks"
import { useMessengerUrl } from "@/components/supports/Facebook"
import { getSupportInfo } from "@/services/functions/help"
import { contactInfo, faqsIntro, siteFaqs, supportFallback } from "../data/content"
import { signInLinks } from "../data/navigation"
import { Kicker, PageHero, cx, reveal } from "../site/ui"
import site from "../site/site.module.css"
import styles from "./screens.module.css"

/** Keys the superadmin has left blank fall through to the copy shipped here. */
function withFallback(data) {
    const filled = Object.entries(data || {}).filter(([, value]) => value !== null && value !== undefined && value !== "")
    return { ...supportFallback, ...Object.fromEntries(filled) }
}

/**
 * WhatsApp opens a chat from a number in its international form. The office
 * number is kept as a ten-digit Nepali mobile, so the country code goes on
 * here; anything else is left alone.
 */
function whatsappLink(phone) {
    const digits = String(phone || "").replace(/\D/g, "")
    if (/^9\d{9}$/.test(digits)) return `https://wa.me/977${digits}`
    return digits ? `https://wa.me/${digits}` : ""
}

/**
 * How to reach us.
 *
 * The details are the ones the superadmin keeps for the signed-out Support
 * page (Help Centre ▸ Support Details), read from the same public endpoint, so
 * a number changed there changes here. What shipped in this bundle shows while
 * the request is in flight and stays if it fails.
 *
 * There is no message form: a form needs somewhere for the message to go, and
 * until there is one, every way of reaching us on this page is a real one.
 */
export default function ContactScreen() {
    const [info, setInfo] = useState(supportFallback)
    const messengerUrl = useMessengerUrl(info.fb_page_id)

    useEffect(() => {
        let alive = true
        getSupportInfo()
            .then((data) => {
                if (alive && data) setInfo(withFallback(data))
            })
            .catch(() => {
                /* keep what shipped */
            })
        return () => {
            alive = false
        }
    }, [])

    const whatsapp = whatsappLink(info.contact)

    const channels = [
        {
            label: contactInfo.callLabel,
            value: info.contact,
            hint: "The fastest way, during office hours",
            href: `tel:${info.contact}`,
            icon: <PhoneIcon />,
        },
        whatsapp && {
            label: "WhatsApp",
            value: info.contact,
            hint: "Send us a message at any hour",
            href: whatsapp,
            external: true,
            icon: <WhatsappMark size={26} />,
            brand: true,
        },
        info.email && {
            label: "Email",
            value: info.email,
            hint: "Best for longer questions",
            href: `mailto:${info.email}`,
            icon: <EnvelopeIcon />,
        },
        messengerUrl && {
            label: "Messenger",
            value: info.name,
            hint: "Chat with us on Facebook",
            href: messengerUrl,
            external: true,
            icon: <MessengerMark size={26} />,
            brand: true,
        },
    ].filter(Boolean)

    return (
        <>
            <PageHero name="Contact" title={contactInfo.title} lede={contactInfo.subtitle}>
                <div className={styles.heroCall}>
                    <a href={`tel:${info.contact}`} className={styles.heroNumber}>
                        {info.contact}
                    </a>
                    <a href={`tel:${info.contact}`} className={cx(site.btn, site.btnPlain)}>
                        <PhoneIcon width={18} height={18} strokeWidth={2.2} aria-hidden="true" />
                        {contactInfo.callButton}
                    </a>
                </div>
            </PageHero>

            <section className={cx(site.band, site.bandPaper)} aria-labelledby="reach-title">
                <div className={cx(site.wrap, styles.reach)}>
                    <div {...reveal()}>
                        <Kicker>Reach us</Kicker>
                        <h2 id="reach-title" className={cx(site.h2, styles.reachTitle)}>
                            Pick whichever is easiest.
                        </h2>
                        <ul className={styles.channels}>
                            {channels.map((channel) => (
                                <li key={channel.label}>
                                    <a
                                        href={channel.href}
                                        className={styles.channel}
                                        {...(channel.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                                        <span className={styles.channelIcon} data-brand={channel.brand ? "" : undefined} aria-hidden="true">
                                            {channel.icon}
                                        </span>
                                        <span className={styles.channelBody}>
                                            <span className={styles.channelLabel}>{channel.label}</span>
                                            <span className={styles.channelValue}>{channel.value}</span>
                                            <span className={styles.channelHint}>{channel.hint}</span>
                                        </span>
                                        <ArrowUpRightIcon className={styles.channelArrow} aria-hidden="true" />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <aside className={cx(styles.office, site.onDark)} aria-label="The office" {...reveal(100)}>
                        <p className={styles.officeLabel}>The office</p>
                        <p className={styles.officeName}>{info.name}</p>
                        <ul className={styles.officeRows}>
                            <li className={styles.officeRow}>
                                <MapPinIcon aria-hidden="true" />
                                {info.address}
                            </li>
                            <li className={styles.officeRow}>
                                <ClockIcon aria-hidden="true" />
                                <span>
                                    {info.open_days}
                                    <br />
                                    {info.open_time}
                                </span>
                            </li>
                        </ul>
                    </aside>
                </div>
            </section>

            <section className={cx(site.band, site.bandSand)} aria-labelledby="existing-title">
                <div className={cx(site.wrap, styles.existing)} {...reveal()}>
                    <div>
                        <Kicker>For our schools</Kicker>
                        <h2 id="existing-title" className={cx(site.h2, styles.reachTitle)}>
                            {contactInfo.existingTitle}
                        </h2>
                        <p className={cx(site.lede, styles.existingLede)}>{contactInfo.existingText}</p>
                    </div>
                    <ul className={styles.doors}>
                        {signInLinks.map((link) => (
                            <li key={link.href}>
                                <a href={link.href} className={styles.door}>
                                    <span>
                                        <span className={styles.doorName}>{link.name}</span>
                                        <span className={styles.doorHint}>{link.hint}</span>
                                    </span>
                                    <ArrowRightIcon aria-hidden="true" />
                                </a>
                            </li>
                        ))}
                        <li>
                            <a href="/support" className={styles.door}>
                                <span>
                                    <span className={styles.doorName}>Help desk</span>
                                    <span className={styles.doorHint}>Support for schools already on the system</span>
                                </span>
                                <ArrowRightIcon aria-hidden="true" />
                            </a>
                        </li>
                    </ul>
                </div>
            </section>

            <section className={cx(site.band, site.bandCard)} aria-labelledby="faq-title">
                <div className={site.wrap}>
                    <div className={site.head} {...reveal()}>
                        <Kicker>{faqsIntro.kicker}</Kicker>
                        <h2 id="faq-title" className={site.h2}>
                            {faqsIntro.title}
                        </h2>
                    </div>
                    <div className={styles.faq}>
                        {siteFaqs.map((faq) => (
                            <details key={faq.question} className={styles.faqItem}>
                                <summary className={styles.faqQuestion}>
                                    {faq.question}
                                    <PlusIcon className={styles.faqSign} aria-hidden="true" />
                                </summary>
                                <p className={styles.faqAnswer}>{faq.answer}</p>
                            </details>
                        ))}
                    </div>
                </div>
            </section>
        </>
    )
}
