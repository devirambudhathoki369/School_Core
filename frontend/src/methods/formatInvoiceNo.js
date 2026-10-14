// Invoice numbers run serially within an academic year and restart each year.
// Displayed zero-padded to 4 digits (0001, 0002, …). Empty/blank when there is
// no number yet (e.g. reminder bills, which aren't real invoices).
export function formatInvoiceNo(invoiceId) {
    if (invoiceId === null || invoiceId === undefined || invoiceId === "") return "";
    const n = Number(invoiceId);
    if (Number.isNaN(n)) return String(invoiceId);
    return String(n).padStart(4, "0");
}
