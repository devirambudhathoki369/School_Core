import { splitDebitCredit } from "..";

function getTransactionTypeForReport(ledger, alternate = true) {
    /**
     * Here, the dr/cr split is just opposite as of voucher!
     * alternate===true : if a ledger is seen in dr side of voucher, here it'll be in cr side!
     * ...and vice-versa.
     */
    let ts = ledger?.type || null;
    if (!ts && ledger?.ledger_group && ledger?.entry_type) {
        ts = splitDebitCredit(ledger.entry_type, ledger.ledger_group)
        // alternate the result! it's rule!
    }
    if (alternate) {
        if (ts === 1) ts = 2;
        else if (ts === 2) ts = 1;
    }
    return ts;
}

export { getTransactionTypeForReport };