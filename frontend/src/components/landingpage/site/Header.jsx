import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/router"
import { ArrowRightIcon, Bars3Icon, ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { navigationItems, signInLinks } from "../data/navigation"
import { company } from "../data/content"
import { ArrowButton, cx } from "./ui"
import styles from "./site.module.css"

export default function Header() {
    const { pathname } = useRouter()
    const [menuOpen, setMenuOpen] = useState(false)
    const [signInOpen, setSignInOpen] = useState(false)
    const [stuck, setStuck] = useState(false)
    const signInRef = useRef(null)
    const signInButtonRef = useRef(null)
    const menuButtonRef = useRef(null)

    // the bar deepens once the page has moved under it
    useEffect(() => {
        const onScroll = () => setStuck(window.scrollY > 8)
        onScroll()
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [])

    // the page behind the open sheet stays where it is
    useEffect(() => {
        if (!menuOpen) return
        const previous = document.body.style.overflow
        document.body.style.overflow = "hidden"
        const onKey = (event) => event.key === "Escape" && setMenuOpen(false)
        // The sheet is for small screens. The stylesheet decides where "small"
        // ends (1080px, or 1264px with large text), so this watches the menu
        // button itself: when it stops being shown, by a window dragged wide
        // or a text size turned back down, the sheet closes with it.
        const button = menuButtonRef.current
        const watcher =
            button && "ResizeObserver" in window
                ? new ResizeObserver(() => button.offsetParent === null && setMenuOpen(false))
                : null
        watcher?.observe(button)
        document.addEventListener("keydown", onKey)
        return () => {
            document.body.style.overflow = previous
            document.removeEventListener("keydown", onKey)
            watcher?.disconnect()
        }
    }, [menuOpen])

    useEffect(() => {
        if (!signInOpen) return
        const onKey = (event) => {
            if (event.key !== "Escape") return
            setSignInOpen(false)
            signInButtonRef.current?.focus()
        }
        const onPointer = (event) => {
            if (!signInRef.current?.contains(event.target)) setSignInOpen(false)
        }
        document.addEventListener("keydown", onKey)
        document.addEventListener("pointerdown", onPointer)
        return () => {
            document.removeEventListener("keydown", onKey)
            document.removeEventListener("pointerdown", onPointer)
        }
    }, [signInOpen])

    const current = (href) => (pathname === href ? "page" : undefined)

    return (
        <header className={cx(styles.header, styles.onDark)} data-stuck={stuck ? "" : undefined}>
            <div className={styles.headerRow}>
                <Link href="/" className={styles.brand} aria-label={`${company.name}, home`}>
                    <span className={styles.brandMark}>
                        <Image src="/logo.png" alt="" width={32} height={28} priority className={styles.brandLogo} />
                    </span>
                    <span className={styles.brandText}>
                        <span className={styles.brandName}>{company.name}</span>
                        <span className={styles.brandBy}>by {company.makerShort}</span>
                    </span>
                </Link>

                <nav className={styles.nav} aria-label="Main">
                    {navigationItems.map((item) => (
                        <Link key={item.href} href={item.href} className={styles.navLink} aria-current={current(item.href)}>
                            {item.name}
                        </Link>
                    ))}
                </nav>

                <div className={styles.headerActions}>
                    <div ref={signInRef} className={styles.signIn}>
                        <button
                            ref={signInButtonRef}
                            type="button"
                            className={styles.signInButton}
                            aria-expanded={signInOpen}
                            aria-controls={signInOpen ? "site-sign-in" : undefined}
                            onClick={() => setSignInOpen(!signInOpen)}>
                            Sign in
                            <ChevronDownIcon aria-hidden="true" />
                        </button>
                        {signInOpen && (
                            <ul id="site-sign-in" className={styles.signInMenu}>
                                {signInLinks.map((link) => (
                                    <li key={link.href}>
                                        <a href={link.href} className={styles.signInItem}>
                                            <span>
                                                <span className={styles.signInName}>{link.name}</span>
                                                <span className={styles.signInHint}>{link.hint}</span>
                                            </span>
                                            <ArrowRightIcon aria-hidden="true" />
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <ArrowButton href="/contact" small className={styles.headerCta}>
                        Book a demo
                    </ArrowButton>
                    <button
                        ref={menuButtonRef}
                        type="button"
                        className={styles.menuButton}
                        aria-expanded={menuOpen}
                        aria-controls={menuOpen ? "site-menu" : undefined}
                        aria-label={menuOpen ? "Close menu" : "Open menu"}
                        onClick={() => setMenuOpen(!menuOpen)}>
                        {menuOpen ? (
                            <XMarkIcon className={styles.menuIcon} aria-hidden="true" />
                        ) : (
                            <Bars3Icon className={styles.menuIcon} aria-hidden="true" />
                        )}
                    </button>
                </div>
            </div>

            {/* On a small screen the menu is a sheet under the bar; it is hidden on a wide one. */}
            {menuOpen && (
                <nav id="site-menu" className={styles.sheet} aria-label="Main">
                    {navigationItems.map((item, index) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={styles.sheetLink}
                            aria-current={current(item.href)}
                            onClick={() => setMenuOpen(false)}>
                            <span className={styles.sheetNo} aria-hidden="true">
                                {String(index + 1).padStart(2, "0")}
                            </span>
                            {item.name}
                        </Link>
                    ))}
                    <p className={styles.sheetTitle}>Sign in</p>
                    <div className={styles.sheetRoles}>
                        {signInLinks.map((link) => (
                            <a key={link.href} href={link.href} className={styles.sheetRole}>
                                {link.name}
                            </a>
                        ))}
                    </div>
                    <div className={styles.sheetCta}>
                        <ArrowButton href="/contact">Book a demo</ArrowButton>
                    </div>
                </nav>
            )}
        </header>
    )
}
