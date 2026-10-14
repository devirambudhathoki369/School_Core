import TransactionEntry from "../transactions/TransactionEntry";
import { INV_TXN } from "@/services/functions/inventory";

export default function InventoryIssues() {
    return <TransactionEntry txnType={INV_TXN.ISSUE} />;
}
