// Night: the viewer's own light/dark choice, independent of the school's theme.
//
// `data-ui-mode="dark"` on <html> turns the dark layer of globals.css on; every
// theme keeps its accent and gets a dark ground. The choice belongs to the
// person at this browser, not to the school, so it lives in this browser's
// storage. Until they choose, it follows the device's own setting.
//
// The shell (View.jsx) is what mounts this, so it only applies once signed in;
// it lets go on unmount, and the pages before sign-in always draw light.
import { useCallback, useEffect, useLayoutEffect, useState } from "react";

const KEY = "sc-color-mode";
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function storedMode() {
    try {
        const value = window.localStorage.getItem(KEY);
        return value === "dark" || value === "light" ? value : null;
    } catch {
        return null; // storage blocked (private window, strict settings): follow the device
    }
}

function deviceMode() {
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

export function applyMode(el, mode) {
    if (!el) return;
    if (mode === "dark") el.setAttribute("data-ui-mode", "dark");
    else el.removeAttribute("data-ui-mode");
}

export function useColorMode() {
    const [mode, setMode] = useState("light");

    // Before paint, so a dark-mode viewer is not shown a white frame first.
    useIsomorphicLayoutEffect(() => {
        const root = document.documentElement;
        const initial = storedMode() || deviceMode();
        setMode(initial);
        applyMode(root, initial);
        const query = window.matchMedia?.("(prefers-color-scheme: dark)");
        const follow = (event) => {
            if (storedMode()) return; // an explicit choice outranks the device
            const next = event.matches ? "dark" : "light";
            setMode(next);
            applyMode(root, next);
        };
        query?.addEventListener?.("change", follow);
        return () => {
            query?.removeEventListener?.("change", follow);
            applyMode(root, "light");
        };
    }, []);

    const toggle = useCallback(() => {
        setMode((current) => {
            const next = current === "dark" ? "light" : "dark";
            try { window.localStorage.setItem(KEY, next); } catch { /* the switch still works for this visit */ }
            applyMode(document.documentElement, next);
            return next;
        });
    }, []);

    return { mode, toggle };
}
