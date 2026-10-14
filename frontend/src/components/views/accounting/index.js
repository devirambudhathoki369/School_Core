import { LEDGER_GROUP_SPLIT } from "./acc_constants";
import { MAPPED_LEDGER_GROUPS } from "./ledger_groups";

function getLedgerType(ledgerId, include_name = false) {
    return MAPPED_LEDGER_GROUPS?.[ledgerId]?.type?.[include_name ? "name" : "value"];
}

function getLedgerGroup(ledgerGroupId) {
    return MAPPED_LEDGER_GROUPS?.[ledgerGroupId];
}

function splitDebitCredit(entry_id, ledgerGroupId) {
    if (entry_id && ledgerGroupId) {
        return LEDGER_GROUP_SPLIT?.[entry_id]?.[ledgerGroupId];
    }
    return null;
}

export { getLedgerType, getLedgerGroup, splitDebitCredit };