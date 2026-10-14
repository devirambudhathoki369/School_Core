import { confirmAction } from "@/components/ConfirmDialog";
import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import { TrashIcon } from "@heroicons/react/24/outline";

import { useAppContext } from "@/contexts/AppContext";
import { Section, ButtonsSecion } from "@/components/sections";
import { SelectInput, TextInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import {
    getInventoryItems, getInventoryTransactions,
    saveInventoryTransaction, deleteInventoryTransaction, INV_TXN,
} from "@/services/functions/inventory";

// One component for both Purchases (stock-in, investment) and Issues (stock-out).
function TransactionEntry({ txnType }) {
    const isPurchase = txnType === INV_TXN.PURCHASE;
    const isWastage = txnType === INV_TXN.WASTAGE;
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;

    const blank = () => ({
        item: "", quantity: "", unit_price: "",
        date: user?.today || "", supplier: "", party_or_purpose: "", remarks: "",
    });
    const [items, setItems] = useState([]);
    const [rows, setRows] = useState([]);
    const [form, setForm] = useState(blank());
    const [loading, setLoading] = useState(true);

    async function load() {
        setLoading(true);
        const [its, txns] = await Promise.all([
            getInventoryItems(schoolId),
            getInventoryTransactions({ school: schoolId, txn_type: txnType, academic_year: year?.academic_year || "" }),
        ]);
        setItems(Array.isArray(its) ? its : []);
        setRows(Array.isArray(txns) ? txns : []);
        setLoading(false);
    }
    useEffect(() => { if (schoolId) load(); }, [schoolId, year?.academic_year, txnType]);

    const itemOptions = items.map((i) => ({ name: `${i.name}${i.unit ? ` (${i.unit})` : ""} — stock ${i.stock}`, value: i.id }));
    function onChange({ name, value }) { setForm((s) => ({ ...s, [name]: value })); }

    const lineTotal = isPurchase
        ? (Number(form.quantity) || 0) * (Number(form.unit_price) || 0)
        : 0;

    async function onSave(e) {
        e.preventDefault();
        if (!form.item) return updateNotification("", "Pick an item.");
        if (!form.quantity || Number(form.quantity) <= 0) return updateNotification("", "Enter a quantity.");
        const payload = {
            school: schoolId, item: form.item, txn_type: txnType,
            quantity: form.quantity,
            unit_price: isPurchase ? (form.unit_price || null) : null,
            total: isPurchase ? lineTotal : null,
            date: form.date || null,
            academic_year: year?.academic_year,
            economic_year: year?.economic_year || null,
            supplier: isPurchase ? (form.supplier || null) : null,
            party_or_purpose: isPurchase ? null : (form.party_or_purpose || null),
            remarks: form.remarks || null,
        };
        const [status, message] = await saveInventoryTransaction(payload);
        if (status === 200) { updateNotification(200, isPurchase ? "Purchase recorded!" : isWastage ? "Wastage recorded!" : "Issue recorded!"); setForm(blank()); load(); }
        else updateNotification(400, message || "Failed.");
    }
    async function onDelete(id) {
        if (!await confirmAction({
            title: "Delete this record?",
            body: "The stock movement is reversed and the item's on-hand quantity is recalculated.",
        })) return;
        const [status, message] = await deleteInventoryTransaction(schoolId, id);
        if (status === 200) load(); else updateNotification(400, message || "Failed.");
    }

    if (loading) return <Loader />;

    const title = isPurchase ? "Record Purchase" : isWastage ? "Record Wastage" : "Record Issue";
    const total = rows.reduce((n, r) => n + (Number(r.total) || 0), 0);

    return (
        <div className="flex flex-col gap-y-4">
            <form onSubmit={onSave}>
                <Section title={title} description={isPurchase ? "Stock in — adds to investment & stock." : isWastage ? "Stock out — written off as expired / spoiled / leftover waste." : "Stock out — reduces stock."}>
                    <SelectInput input={{ name: "item", label: "Item", options: itemOptions }} value={form.item} onChange={onChange} />
                    <TextInput input={{ name: "quantity", label: "Quantity", type: "number" }} value={form.quantity} onChange={onChange} />
                    {isPurchase && <TextInput input={{ name: "unit_price", label: "Unit price (Rs.)", type: "number" }} value={form.unit_price} onChange={onChange} />}
                    {isPurchase && <TextInput input={{ name: "total", label: "Line total (Rs.)", readOnly: true }} value={lineTotal || ""} onChange={() => null} />}
                    <TextInput input={{ name: "date", label: "Date (BS)" }} value={form.date} onChange={onChange} />
                    {isPurchase
                        ? <TextInput input={{ name: "supplier", label: "Supplier (optional)" }} value={form.supplier} onChange={onChange} />
                        : <TextInput input={{ name: "party_or_purpose", label: isWastage ? "Reason (expired / spoiled / leftover)" : "Issued to / purpose" }} value={form.party_or_purpose} onChange={onChange} />}
                    <TextInput input={{ name: "remarks", label: "Remarks" }} value={form.remarks} onChange={onChange} grid={8} />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" type="submit">{isPurchase ? "Save Purchase" : isWastage ? "Save Wastage" : "Save Issue"}</Button>
                </ButtonsSecion>
            </form>

            <div className="flex items-center justify-between">
                <span className="font-semibold text-gray-700">{rows.length} record{rows.length === 1 ? "" : "s"} this year</span>
                {isPurchase && <span className="font-bold text-teal-700">Total: Rs. {total.toLocaleString()}</span>}
            </div>
            {rows.length === 0 ? <NotFound error="No records yet." /> : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                        <thead className="bg-table-header text-left">
                            <tr>
                                <th className="px-3 py-2">Date</th><th className="px-3 py-2">Item</th>
                                <th className="px-3 py-2 text-right">Qty</th>
                                {isPurchase && <th className="px-3 py-2 text-right">Rate</th>}
                                {isPurchase && <th className="px-3 py-2 text-right">Total</th>}
                                <th className="px-3 py-2">{isPurchase ? "Supplier" : isWastage ? "Reason" : "Issued to / purpose"}</th>
                                <th className="px-3 py-2 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-t border-gray-100">
                                    <td className="px-3 py-2">{r.date}</td>
                                    <td className="px-3 py-2 font-semibold capitalize">{r.item_name}</td>
                                    <td className="px-3 py-2 text-right">{r.quantity}</td>
                                    {isPurchase && <td className="px-3 py-2 text-right">{r.unit_price ?? "—"}</td>}
                                    {isPurchase && <td className="px-3 py-2 text-right font-semibold">{r.total ?? "—"}</td>}
                                    <td className="px-3 py-2">{isPurchase ? (r.supplier || "—") : (r.party_or_purpose || "—")}</td>
                                    <td className="px-3 py-2 text-right">
                                        <button type="button" onClick={() => onDelete(r.id)} className="p-1.5 rounded bg-rose-50 text-rose-600"><TrashIcon className="w-4 h-4" /></button>
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

export default TransactionEntry;
