import Image from "next/image";
import { formatImagePath } from "@/methods/formatMediaPath";

// THE renderer for a document's identity block. The superadmin's preview and the
// real printed sheet both go through this one component on purpose: a template
// builder whose preview is separate code is a builder that lies, and the first
// time they drift someone prints a thousand wrong certificates.

const ELEMENT_FONTS = {
    inherit: undefined,
    serif: '"Times New Roman", Times, Georgia, serif',
    sans: 'Helvetica, Arial, "Liberation Sans", sans-serif',
    display: 'Georgia, "Times New Roman", serif',
    slab: '"Rockwell", "Roboto Slab", Georgia, serif',
    condensed: '"Arial Narrow", "Roboto Condensed", sans-serif',
    script: '"Segoe Script", "Brush Script MT", cursive',
    mono: '"Courier New", Courier, monospace',
};

const WEIGHT_CLASS = {
    normal: "font-normal", semibold: "font-semibold", bold: "font-bold", black: "font-extrabold",
};
const ALIGN_CLASS = { left: "text-left", center: "text-center", right: "text-right" };
const TRANSFORM_CLASS = { none: "", uppercase: "uppercase", capitalize: "capitalize" };
const TRACKING_CLASS = {
    tight: "tracking-tight", normal: "", wide: "tracking-wide",
    wider: "tracking-wider", widest: "tracking-widest",
};

// Only the identity block is arranged here. The body of a document (the marks
// table and what follows) is drawn by the document itself — those elements are
// in the layout so they can be reordered and hidden later, not so this
// component can invent them.
const MASTHEAD_KEYS = ["logo", "motto", "school_name", "address", "estd", "contact", "document_title"];

function elementStyle(el) {
    const size = Math.max(50, Math.min(300, Number(el?.size) || 100));
    return {
        fontFamily: ELEMENT_FONTS[el?.font] || undefined,
        // em, so it multiplies whatever the element's natural size is rather
        // than replacing the hierarchy with one flat number.
        fontSize: size === 100 ? undefined : `${size / 100}em`,
        color: el?.color || undefined,
    };
}
function elementClass(el, base = "") {
    return [base, WEIGHT_CLASS[el?.weight] || "", ALIGN_CLASS[el?.align] || "text-center",
        TRANSFORM_CLASS[el?.transform] || "", TRACKING_CLASS[el?.tracking] || "",
        el?.italic ? "italic" : "", el?.underline ? "underline" : ""].filter(Boolean).join(" ");
}

// The text/logo each element shows. Returns null when the school has no value
// for it AND we are not selecting — in the builder an empty element still shows
// a faint placeholder so it can be clicked and configured.
function elementContent(el, school, title, selectable) {
    const css = elementStyle(el);
    const logoSrc = school?.image ? formatImagePath(school.image) : null;
    const ghost = (label) => selectable
        ? <span className="opacity-30 italic">({label})</span> : null;

    switch (el.key) {
        case "logo":
            if (!logoSrc) return ghost("logo");
            return (
                <div className={elementClass(el, "w-full")}>
                    <Image unoptimized src={logoSrc} alt="" width={90} height={90}
                        className="inline-block object-contain"
                        style={{ height: `${(Number(el.size) || 100) * 0.6}px`, width: "auto" }} />
                </div>
            );
        case "motto":
            return school?.motto
                ? <p className={elementClass(el, "italic")} style={css}>&ldquo;{school.motto}&rdquo;</p>
                : ghost("motto");
        case "school_name":
            return <h1 className={elementClass(el, "text-2xl leading-tight")} style={css}>
                {school?.school_name || school?.name || ghost("school name")}
            </h1>;
        case "address":
            return school?.address
                ? <p className={elementClass(el)} style={css}>{school.address}</p> : ghost("address");
        case "estd":
            return school?.estd
                ? <p className={elementClass(el)} style={css}>ESTD. : {school.estd}</p> : ghost("estd");
        case "contact": {
            const bits = [school?.contact, school?.email].filter(Boolean);
            return bits.length
                ? <p className={elementClass(el)} style={css}>{bits.join("  ·  ")}</p> : ghost("phone / email");
        }
        case "document_title":
            return <h2 className={elementClass(el, "text-xl mt-2 tracking-wide")} style={css}>{title || ghost("title")}</h2>;
        default:
            return null;
    }
}

/**
 * @param layout       ordered element list (from DocumentStyle.effective_layout)
 * @param school       the school profile (name, address, contact, email, image, …)
 * @param title        the document's own title, e.g. "GRADE-SHEET"
 * @param selectable   builder mode: elements become clickable, draggable, outline on hover
 * @param selectedKey  which element is currently selected (drawn with a ring)
 * @param onSelect     called with an element key when one is clicked
 * @param onReorder    called (fromKey, toKey) when one masthead element is dragged onto another
 */
function DocumentMasthead({ layout, school, title, selectable = false, selectedKey = null, onSelect, onReorder }) {
    const all = Array.isArray(layout) ? layout : [];
    // In builder mode we show hidden elements too (dimmed), so they can be
    // clicked and switched back on. In a real document, hidden means gone.
    const elements = all.filter((el) => MASTHEAD_KEYS.includes(el?.key)
        && (selectable || el?.visible !== false));

    if (!elements.length) return null;

    return (
        <div className="w-full doc-masthead">
            {elements.map((el) => {
                const content = elementContent(el, school, title, selectable);
                if (!selectable) return <div key={el.key}>{content}</div>;

                const selected = selectedKey === el.key;
                const hidden = el.visible === false;
                return (
                    <div key={el.key}
                        draggable={!!onReorder}
                        onDragStart={(e) => { e.dataTransfer.setData("text/plain", el.key); e.dataTransfer.effectAllowed = "move"; }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                        onDrop={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            const from = e.dataTransfer.getData("text/plain");
                            if (from && from !== el.key) onReorder?.(from, el.key);
                        }}
                        onClick={(e) => { e.stopPropagation(); onSelect?.(el.key); }}
                        title={onReorder ? "Click to edit · drag to reorder" : "Click to edit this part"}
                        className={`relative rounded transition-all duration-100 ${onReorder ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
                            ${selected ? "ring-2 ring-teal-500 ring-offset-1"
                                : "hover:ring-1 hover:ring-teal-300"}
                            ${hidden ? "opacity-30" : ""}`}>
                        {content}
                    </div>
                );
            })}
        </div>
    );
}

export default DocumentMasthead;
export { MASTHEAD_KEYS, elementStyle, elementClass, ELEMENT_FONTS };
