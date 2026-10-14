import TransactionEntry from "../transactions/TransactionEntry";
import { INV_TXN } from "@/services/functions/inventory";

export default function InventoryPurchases() {
    return <TransactionEntry txnType={INV_TXN.PURCHASE} />;
}
