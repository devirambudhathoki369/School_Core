import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { company } from "../data/content"
import { footerLinks, signInLinks } from "../data/navigation"
import { bikramSambatYear, toDevanagariDigits } from "../data/bikram-sambat"
import { cx } from "./ui"
import styles from "./site.module.css"

function FooterColumn({ title, children }) {
    return (
        <div>
            <p className={styles.footerTitle}>{title}</p>
            <ul className={styles.footerList}>{children}</ul>
        </div>
    )
}

/**
 * `bsYear` is the year the page was built in. The pages are static, so that is
 * what the first paint must show to match the HTML that was sent; the effect
 * then puts the visitor's own "now" in its place, which only differs for a
 * build that is still being served after Baisakh 1.
 */
export default function Footer({ bsYear }) {
    const [year, setYear] = useState(bsYear)
    const currentYear = new Date().getFullYear()

    useEffect(() => {
        setYear(bikramSambatYear())
    }, [])

    return (
        <footer className={cx(styles.footer, styles.onDark)}>
            <div className={styles.wrap}>
                <div className={styles.footerGrid}>
                    <div>
                        <Link href="/" className={styles.brand} aria-label={`${company.name}, home`}>
                            <span className={styles.brandMark}>
                                <Image src="/logo.png" alt="" width={32} height={28} className={styles.brandLogo} />
                            </span>
                            <span className={styles.brandText}>
                                <span className={styles.brandName}>{company.name}</span>
                                <span className={styles.brandBy}>by {company.makerShort}</span>
                            </span>
                        </Link>
                        <p className={styles.footerBlurb}>{company.blurb}</p>
                        {year && (
                            <p className={styles.footerYear}>
                                <span className={styles.footerYearMark} lang="ne">
                                    {toDevanagariDigits(year)}
                                </span>
                                Bikram Sambat, on every screen.
                            </p>
                        )}
                    </div>

                    <FooterColumn title="Product">
                        {footerLinks.product.map((link) => (
                            <li key={link.href}>
                                <Link href={link.href} className={styles.footerLink}>
                                    {link.name}
                                </Link>
                            </li>
                        ))}
                    </FooterColumn>

                    <FooterColumn title="Company">
                        {footerLinks.company.map((link) => {
                            // the website's own pages change without a reload;
                            // the help desk and the policy are pages of the portal
                            const LinkTag = link.outside ? "a" : Link
                            return (
                                <li key={link.href}>
                                    <LinkTag href={link.href} className={styles.footerLink}>
                                        {link.name}
                                    </LinkTag>
                                </li>
                            )
                        })}
                    </FooterColumn>

                    <FooterColumn title="Sign in">
                        {signInLinks.map((link) => (
                            <li key={link.href}>
                                <a href={link.href} className={styles.footerLink}>
                                    {link.name}
                                </a>
                            </li>
                        ))}
                        <li className={styles.footerFact}>
                            <a href={`tel:${company.phone}`} className={styles.footerLink}>
                                {company.phone}
                            </a>
                            <br />
                            {company.address}
                        </li>
                    </FooterColumn>
                </div>

                <div className={styles.footerBase}>
                    <p>
                        © {currentYear} {company.maker} All rights reserved.
                    </p>
                    <p>{company.address}</p>
                </div>
            </div>
        </footer>
    )
}
