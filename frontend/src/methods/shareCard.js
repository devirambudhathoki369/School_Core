/**
 * Turning a rendered card into something a person can actually post.
 *
 * THE CHAIN, AND WHY IT HAS THREE LINKS
 * A birthday card is a picture, and the only universally useful thing to do
 * with a picture is hand it to whatever app the person already shares things
 * with. That is `navigator.share` with a file — one tap, and every installed
 * app (Facebook, WhatsApp, Messenger, Viber, mail) appears in the OS sheet.
 * It is a phone API though, and it is gated on a secure context and a user
 * gesture, so it cannot be the only path:
 *
 *   1. `navigator.share({ files })`  — phones, and desktop Safari. The real one.
 *   2. Download the PNG              — every desktop browser. The person then
 *                                      attaches it themselves.
 *   3. Facebook's sharer URL         — offered ALONGSIDE the download, never
 *                                      instead of it. Facebook cannot be handed
 *                                      an image by a link; the sharer takes a
 *                                      URL and unfurls whatever OG tags it
 *                                      finds. So this posts the school's page
 *                                      and the person attaches the downloaded
 *                                      picture — which is what "share to
 *                                      Facebook from the web" actually means.
 *                                      Pretending otherwise would produce a
 *                                      button that silently posts no card.
 *
 * html2canvas is already a dependency (the ID cards export through it), so this
 * adds nothing to the bundle. It is imported dynamically all the same: it is
 * ~200KB and no one who is not sharing a card should pay for it.
 */

/** Render a DOM node to a PNG blob at `scale` times its CSS size. */
export async function renderToBlob(node, scale = 4) {
    if (!node) throw new Error("Nothing to render.");
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(node, {
        scale,
        // The card paints its own background; a transparent one would produce a
        // PNG that looks black in most feed readers.
        backgroundColor: null,
        useCORS: true,
        // The card is drawn at its exact CSS size — letting html2canvas measure
        // the scrolled window instead produces a crop on a phone.
        width: node.offsetWidth,
        height: node.offsetHeight,
        windowWidth: node.offsetWidth,
        windowHeight: node.offsetHeight,
        logging: false,
    });
    return await new Promise((resolve, reject) => {
        canvas.toBlob(
            blob => (blob ? resolve(blob) : reject(new Error("Could not create the image."))),
            "image/png",
            0.95
        );
    });
}

/** Can this browser share an actual FILE? Feature-detected with the real file,
 *  because `canShare` answers per payload — a browser may accept text and
 *  refuse images. */
export function canShareFiles(file) {
    try {
        return Boolean(
            typeof navigator !== "undefined" &&
            navigator.share && navigator.canShare &&
            navigator.canShare({ files: [file] })
        );
    } catch (_) {
        return false;
    }
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on the next tick, not immediately: Safari has not finished
    // reading the URL when `click()` returns.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Share the card, by the best route this browser has.
 *
 * Returns what actually happened so the caller can say so honestly, rather than
 * claiming "Shared!" when all that occurred was a download.
 *   → { method: "share" | "download" | "cancelled" }
 */
export async function shareCard(node, { filename = "birthday-card.png", title = "", text = "", scale = 4 } = {}) {
    const blob = await renderToBlob(node, scale);
    const file = new File([blob], filename, { type: "image/png" });

    if (canShareFiles(file)) {
        try {
            await navigator.share({ files: [file], title, text });
            return { method: "share" };
        } catch (err) {
            // `AbortError` is the person closing the OS sheet. That is not a
            // failure and must not fall through to a surprise download.
            if (err?.name === "AbortError") return { method: "cancelled" };
            // Anything else (a share target that refused the file) still leaves
            // them with the picture.
        }
    }
    downloadBlob(blob, filename);
    return { method: "download" };
}

/** Facebook's share dialog for a URL. Opened in a named popup rather than a new
 *  tab so it behaves like every other OAuth-shaped window. */
export function openFacebookShare(url) {
    const target = url || (typeof window !== "undefined" ? window.location.origin : "");
    if (!target) return;
    window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(target)}`,
        "facebook-share",
        "width=600,height=520,menubar=no,toolbar=no"
    );
}

/** WhatsApp takes text only; the picture goes with it from the download. */
export function openWhatsAppShare(text) {
    window.open(`https://wa.me/?text=${encodeURIComponent(text || "")}`, "_blank", "noopener");
}
