import { Card } from "@material-tailwind/react";
import { CheckIcon } from "@heroicons/react/20/solid";

// en-IN money, two decimals — the same figures the payment summary below uses,
// so "Rs. 22400" here and "Rs. 22,400.00" there are no longer the same number
// written two ways.
function rs(value) {
    const n = Number(value);
    return `Rs. ${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

// `isSelected` is the single source of truth (it reads straight off
// selectedBills). Keeping a local copy let the tick drift out of step with the
// row's actual state — after a payment clears selectedBills, for instance, the
// ticks stayed on. The running total is derived by the parent for the same
// reason: an accumulated `total ± billAmount` drifts the moment the underlying
// bill amount changes beneath it.
//
// A selectable row is a real checkbox to the keyboard and to a screen reader:
// Tab reaches it, Space or Enter toggles it. It was a clickable card that only a
// mouse could use, with a green dot as the only sign it was chosen.
export default function TitleBill({ title, rate, billAmount, onSelect, isSelected, disableClick = false }) {
    const checked = !!isSelected;
    const selectable = !disableClick;
    const toggle = () => { if (selectable) onSelect(); };
    //
    return (
        <Card onClick={toggle}
            role={selectable ? 'checkbox' : undefined}
            aria-checked={selectable ? checked : undefined}
            tabIndex={selectable ? 0 : undefined}
            onKeyDown={(e) => {
                if (!selectable) return;
                if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
            }}
            className={`app-titlebill grid gap-x-3 rounded-lg grid-cols-3 justify-between items-center w-full py-2.5 my-1 px-4 sm:px-8
                ${selectable ? 'is-selectable' : 'is-total'} ${checked ? 'is-selected' : ''}`}>
            <span className="capitalize font-semibold flex items-center gap-x-2.5 min-w-0">
                {selectable &&
                    <span className="app-check" aria-hidden="true">
                        {checked && <CheckIcon />}
                    </span>}
                <span className="truncate">{title}</span>
            </span>
            <span className="tabular-nums">{rate ? rate : ``}</span>
            <span className="text-start font-semibold tabular-nums">
                {billAmount === '' || billAmount === null || billAmount === undefined ? '' : rs(billAmount)}
            </span>
        </Card>
    );
}
