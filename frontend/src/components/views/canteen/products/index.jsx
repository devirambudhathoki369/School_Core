import { useEffect, useMemo, useState } from "react";
import { Button } from "@material-tailwind/react";
import { PlusIcon, QueueListIcon, ScaleIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import Loader from "@/components/Loader";
import BasicTable from "@/components/tables/BasicTable";
import { customAction, deleteAction, editAction } from "@/components/tables/actions";
import { deleteItem, deleteUnit, getProducts, getUnits, setItemAvailable } from "@/services/functions/canteen";
import { CanteenTabs, Note, StatusPill, TabPanel, rs, useCanteenScope } from "../common";
import { ProductFormDialog, UnitFormDialog } from "./ProductDialogs";

const soldOutAction = customAction({ text: "Sold out / back", action: "toggle", tooltip: "Mark sold out, or back on the counter" });
const PRODUCT_ACTIONS = [editAction, soldOutAction, deleteAction];
const UNIT_ACTIONS = [editAction, deleteAction];
const TABS = [
    { key: "products", label: "Products", icon: QueueListIcon },
    { key: "units", label: "Units", icon: ScaleIcon },
];

function Price({ item }) {
    return (
        <span className="app-cell-text block px-2 whitespace-nowrap tabular-nums text-blue-gray-900">
            {item?.sold_at_counter ? rs(item.price) : "—"}
        </span>
    );
}
function Availability({ item }) {
    if (!item?.sold_at_counter) return <span className="block px-2"><StatusPill text="Not at the counter" /></span>;
    return <span className="block px-2">{item.is_available ? <StatusPill text="On the counter" tone="green" /> : <StatusPill text="Sold out" tone="amber" />}</span>;
}

const PRODUCT_COLUMNS = [
    ["id", "id"], ["name", "product name"], ["unit_name", "unit"], ["remarks", "remark"],
    ["price", "counter price", null, false, null, Price], ["is_available", "counter", null, false, null, Availability],
];
const UNIT_COLUMNS = [["id", "id"], ["name", "unit name"], ["products", "products"]];

/**
 * PRODUCT SETUP — what the canteen sells, and how it is measured.
 *
 * A unit is a short list set once (liter, plate, half). A product names its unit
 * and a remark, and a counter price if the counter sells it. What is billed by
 * the month (Day care) is not a product: see Facility Setup.
 */
function CanteenProducts() {
    const { school, updateNotification } = useCanteenScope();
    const [tab, setTab] = useState("products");
    const [products, setProducts] = useState(null);
    const [units, setUnits] = useState(null);
    const [productDialog, setProductDialog] = useState({ open: false, item: null });
    const [unitDialog, setUnitDialog] = useState({ open: false, unit: null });

    async function load() {
        if (!school) return;
        const [p, u] = await Promise.all([getProducts(school), getUnits(school)]);
        setProducts(p);
        setUnits(u);
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [school]);

    const productRows = useMemo(() => (products || []).map((p) => ({ ...p, price: Number(p.price || 0), unit_name: p.unit_name || "—", remarks: p.remarks || "" })), [products]);

    async function onProductAction(action, id, item) {
        if (action === "edit") setProductDialog({ open: true, item });
        else if (action === "toggle") {
            if (!item.sold_at_counter) return updateNotification("", `${item.name} is not sold at the counter.`);
            const [status, message] = await setItemAvailable(school, item.id, !item.is_available);
            updateNotification(status === 200 ? 200 : 400, message || "Failed.");
            if (status === 200) load();
        } else if (action === "delete") {
            if (!await confirmAction({
                title: `Remove ${item.name}?`, confirmText: "Remove",
                body: "It leaves the list and the counter. Every sale and bill already made keeps its name and amount. "
                    + "If it is only out for today, use Sold out instead.",
            })) return;
            const [status, message] = await deleteItem(school, item.id);
            updateNotification(status === 200 ? 200 : 400, message || "Failed.");
            if (status === 200) load();
        }
    }
    async function onUnitAction(action, id, unit) {
        if (action === "edit") setUnitDialog({ open: true, unit });
        else if (action === "delete") {
            if (!await confirmAction({
                title: `Remove the unit ${unit.name}?`, confirmText: "Remove",
                body: "Only a unit no product uses can be removed.",
            })) return;
            const [status, message] = await deleteUnit(school, unit.id);
            updateNotification(status === 200 ? 200 : 400, message || "Failed.");
            if (status === 200) load();
        }
    }
    function saved(message) {
        setProductDialog((s) => ({ ...s, open: false }));
        setUnitDialog((s) => ({ ...s, open: false }));
        updateNotification(200, message);
        load();
    }

    if (products === null || units === null) return <Loader />;

    return (
        <div className="flex flex-col gap-y-4">
            <CanteenTabs label="Product Setup" active={tab} onChange={setTab}
                tabs={TABS.map((t) => ({ ...t, count: t.key === "products" ? products.length : units.length }))} />

            {tab === "products" && (
                <TabPanel tab="products">
                    {units.length < 1 && <Note tone="amber">Add your units first (liter, plate, half): every product names one.</Note>}
                    <BasicTable name="Products" columns={PRODUCT_COLUMNS} data={productRows} showSelected={false} dense rowView={false}
                        wideColumns={["remarks"]} mobileColumns={["name", "unit_name"]} detailColumns={null}
                        actions={PRODUCT_ACTIONS} onSelect={onProductAction}
                        topActions={
                            <Button color="teal" className="py-2 px-4 flex items-center gap-1" onClick={() => setProductDialog({ open: true, item: null })}>
                                <PlusIcon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" /> Add product
                            </Button>
                        } />
                </TabPanel>
            )}
            {tab === "units" && (
                <TabPanel tab="units">
                <BasicTable name="Units" columns={UNIT_COLUMNS} data={units} showSelected={false} dense rowView={false}
                    actions={UNIT_ACTIONS} onSelect={onUnitAction}
                    topActions={
                        <Button color="teal" className="py-2 px-4 flex items-center gap-1" onClick={() => setUnitDialog({ open: true, unit: null })}>
                            <PlusIcon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" /> Add unit
                        </Button>
                    } />
                </TabPanel>
            )}

            <ProductFormDialog open={productDialog.open} item={productDialog.item} units={units} school={school}
                onClose={() => setProductDialog((s) => ({ ...s, open: false }))} onSaved={saved} />
            <UnitFormDialog open={unitDialog.open} unit={unitDialog.unit} school={school}
                onClose={() => setUnitDialog((s) => ({ ...s, open: false }))} onSaved={saved} />
        </div>
    );
}

export default CanteenProducts;
