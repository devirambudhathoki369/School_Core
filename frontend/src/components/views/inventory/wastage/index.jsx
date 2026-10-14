import TransactionEntry from "../transactions/TransactionEntry";
import { INV_TXN } from "@/services/functions/inventory";

export default function InventoryWastage() {
    return <TransactionEntry txnType={INV_TXN.WASTAGE} />;
}
