// TAX INVOICE numbering.
import { __save } from ".";

const TAX_INVOICE_API = "/api/tax_invoice";

/**
 * Claims the tax invoice number for a posting. The first call mints the next
 * serial number for the school's fiscal year; later calls for the same posting
 * return the number already issued, so a reprint matches the paper the guardian
 * holds. Returns the number, or null if it could not be issued.
 *
 * `source_key` is the stable identity of the posting — see StudentTaxInvoice
 * on the backend for the accepted shapes.
 */
export async function claimTaxInvoiceNo({ school, source_key, student, date }) {
    const [, , data] = await __save(TAX_INVOICE_API, { school, source_key, student, date });
    return data?.invoice_id ?? null;
}

/** Stable identity of a single debit row in the trial balance. */
export function ledgerSourceKey(ledgerId) {
    return `ledger:${ledgerId}`;
}

/** Stable identity of a class-wise merged posting for one student. */
export function postingSourceKey(studentId, academicYear, months) {
    return `posting:${studentId}:${academicYear || ''}:${(months || []).join('_')}`;
}
