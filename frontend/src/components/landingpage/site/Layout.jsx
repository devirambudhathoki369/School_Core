import { useEffect, useMemo, useRef, useState } from "react"
import Head from "next/head"
import Header from "./Header"
import Footer from "./Footer"
import AccessibilityTools from "../a11y/Tools"
import { BOOT_SCRIPT, DEFAULTS, prefAttributes, readPrefs, savePrefs } from "../a11y/prefs"
import { bikramSambatYear } from "../data/bikram-sambat"
import { fontVariables } from "./fonts"
import { SiteContext, cx } from "./ui"
import styles from "./site.module.css"

/**
 * Every page of the website records the Bikram Sambat year it was built in, so
 * the first paint in the browser agrees with the HTML that was sent. A page
 * exports this as its `getStaticProps`.
 */
export async function getSiteProps() {
    return { props: { bsYear: bikramSambatYear() } }
}

/**
 * The frame every page of the website shares: the fonts and colours, the
 * header and footer, the accessibility tools, and sections arriving on scroll.
 *
 * It is the website's only: nothing here is mounted behind the sign-in.
 */
export default function SiteLayout({ title, bsYear, children }) {
    const rootRef = useRef(null)
    // On the server these are the defaults. In the browser they are this
    // visitor's own, which the script below has already put on the element.
    const [prefs, setPrefsState] = useState(() => (typeof window === "undefined" ? DEFAULTS : readPrefs()))
    const [reducedMotion, setReducedMotion] = useState(false)

    const setPrefs = (next) => {
        setPrefsState(next)
        savePrefs(next)
    }

    useEffect(() => {
        const query = window.matchMedia("(prefers-reduced-motion: reduce)")
        const update = () => setReducedMotion(query.matches)
        update()
        query.addEventListener("change", update)
        return () => query.removeEventListener("change", update)
    }, [])

    // A touchpad pinch does not re-flow a page: it enlarges it like a picture.
    // The right-hand side slides off the screen, the page starts scrolling
    // sideways, and the browser then RESTORES that zoom on every reload of the
    // tab, so the website looks broken until somebody thinks to pinch back
    // out. Two fingers resting on a laptop touchpad are enough to do it.
    //
    // The browser offers the pinch to the page first, as a wheel event that
    // says Ctrl is held when no key is. Refusing it leaves every deliberate
    // way of enlarging the page alone: Ctrl with the wheel or with + and -
    // (those re-flow, and nothing is cut off), and the text sizes in the
    // accessibility tools. Phones and tablets are not touched at all.
    useEffect(() => {
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return
        let ctrlHeld = false
        const key = (event) => {
            ctrlHeld = event.ctrlKey
        }
        const release = () => {
            ctrlHeld = false
        }
        const onWheel = (event) => {
            // ordinary scrolling, or Ctrl really is down: the browser's own zoom
            if (!event.ctrlKey || ctrlHeld) return
            // A tab that is ALREADY enlarged must still be able to come back:
            // pinching out is let through until the page is its own size again.
            const enlarged = (window.visualViewport?.scale || 1) > 1.01
            if (enlarged && event.deltaY > 0) return
            event.preventDefault()
        }
        window.addEventListener("keydown", key)
        window.addEventListener("keyup", key)
        window.addEventListener("blur", release)
        window.addEventListener("wheel", onWheel, { passive: false })
        return () => {
            window.removeEventListener("keydown", key)
            window.removeEventListener("keyup", key)
            window.removeEventListener("blur", release)
            window.removeEventListener("wheel", onWheel)
        }
    }, [])

    // "Remove colour" goes on the document itself. A filter on any element
    // inside the page becomes the frame its fixed descendants are placed in
    // (the phone menu collapsed to nothing); the document root is the one
    // element exempt from that. Cleared again when the website is left.
    useEffect(() => {
        if (prefs.colour !== "none") return
        const html = document.documentElement
        html.style.filter = "grayscale(1)"
        return () => {
            html.style.filter = ""
        }
    }, [prefs.colour])

    // Sections marked `data-reveal` wait just below the fold and arrive as they
    // are scrolled to. If anything here cannot run, they are shown outright.
    useEffect(() => {
        const root = rootRef.current
        if (!root) return
        const items = Array.from(root.querySelectorAll("[data-reveal]"))
        const show = (item) => item.setAttribute("data-shown", "")
        if (!("IntersectionObserver" in window)) {
            items.forEach(show)
            return
        }
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue
                    show(entry.target)
                    observer.unobserve(entry.target)
                }
            },
            { rootMargin: "0px 0px -6% 0px", threshold: 0.05 }
        )
        items.forEach((item) => observer.observe(item))
        return () => observer.disconnect()
    }, [])

    const site = useMemo(
        () => ({ motion: prefs.motion !== "off" && !reducedMotion }),
        [prefs.motion, reducedMotion]
    )

    /** A link to a place on this page glides there, and takes the keyboard with it. */
    const glide = (event) => {
        const link = event.target.closest?.('a[href^="#"]')
        if (!link) return
        const target = document.getElementById(link.getAttribute("href").slice(1))
        if (!target) return
        event.preventDefault()
        target.scrollIntoView({ behavior: site.motion ? "smooth" : "auto", block: "start" })
        target.focus({ preventScroll: true })
    }

    return (
        <div
            id="top"
            ref={rootRef}
            className={cx("lp", styles.root, fontVariables)}
            {...prefAttributes(prefs)}
            onClick={glide}
            suppressHydrationWarning>
            <Head>
                <title>{title}</title>
            </Head>
            <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
            <a href="#main" className={styles.skip}>
                Skip to the content
            </a>
            {/* drawn in the corner, but early in the page's order: a keyboard
                reaches the tools before the menu, not after the footer */}
            <AccessibilityTools prefs={prefs} setPrefs={setPrefs} />
            <SiteContext.Provider value={site}>
                <Header />
                <main id="main" tabIndex={-1}>
                    {children}
                </main>
                <Footer bsYear={bsYear} />
            </SiteContext.Provider>
        </div>
    )
}
