import { PAYMENT_MODES } from "@/configs/payment";

export function paymentModeLabel(mode) {
    const name = PAYMENT_MODES.find(option => String(option.value) === String(mode))?.name;
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Unspecified';
}

// Sum in paisa. Callers supply only collected amounts, excluding discounts
// and ledger debits; missing historical modes must never default to Cash.
export function collectionByMode(rows, amountForRow) {
    const totals = new Map(PAYMENT_MODES.map(({ value }) => [paymentModeLabel(value), 0]));
    for (const row of rows || []) {
        const amount = Number(amountForRow(row));
        if (!Number.isFinite(amount) || amount === 0) continue;
        const label = paymentModeLabel(row.mode);
        totals.set(label, (totals.get(label) || 0) + Math.round(amount * 100));
    }
    return Array.from(totals, ([payment_mode, paisa]) => ({ payment_mode, total: paisa / 100 }));
}
