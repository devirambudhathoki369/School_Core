import { confirmAction } from "@/components/ConfirmDialog";
import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import { TrashIcon, PencilSquareIcon } from "@heroicons/react/24/outline";

import { useAppContext } from "@/contexts/AppContext";
import { Section, ButtonsSecion } from "@/components/sections";
import { SelectInput, TextInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import {
    getInventoryCategories, saveInventoryCategory, deleteInventoryCategory,
    getInventoryItems, saveInventoryItem, deleteInventoryItem,
} from "@/services/functions/inventory";

const emptyItem = () => ({ name: "", category: "", unit: "", reorder_level: "" });

function InventoryItems() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [categories, setCategories] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [catName, setCatName] = useState("");
    const [form, setForm] = useState(emptyItem());
    const [editingId, setEditingId] = useState(null);

    async function load() {
        setLoading(true);
        const [cats, its] = await Promise.all([
            getInventoryCategories(schoolId),
            getInventoryItems(schoolId),
        ]);
        setCategories(Array.isArray(cats) ? cats : []);
        setItems(Array.isArray(its) ? its : []);
        setLoading(false);
    }
    useEffect(() => { if (schoolId) load(); }, [schoolId]);

    const catOptions = categories.map((c) => ({ name: c.name, value: c.id }));

    async function onAddCategory(e) {
        e.preventDefault();
        if (!catName.trim()) return;
        const [status, message] = await saveInventoryCategory({ school: schoolId, name: catName.trim() });
        if (status === 200) { setCatName(""); updateNotification(200, "Category added!"); load(); }
        else updateNotification(400, message || "Failed.");
    }
    async function onDeleteCategory(id) {
        if (!await confirmAction({
            title: "Delete this category?",
            body: "Items filed under it are not deleted, but they lose their category. A category still in use cannot be removed.",
        })) return;
        const [status, message] = await deleteInventoryCategory(schoolId, id);
        if (status === 200) load(); else updateNotification(400, message || "In use.");
    }

    function onFormChange({ name, value }) { setForm((s) => ({ ...s, [name]: value })); }
    function resetForm() { setForm(emptyItem()); setEditingId(null); }

    async function onSaveItem(e) {
        e.preventDefault();
        if (!form.name.trim()) return updateNotification("", "Item name required.");
        const payload = {
            id: editingId || undefined, school: schoolId, name: form.name.trim(),
            category: form.category || null, unit: form.unit || null,
            reorder_level: form.reorder_level || null,
        };
        const [status, message] = await saveInventoryItem(payload);
        if (status === 200) { updateNotification(200, editingId ? "Item updated!" : "Item added!"); resetForm(); load(); }
        else updateNotification(400, message || "Failed.");
    }
    function onEditItem(it) {
        setForm({ name: it.name, category: it.category || "", unit: it.unit || "", reorder_level: it.reorder_level ?? "" });
        setEditingId(it.id);
    }
    async function onDeleteItem(id) {
        if (!await confirmAction({
            title: "Delete this item?",
            body: "An item that already has stock transactions cannot be deleted — its history has to stay.",
        })) return;
        const [status, message] = await deleteInventoryItem(schoolId, id);
        if (status === 200) load(); else updateNotification(400, message || "Has transactions.");
    }

    if (loading) return <Loader />;

    return (
        <div className="flex flex-col gap-y-4">
            {/* categories */}
            <Section title="Categories" description="Group inventory items (e.g. Stationery, Furniture, Lab).">
                <form onSubmit={onAddCategory} className="sm:col-span-8 flex items-end gap-x-2">
                    <div className="flex-1">
                        <TextInput input={{ name: "catName", label: "New category" }} value={catName}
                            onChange={({ value }) => setCatName(value)} grid={12} />
                    </div>
                    <Button variant="outlined" type="submit">Add</Button>
                </form>
                <div className="sm:col-span-8 flex flex-wrap gap-2 mt-1">
                    {categories.length === 0 ? <span className="text-xs text-gray-400">No categories yet.</span> :
                        categories.map((c) => (
                            <span key={c.id} className="inline-flex items-center gap-x-1 rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-sm">
                                {c.name}
                                <button type="button" onClick={() => onDeleteCategory(c.id)} className="text-rose-500 hover:text-rose-700"><TrashIcon className="w-3.5 h-3.5" /></button>
                            </span>
                        ))}
                </div>
            </Section>

            {/* item form */}
            <form onSubmit={onSaveItem}>
                <Section title={editingId ? "Edit Item" : "Add Item"}>
                    <TextInput input={{ name: "name", label: "Item name" }} value={form.name} onChange={onFormChange} />
                    <SelectInput input={{ name: "category", label: "Category", options: catOptions }} value={form.category} onChange={onFormChange} />
                    <TextInput input={{ name: "unit", label: "Unit (pcs/kg/ltr)" }} value={form.unit} onChange={onFormChange} />
                    <TextInput input={{ name: "reorder_level", label: "Reorder level", type: "number" }} value={form.reorder_level} onChange={onFormChange} />
                </Section>
                <ButtonsSecion>
                    {editingId && <Button variant="text" type="button" onClick={resetForm}>Cancel</Button>}
                    <Button variant="outlined" type="submit">{editingId ? "Update Item" : "Add Item"}</Button>
                </ButtonsSecion>
            </form>

            {/* items table */}
            {items.length === 0 ? <NotFound error="No items yet." /> : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                        <thead className="bg-table-header text-left">
                            <tr>
                                <th className="px-3 py-2">Item</th><th className="px-3 py-2">Category</th>
                                <th className="px-3 py-2">Unit</th><th className="px-3 py-2 text-right">Stock</th>
                                <th className="px-3 py-2 text-right">Reorder</th><th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((it) => (
                                <tr key={it.id} className={`border-t border-gray-100 ${it.low_stock ? "bg-rose-50/50" : ""}`}>
                                    <td className="px-3 py-2 font-semibold capitalize">{it.name}</td>
                                    <td className="px-3 py-2">{it.category_name}</td>
                                    <td className="px-3 py-2">{it.unit}</td>
                                    <td className="px-3 py-2 text-right font-bold">{it.stock}{it.low_stock && <span className="ml-1 text-[10px] text-rose-600 font-semibold">LOW</span>}</td>
                                    <td className="px-3 py-2 text-right text-gray-500">{it.reorder_level ?? "—"}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-end gap-x-1">
                                            <button type="button" onClick={() => onEditItem(it)} className="p-1.5 rounded bg-teal-50 text-teal-700"><PencilSquareIcon className="w-4 h-4" /></button>
                                            <button type="button" onClick={() => onDeleteItem(it.id)} className="p-1.5 rounded bg-rose-50 text-rose-600"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default InventoryItems;
