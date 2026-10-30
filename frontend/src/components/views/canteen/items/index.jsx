import { useEffect, useMemo, useState } from "react";
import { Button } from "@material-tailwind/react";
import { PencilSquareIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import { TextInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { customAction, deleteAction, editAction } from "@/components/tables/actions";
import {
    deleteCategory, deleteItem, getCategories, getItems, saveCategory, setItemAvailable,
} from "@/services/functions/canteen";
import { StatusPill, rs, useCanteenScope, useOnce } from "../common";
import ClassRatesDialog from "./ClassRatesDialog";
import ItemFormDialog from "./ItemFormDialog";

const soldOutAction = customAction({ text: "Sold out / back", action: "toggle", tooltip: "Mark sold out, or back on the counter" });
const ratesAction = customAction({ text: "Class rates", action: "rates", tooltip: "Monthly rate for each class" });
const ITEM_ACTIONS = [editAction, ratesAction, soldOutAction, deleteAction];

function ItemCell({ item }) {
    return (
        <div className="min-w-0 px-2">
            <span className="app-cell-text block break-words text-blue-gray-900 !font-semibold">{item?.name}</span>
            <span className="block text-meta text-[var(--ink-500,#64748b)]">
                {[item?.category_name, item?.food_type_name, item?.code ? `code ${item.code}` : ""].filter(Boolean).join(" · ")}
            </span>
        </div>
    );
}
function Price({ item }) {
    return (
        <span className="app-cell-text block px-2 whitespace-nowrap tabular-nums text-blue-gray-900">
            {item?.sold_at_counter ? rs(item.price) : "—"}
        </span>
    );
}
function Availability({ item }) {
    if (!item?.sold_at_counter) return <span className="block px-2"><StatusPill text="Not at the counter" tone="gray" /></span>;
    return <span className="block px-2">{item.is_available ? <StatusPill text="On the counter" tone="green" /> : <StatusPill text="Sold out" tone="amber" />}</span>;
}
function Monthly({ item }) {
    if (!item?.monthly) return <span className="app-cell-text block px-2 !text-[var(--ink-400,#94a3b8)]">—</span>;
    return (
        <span className="block px-2">
            {item.classes_rated > 0
                ? <StatusPill text={`${item.classes_rated} class rate(s)`} tone="blue" />
                : <StatusPill text="Class rates not set" tone="amber" />}
        </span>
    );
}

const ITEM_COLUMNS = [
    ["name", "item", null, false, null, ItemCell],
    ["price", "counter price", null, false, null, Price],
    ["is_available", "counter", null, false, null, Availability],
    ["monthly", "monthly", null, false, null, Monthly],
    ["category_name", "category"],
    ["code", "code"],
    ["food_type_name", "veg / non-veg"],
];

/**
 * WHAT THE CANTEEN SELLS, AND AT WHAT RATE.
 *
 * Categories are a short list set once (Snacks, Drinks, Meals); items are the
 * register, searched and corrected in place. An item is sold at the counter at
 * its price, billed monthly at a rate set class by class (Class rates), or
 * both — Tiffin can be both. "Sold out" takes an item off the counter for now
 * without touching its prices or its history.
 */
function CanteenItems() {
    const { school, updateNotification } = useCanteenScope();
    const [categories, setCategories] = useState(null);
    const [items, setItems] = useState(null);
    const [catForm, setCatForm] = useState({ name: "", order: 0 });
    const [editingCat, setEditingCat] = useState(null);
    const [dialog, setDialog] = useState({ open: false, item: null });
    const [ratesFor, setRatesFor] = useState(null);
    const [busy, once] = useOnce();

    async function load() {
        if (!school) return;
        const [c, i] = await Promise.all([getCategories(school), getItems(school)]);
        setCategories(c);
        setItems(i);
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [school]);

    const rows = useMemo(() => (items || []).map((i) => ({ ...i, price: Number(i.price || 0) })), [items]);

    async function onSaveCategory(e) {
        e.preventDefault();
        if (!catForm.name.trim()) return updateNotification("", "A category name is required.");
        await once(async () => {
            const [status, message] = await saveCategory({ ...catForm, id: editingCat || undefined, school, name: catForm.name.trim() });
            if (status === 200) {
                updateNotification(200, message || "Saved!");
                setCatForm({ name: "", order: 0 }); setEditingCat(null); load();
            } else updateNotification(400, message || "Failed.");
        });
    }
    async function onDeleteCategory(c) {
        if (!await confirmAction({
            title: `Remove the category ${c.name}?`, confirmText: "Remove",
            body: "Only an empty category can be removed. Move its items to another category first.",
        })) return;
        const [status, message] = await deleteCategory(school, c.id);
        updateNotification(status === 200 ? 200 : 400, message || "Failed.");
        if (status === 200) load();
    }

    async function onItemAction(action, id, item) {
        if (action === "edit") setDialog({ open: true, item });
        else if (action === "rates") setRatesFor(item);
        else if (action === "toggle") {
            if (!item.sold_at_counter) return updateNotification("", `${item.name} is not sold at the counter.`);
            const [status, message] = await setItemAvailable(school, item.id, !item.is_available);
            updateNotification(status === 200 ? 200 : 400, message || "Failed.");
            if (status === 200) load();
        } else if (action === "delete") {
            if (!await confirmAction({
                title: `Remove ${item.name}?`, confirmText: "Remove",
                body: "It leaves the list and the counter. Every sale already made keeps its name and price on the slip and in the reports. "
                    + "If it is only out for today, use Sold out instead.",
            })) return;
            const [status, message] = await deleteItem(school, item.id);
            updateNotification(status === 200 ? 200 : 400, message || "Failed.");
            if (status === 200) load();
        }
    }

    if (categories === null || items === null) return <Loader />;

    return (
        <div className="flex flex-col gap-y-4">
            <form onSubmit={onSaveCategory}>
                <Section title={editingCat ? "Edit category" : "Categories"}
                    description={"How the counter groups its tiles: Snacks, Drinks, Meals.\nOptional — an item with no category shows under Other."}>
                    <TextInput input={{ name: "name", label: "Category (e.g. Snacks)", required: true }} value={catForm.name}
                        onChange={({ value }) => setCatForm((s) => ({ ...s, name: value }))} />
                    <TextInput input={{ name: "order", label: "Order", type: "number" }} value={catForm.order}
                        onChange={({ value }) => setCatForm((s) => ({ ...s, order: value }))} />
                </Section>
                <ButtonsSecion>
                    {editingCat && <Button variant="text" type="button" onClick={() => { setCatForm({ name: "", order: 0 }); setEditingCat(null); }}>Cancel</Button>}
                    <Button variant="outlined" type="submit" disabled={busy}>
                        {busy ? "Saving…" : editingCat ? "Update category" : "Add category"}
                    </Button>
                </ButtonsSecion>
            </form>

            {categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                        <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white pl-3 pr-1 py-1 text-sm">
                            <span className="font-semibold">{c.name}</span>
                            <span className="text-xs text-gray-500">({c.items})</span>
                            <button type="button" aria-label={`Edit ${c.name}`} className="p-1 rounded-full text-teal-700 hover:bg-teal-50"
                                onClick={() => { setCatForm({ name: c.name, order: c.order }); setEditingCat(c.id); }}>
                                <PencilSquareIcon className="w-4 h-4" />
                            </button>
                            <button type="button" aria-label={`Remove ${c.name}`} className="p-1 rounded-full text-rose-600 hover:bg-rose-50"
                                onClick={() => onDeleteCategory(c)}>
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <BasicTable name="Canteen items" columns={ITEM_COLUMNS} detailColumns={["category_name", "code", "food_type_name"]}
                rowView={false} mobileColumns={["name"]} data={rows} showSelected={false} dense
                actions={ITEM_ACTIONS} onSelect={onItemAction}
                topActions={
                    <Button color="teal" className="py-2 px-4 flex items-center gap-1" onClick={() => setDialog({ open: true, item: null })}>
                        <PlusIcon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" /> Add item
                    </Button>
                } />

            <ClassRatesDialog item={ratesFor} school={school} onClose={() => setRatesFor(null)}
                onSaved={(message) => { setRatesFor(null); updateNotification(200, message || "Saved!"); load(); }} />
            <ItemFormDialog open={dialog.open} item={dialog.item} school={school} categories={categories}
                onClose={() => setDialog((s) => ({ ...s, open: false }))}
                onSaved={(wasEdit) => {
                    setDialog((s) => ({ ...s, open: false }));
                    updateNotification(200, wasEdit ? "Item updated!" : "Item added!");
                    load();
                }} />
        </div>
    );
}

export default CanteenItems;
