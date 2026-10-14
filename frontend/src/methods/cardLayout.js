/**
 * The geometry and typography of an absolutely-positioned card.
 *
 * ONE ENGINE, TWO PRODUCTS. An ID card and a birthday card are the same drawing
 * problem — a fixed rectangle, optional background artwork, and data-bound
 * elements that have to land in the space the artwork left for them. The
 * backend already shares one sanitizer between them (`constants/idcard_layout`,
 * with the field catalogue passed in); this is the matching half on the client,
 * so a fix to how a shadow or a letter-spacing is computed lands on both at
 * once instead of being written twice and drifting.
 *
 * EVERYTHING IS A PERCENTAGE. An element's box is stored as `x/y/w/h` in
 * percent of the card, never pixels, because the same layout is drawn at three
 * different sizes: the designer's canvas, the on-screen preview, and the 2x (or
 * 4x) export that becomes the actual file. A pixel geometry would be correct at
 * exactly one of them.
 *
 * FONT SIZE IS THE EXCEPTION and needs care. It is stored in px *on the design
 * canvas*, so it must be multiplied by the render scale — otherwise a card
 * exported at 4x has 8pt text on a 1080px image.
 */

// Families that are actually available to a browser rendering a card, with a
// real fallback stack behind each. A card is exported as an image by the
// browser that drew it, so a family the browser has to substitute silently
// changes what a thousand printed cards look like.
export const FONT_STACKS = {
    sans: `ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`,
    serif: `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`,
    display: `"Trebuchet MS", "Segoe UI", Verdana, ui-sans-serif, sans-serif`,
    condensed: `"Arial Narrow", "Roboto Condensed", "Segoe UI", ui-sans-serif, sans-serif`,
    mono: `ui-monospace, "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace`,
    script: `"Segoe Script", "Brush Script MT", "Comic Sans MS", cursive`,
};

export const FONT_WEIGHTS = {
    normal: 400, medium: 500, semibold: 600, bold: 700, black: 900,
};

/**
 * The element's box, in pixels, for a card being drawn at `width` x `height`.
 * Kept separate from `elementTextStyle` because the drag handles in the
 * designer need the box on its own, without any of the paint.
 */
export function elementBox(el, width, height) {
    return {
        left: (Number(el?.x) || 0) / 100 * width,
        top: (Number(el?.y) || 0) / 100 * height,
        width: (Number(el?.w) || 0) / 100 * width,
        height: (Number(el?.h) || 0) / 100 * height,
    };
}

/**
 * Everything that paints an element.
 *
 * `scale` is the ratio of the card being drawn to the 300x450 (or 270x270)
 * DESIGN canvas the sizes were authored against. It multiplies font size,
 * letter-spacing and border width — the three properties stored in absolute
 * units. Geometry does not need it because geometry is already a percentage.
 */
export function elementStyle(el, width, height, scale = 1) {
    const box = elementBox(el, width, height);
    const style = {
        position: "absolute",
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        zIndex: Number(el?.z) || 1,
        // `opacity: 0` is a legitimate saved value (an element parked but not
        // deleted), so the fallback has to be an explicit 100 rather than `||`.
        opacity: (el?.opacity === undefined || el?.opacity === null ? 100 : el.opacity) / 100,
        overflow: "hidden",
        boxSizing: "border-box",
    };
    if (el?.bg) style.background = el.bg;
    if (el?.border_width > 0 && el?.border_color) {
        style.border = `${el.border_width * scale}px solid ${el.border_color}`;
    }
    const radius = borderRadius(el, box);
    if (radius) style.borderRadius = radius;
    return style;
}

/** A shape/photo's corner treatment, resolved against its own box so a "circle"
 *  is a circle whatever aspect ratio the element was dragged to. */
export function borderRadius(el, box) {
    switch (el?.shape) {
        case "circle": return "50%";
        case "pill": return "999px";
        case "rounded": {
            const shorter = Math.min(box?.width || 0, box?.height || 0);
            const pct = Number(el?.radius) || 8;
            return `${(shorter * pct) / 100}px`;
        }
        default:
            return Number(el?.radius) > 0
                ? `${(Math.min(box?.width || 0, box?.height || 0) * el.radius) / 100}px`
                : "";
    }
}

/** The text half: family, size, weight, colour, alignment, case. */
export function textStyle(el, scale = 1) {
    const align = el?.align || "left";
    return {
        fontFamily: FONT_STACKS[el?.font] || FONT_STACKS.sans,
        fontSize: `${(Number(el?.size) || 12) * scale}px`,
        fontWeight: FONT_WEIGHTS[el?.weight] || 600,
        color: el?.color || "#111827",
        textAlign: align,
        textTransform: el?.transform && el.transform !== "none" ? el.transform : "none",
        fontStyle: el?.italic ? "italic" : "normal",
        textDecoration: el?.underline ? "underline" : "none",
        // Stored in TENTHS of a px so the value stays an integer on the wire.
        letterSpacing: `${((Number(el?.letter_spacing) || 0) / 10) * scale}px`,
        lineHeight: `${(Number(el?.line_height) || 120) / 100}`,
        // The box is a fixed rectangle; the text is centred in it vertically so
        // a one-line value and a wrapped two-line one sit on the same optical
        // centre rather than both hugging the top.
        display: "flex",
        alignItems: "center",
        justifyContent: align === "center" ? "center" : (align === "right" ? "flex-end" : "flex-start"),
        // Long values (an address, a guardian's full name) must not push the
        // card apart — they wrap inside their own box and clip if they overrun.
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap",
    };
}

/**
 * Fill a wish's placeholders.
 *
 * Only the names the backend advertises are substituted; anything else is left
 * exactly as typed, so a stray brace in someone's message is printed rather
 * than silently swallowed. A placeholder whose value is empty collapses along
 * with the space before it — "Happy birthday, !" is worse than no name at all.
 */
export function fillPlaceholders(text, data) {
    if (!text) return "";
    return String(text).replace(/\{(\w+)\}/g, (match, key) => {
        const value = data?.[key];
        return value === undefined || value === null || value === "" ? "" : String(value);
    }).replace(/\s{2,}/g, " ").replace(/\s+([,.!?])/g, "$1").trim();
}

/** A stable id for a newly-added element. The backend de-duplicates ids on
 *  save, but a collision in the editor would drag two elements at once. */
export function newElementId(kind, existing = []) {
    const taken = new Set(existing.map(e => e?.id));
    let n = 1;
    while (taken.has(`${kind}-${n}`)) n += 1;
    return `${kind}-${n}`;
}

/** Move an element within a layout, clamped so it cannot be dragged entirely
 *  off the card and become unreachable. The backend allows -20..120 for
 *  deliberate bleed; this keeps at least a corner grabbable. */
export function clampBox(el) {
    const w = Math.max(1, Math.min(140, Number(el?.w) || 1));
    const h = Math.max(1, Math.min(140, Number(el?.h) || 1));
    return {
        ...el,
        w, h,
        x: Math.max(-20, Math.min(120 - Math.min(w, 20), Number(el?.x) || 0)),
        y: Math.max(-20, Math.min(120 - Math.min(h, 10), Number(el?.y) || 0)),
    };
}
