from ..constants.payment import EXCEPTION_TITLES, TITLE_NAMES_KEY

# Reserved details-JSON keys that are NOT title ids and must be skipped
# during extraction (the title-name snapshot map, exception labels, etc.).
_NON_TITLE_KEYS = set(EXCEPTION_TITLES) | {TITLE_NAMES_KEY}


def extractTitleIdsFromInvoice(invoiceBill):
    """
    from a single invoice.
    """
    ids = {key for key in invoiceBill.keys() if key not in _NON_TITLE_KEYS}
    return ids


def extractTitleIdsFromLedgers(ledgers):
    """
    extracts title ids from multiple ledgers (StudentLedger.Queryset);
    """
    ids = {
        key
        for ledger in ledgers
        for key in ledger["details"].keys()
        if key not in _NON_TITLE_KEYS
    }
    return ids


def extractTitleIdsFromInvoices(invoices):
    """
    extracts title ids from multiple invoices (Invoice.Queryset);
    """
    ids = {
        key
        for invoice in invoices
        for key in invoice["details"].keys()
        if key not in _NON_TITLE_KEYS
    }
    return ids
