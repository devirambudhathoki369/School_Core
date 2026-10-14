import dynamic from "next/dynamic";

const InventoryItems = dynamic(() => import("@/components/views/inventory/items"));
const InventoryPurchases = dynamic(() => import("@/components/views/inventory/purchases"));
const InventoryIssues = dynamic(() => import("@/components/views/inventory/issues"));
const InventoryWastage = dynamic(() => import("@/components/views/inventory/wastage"));
const InventoryReport = dynamic(() => import("@/components/views/inventory/report"));

const inventoryViews = {
    "inventory.items": () => <InventoryItems />,
    "inventory.purchases": () => <InventoryPurchases />,
    "inventory.issues": () => <InventoryIssues />,
    "inventory.wastage": () => <InventoryWastage />,
    "inventory.report": () => <InventoryReport />,
};

export default inventoryViews;
