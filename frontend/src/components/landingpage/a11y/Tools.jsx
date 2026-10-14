import { useEffect, useRef, useState } from "react"
import { ArrowPathIcon, MinusIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline"
import { DEFAULTS, TEXT_STEPS, isDefault } from "./prefs"
import styles from "./a11y.module.css"

const TONES = [
    { value: "standard", name: "Standard" },
    { value: "high", name: "High contrast" },
    { value: "dark", name: "Dark" },
]

// Each switch: the choice it sets, the value that means "on", and what it does.
const SWITCHES = [
    { key: "font", on: "plain", off: "standard", name: "Readable font", hint: "Plainer, clearer letter shapes" },
    { key: "space", on: "on", off: "off", name: "More spacing", hint: "Wider lines, words and letters" },
    { key: "links", on: "on", off: "off", name: "Underline links", hint: "Every link on the page" },
    { key: "colour", on: "none", off: "full", name: "Remove colour", hint: "The page in shades of grey" },
    { key: "motion", on: "off", off: "on", name: "Stop animations", hint: "Nothing moves on its own" },
]

/** The universal access mark: a figure with its arms out, in a ring. */
function AccessMark({ className }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
            <circle cx="12" cy="12" r="10.25" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="12" cy="6.9" r="1.55" fill="currentColor" />
            <path
                d="M6.6 9.7c3.5 1 7.3 1 10.8 0M12 10.6v4.1m0 0-2.5 4.1m2.5-4.1 2.5 4.1"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    )
}

/**
 * The accessibility tools: a button in the corner of every page of the
 * website, and the panel it opens.
 *
 * The panel is not a modal. The page behind it stays live so a visitor can see
 * each change as they make it; Escape or a click elsewhere closes it and puts
 * the keyboard back on the button.
 */
export default function AccessibilityTools({ prefs, setPrefs }) {
    const [open, setOpen] = useState(false)
    const dockRef = useRef(null)
    const buttonRef = useRef(null)
    const closeRef = useRef(null)

    useEffect(() => {
        if (!open) return
        closeRef.current?.focus()
        const onKey = (event) => {
            if (event.key !== "Escape") return
            setOpen(false)
            buttonRef.current?.focus()
        }
        const onPointer = (event) => {
            if (!dockRef.current?.contains(event.target)) setOpen(false)
        }
        document.addEventListener("keydown", onKey)
        document.addEventListener("pointerdown", onPointer)
        return () => {
            document.removeEventListener("keydown", onKey)
            document.removeEventListener("pointerdown", onPointer)
        }
    }, [open])

    const set = (key, value) => setPrefs({ ...prefs, [key]: value })
    const close = () => {
        setOpen(false)
        buttonRef.current?.focus()
    }

    return (
        <div ref={dockRef} className={styles.dock}>
            {open && (
                <div id="site-access-panel" role="dialog" aria-label="Accessibility tools" className={styles.panel}>
                    <div className={styles.panelHead}>
                        <p className={styles.panelTitle}>
                            <AccessMark className={styles.panelMark} />
                            Accessibility
                        </p>
                        <button ref={closeRef} type="button" className={styles.iconButton} aria-label="Close" onClick={close}>
                            <XMarkIcon aria-hidden="true" />
                        </button>
                    </div>

                    <div className={styles.group}>
                        <p className={styles.groupTitle} id="site-access-text">
                            Text size
                        </p>
                        <div className={styles.stepper} role="group" aria-labelledby="site-access-text">
                            <button
                                type="button"
                                className={styles.stepButton}
                                aria-label="Smaller text"
                                disabled={prefs.text === 0}
                                onClick={() => set("text", prefs.text - 1)}>
                                <MinusIcon aria-hidden="true" />
                            </button>
                            <div className={styles.stepValue} aria-live="polite">
                                <span className={styles.stepFigure}>{TEXT_STEPS[prefs.text]}</span>
                                <span className={styles.stepBars} aria-hidden="true">
                                    {TEXT_STEPS.map((step, index) => (
                                        <span key={step} className={styles.stepBar} data-filled={index <= prefs.text ? "" : undefined} />
                                    ))}
                                </span>
                            </div>
                            <button
                                type="button"
                                className={styles.stepButton}
                                aria-label="Larger text"
                                disabled={prefs.text === TEXT_STEPS.length - 1}
                                onClick={() => set("text", prefs.text + 1)}>
                                <PlusIcon aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    <div className={styles.group}>
                        <p className={styles.groupTitle} id="site-access-tone">
                            Colours
                        </p>
                        <div className={styles.tones} role="group" aria-labelledby="site-access-tone">
                            {TONES.map((tone) => (
                                <button
                                    key={tone.value}
                                    type="button"
                                    className={styles.tone}
                                    aria-pressed={prefs.tone === tone.value}
                                    onClick={() => set("tone", tone.value)}>
                                    <span className={styles.swatch} data-tone={tone.value} aria-hidden="true">
                                        Aa
                                    </span>
                                    {tone.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    <ul className={styles.switches}>
                        {SWITCHES.map((item) => {
                            const isOn = prefs[item.key] === item.on
                            return (
                                <li key={item.key}>
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={isOn}
                                        className={styles.switchRow}
                                        onClick={() => set(item.key, isOn ? item.off : item.on)}>
                                        <span className={styles.switchText}>
                                            <span className={styles.switchName}>{item.name}</span>
                                            <span className={styles.switchHint}>{item.hint}</span>
                                        </span>
                                        <span className={styles.track} aria-hidden="true">
                                            <span className={styles.thumb} />
                                        </span>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>

                    <div className={styles.panelFoot}>
                        <button type="button" className={styles.reset} disabled={isDefault(prefs)} onClick={() => setPrefs({ ...DEFAULTS })}>
                            <ArrowPathIcon aria-hidden="true" />
                            Reset all
                        </button>
                        <p className={styles.saved}>Remembered on this device.</p>
                    </div>
                </div>
            )}

            <button
                ref={buttonRef}
                type="button"
                className={styles.launcher}
                aria-expanded={open}
                aria-controls={open ? "site-access-panel" : undefined}
                onClick={() => setOpen(!open)}>
                <span className={styles.launcherText}>Accessibility</span>
                <AccessMark className={styles.launcherMark} />
            </button>
        </div>
    )
}
