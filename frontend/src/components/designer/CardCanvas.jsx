import { forwardRef, useEffect, useMemo, useRef } from "react";
import QRCode from "react-qr-code";
import JsBarcode from "jsbarcode";
import { elementStyle, textStyle, elementBox, borderRadius } from "@/methods/cardLayout";

/**
 * Draws a layout. The one renderer behind every designed card in the app.
 *
 * It is used in four places and MUST look identical in all of them, which is
 * the whole reason it is one component:
 *
 *   · the superadmin's ID-card designer (canvas, at design size)
 *   · the ID cards that are actually printed (at 2x, inside DownloadCards)
 *   · the admin's birthday-card designer
 *   · the birthday card that gets shared (at 4x, through html2canvas)
 *
 * If the designer and the output were two components, "it looked right in the
 * editor and printed wrong" would be a permanent class of bug. There is nothing
 * here that knows which of the two products it is drawing — the difference is
 * entirely in the `layout` and the `data` it is handed.
 *
 * `scale` is the ratio to the DESIGN canvas the layout was authored on, and it
 * is applied to font size, letter-spacing and border width only. Geometry is
 * stored in percent and needs no scaling. See `methods/cardLayout.js`.
 */

const baseURL = process.env.NEXT_PUBLIC_BASE_URL;

/** An image field's URL. Media paths arrive from the API in three shapes — a
 *  full URL, a `/media/...` path, and a bare storage key — and a card that
 *  silently renders a broken image is worse than one that renders none. */
function mediaURL(value) {
    if (!value) return "";
    const text = String(value);
    if (/^(https?:|data:|blob:)/.test(text)) return text;
    if (text.startsWith("/media/")) return `${baseURL}${text}`;
    if (text.startsWith("/")) return `${baseURL}${text}`;
    return `${baseURL}/media/${text}`;
}

function Barcode({ value, width, height }) {
    const ref = useRef(null);
    useEffect(() => {
        if (!ref.current || !value) return;
        try {
            JsBarcode(ref.current, String(value), {
                format: "CODE128", displayValue: false, margin: 0,
                width: Math.max(1, width / 60), height,
            });
        } catch (_) {
            // An id that CODE128 cannot encode must not take the whole card
            // down — the rest of it is still a usable card.
        }
    }, [value, width, height]);
    return <svg ref={ref} style={{ width: "100%", height: "100%" }} />;
}

function CardCanvas({
    layout = [],
    data = {},
    width,
    height,
    scale = 1,
    background = "",
    backgroundColor = "#ffffff",
    // The designer passes these; the output paths never do.
    selectedId = null,
    onSelectElement = null,
    onPointerDownElement = null,
    className = "",
    style = {},
}, ref) {
    // Draw order is z, then the order in the array. Sorting a copy — mutating
    // the layout here would reorder the caller's own state on every render.
    const ordered = useMemo(
        () => [...(layout || [])].sort((a, b) => (Number(a?.z) || 0) - (Number(b?.z) || 0)),
        [layout]
    );
    const designing = typeof onSelectElement === "function";

    return (
        <div ref={ref}
            className={`card-canvas relative overflow-hidden ${className}`}
            style={{
                width: `${width}px`,
                height: `${height}px`,
                background: backgroundColor || "#ffffff",
                ...style,
            }}>
            {/* The artwork the fields are placed over. A plain <img> rather than
                next/image on purpose: html2canvas rasterises the DOM it is
                given, and next/image's srcset/lazy machinery can leave it
                capturing a placeholder instead of the picture. */}
            {background &&
                <img src={mediaURL(background)} alt=""
                    crossOrigin="anonymous"
                    style={{
                        position: "absolute", inset: 0, width: "100%", height: "100%",
                        objectFit: "cover", zIndex: 0, pointerEvents: "none",
                    }} />
            }

            {ordered.map((el) => {
                const value = data?.[el?.field];
                const isText = el?.kind === "text";
                const isStatic = isText && el?.field === "static";
                const shown = isStatic ? el?.text : value;
                // An empty value either leaves a gap or disappears. Nothing can
                // reflow on an absolutely-positioned card, so "hide" is the only
                // meaning available — and it is what a school means when it asks
                // for the blood group "only if we have it".
                if (isText && el?.hide_when_empty && !isStatic
                    && (shown === undefined || shown === null || `${shown}`.trim() === "")) {
                    return null;
                }
                if (el?.kind === "image" && !data?.[el?.field] && el?.hide_when_empty && !designing) {
                    return null;
                }

                const box = elementBox(el, width, height);
                const frame = elementStyle(el, width, height, scale);
                const selected = designing && selectedId === el?.id;

                return (
                    <div key={el?.id}
                        data-element-id={el?.id}
                        onMouseDown={designing && onPointerDownElement
                            ? (e) => onPointerDownElement(e, el) : undefined}
                        onClick={designing ? (e) => { e.stopPropagation(); onSelectElement(el?.id); } : undefined}
                        style={{
                            ...frame,
                            cursor: designing ? "move" : undefined,
                            // The selection ring is drawn with an outline, not a
                            // border: a border would change the element's box
                            // and make it jump the moment it is selected.
                            outline: selected ? "2px solid #2563eb" : (designing ? "1px dashed rgba(37,99,235,.35)" : "none"),
                            outlineOffset: selected ? "1px" : "0",
                        }}>
                        {isText &&
                            <div style={textStyle(el, scale)}>
                                <span>
                                    {el?.label ? `${el.label} : ` : ""}
                                    {isStatic ? (el?.text || "") : (shown ?? "")}
                                </span>
                            </div>
                        }

                        {el?.kind === "image" && (
                            data?.[el?.field] ?
                                <img src={mediaURL(data[el.field])} alt=""
                                    crossOrigin="anonymous"
                                    style={{
                                        width: "100%", height: "100%",
                                        objectFit: el?.fit === "contain" ? "contain" : "cover",
                                        objectPosition: "center top",
                                        borderRadius: borderRadius(el, box),
                                    }} />
                                // In the designer an image with nothing behind it
                                // still has to be visible and draggable, so it
                                // shows its own placeholder. Never in output.
                                : designing ?
                                    <div style={{
                                        width: "100%", height: "100%",
                                        display: "grid", placeItems: "center",
                                        background: "rgba(148,163,184,.22)",
                                        borderRadius: borderRadius(el, box),
                                        fontSize: `${Math.max(7, 8 * scale)}px`,
                                        color: "#475569", textAlign: "center", padding: "2px",
                                    }}>{el?.field}</div>
                                    : null
                        )}

                        {el?.kind === "qr" && (data?.qr_value ?
                            <QRCode value={String(data.qr_value)}
                                size={Math.max(16, Math.min(box.width, box.height))}
                                style={{ width: "100%", height: "100%" }} />
                            : null)}

                        {el?.kind === "barcode" && (data?.barcode_value ?
                            <Barcode value={data.barcode_value}
                                width={box.width} height={box.height} />
                            : null)}

                        {/* A shape carries no content — its whole appearance is
                            the background, border and radius already applied to
                            the frame above. */}
                    </div>
                );
            })}
        </div>
    );
}

export default forwardRef(CardCanvas);
