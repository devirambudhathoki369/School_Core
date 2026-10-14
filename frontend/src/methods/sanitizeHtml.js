import DOMPurify from "dompurify";

/**
 * Make rich text written by one user safe to render for another.
 *
 * Notices and news are written in the rich-text editor and stored as HTML, then
 * rendered with `dangerouslySetInnerHTML` for everyone who opens them. Anyone
 * who can post a notice could therefore put markup such as
 * `<img src=x onerror=…>` into it, and it would run in the reader's session —
 * with the reader's cookie, so a staff account allowed to post notices could act
 * as the admin who opened one.
 *
 * DOMPurify keeps the formatting the editor produces (headings, lists, links,
 * bold/italic, colours, alignment classes, images) and removes everything that
 * can execute: scripts, event-handler attributes, `javascript:` URLs, frames,
 * forms and embedded objects. Links that open a new tab also get
 * `rel="noopener noreferrer"`, so the opened page cannot reach back into this
 * one through `window.opener`.
 *
 * Client-only: DOMPurify needs a DOM, and the callers render inside dialogs that
 * only exist in the browser. On the server it returns an empty string rather
 * than unsanitised markup.
 */
let hooked = false;
function ensureHooks() {
    if (hooked || typeof window === "undefined") return;
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
        if (node.tagName === "A" && node.getAttribute("target") === "_blank") {
            node.setAttribute("rel", "noopener noreferrer");
        }
    });
    hooked = true;
}

export default function sanitizeHtml(html) {
    if (!html) return "";
    if (typeof window === "undefined") return "";
    ensureHooks();
    return DOMPurify.sanitize(String(html), {
        USE_PROFILES: { html: true },
        ADD_ATTR: ["target"],
        FORBID_TAGS: ["style", "form", "input", "button", "textarea", "select", "iframe", "object", "embed"],
    });
}
