import { Tooltip } from "@material-tailwind/react";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";

/**
 * A yes/no cell.
 *
 * CLASSIC IS UNTOUCHED — same tick, same cross, same colours.
 *
 * Themed, two real defects are fixed:
 *
 * 1. The tooltip read **"Title enabled"** on every row, whatever the row was.
 *    "Title" was a placeholder that shipped; it tells the user nothing and is
 *    the kind of leftover that makes a product feel unfinished. Callers can now
 *    say what the thing is (`label`), and the default drops the stray word.
 * 2. Nothing was exposed to assistive tech. The state was carried purely by an
 *    icon's colour and shape, so a screen reader read the cell as empty. The
 *    icon is now labelled and the colour is never the only signal.
 *
 * `showUnchecked={false}` also used to hand Material Tailwind's `Tooltip` an
 * empty fragment as its child, which is not a valid anchor. Now it renders
 * nothing at all, which is what it meant.
 */
export default function Status({ status, showUnchecked = true, label = "" }) {
    const classes = `w-5 h-5 p-0.5 text-white stroke rounded-full ${status ? 'bg-green-500' : 'bg-red-500'}`;

    if (!status && !showUnchecked) return null;

    const state = status ? "enabled" : "disabled";
    const text = `${label ? `${label} ` : ""}${state}`.replace(/^\w/, (c) => c.toUpperCase());
    const Icon = status ? CheckIcon : XMarkIcon;

    return (
        <Tooltip content={text}>
            {/* The span is the tooltip's anchor AND the accessible node: an SVG
                marked `aria-hidden` inside a labelled wrapper reads cleanly,
                whereas labelling the icon itself leaves the tooltip anchor
                unlabelled. */}
            <span role="img" aria-label={text} className="inline-flex align-middle">
                <Icon strokeWidth={2} aria-hidden="true" className={classes} />
            </span>
        </Tooltip>
    );
}
