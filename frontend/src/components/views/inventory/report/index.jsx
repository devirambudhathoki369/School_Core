import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import {
    BanknotesIcon, CubeIcon, ArchiveBoxIcon, ExclamationTriangleIcon, TrashIcon,
} from "@heroicons/react/24/outline";

import { useAppContext } from "@/contexts/AppContext";
import { Section } from "@/components/sections";
import { TextInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import { getInventoryReport } from "@/services/functions/inventory";

function Kpi({ label, value, sub, Icon, gradient }) {
    return (
        <div className={`rounded-xl shadow-md ${gradient} p-4 flex items-center gap-3`}>
            <div className="rounded-lg bg-white/40 p-2.5"><Icon className="h-6 w-6 text-gray-800" /></div>
            <div className="flex flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-700">{label}</span>
                <span className="text-2xl font-bold text-gray-900 leading-tight">{value}</span>
                {sub && <span className="text-[11px] text-gray-700/80">{sub}</span>}
            </div>
        </div>
    );
}

function InventoryReport() {
    const { user: { user }, fiscalYear: { year } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    const [filters, setFilters] = useState({ date_from: "", date_to: "" });
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    async function load() {
        setLoading(true);
        const res = await getInventoryReport({
            school: schoolId,
            academic_year: year?.academic_year || "",
            date_from: filters.date_from || "",
            date_to: filters.date_to || "",
        });
        setData(res || null);
        setLoading(false);
    }
    useEffect(() => { if (schoolId) load(); }, [schoolId, year?.academic_year]);

    const rs = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;

    return (
        <div className="flex flex-col gap-y-4">
            <Section title="Inventory Report" description="Investment & stock for the selected academic year. Add a date range to narrow purchases/issues.">
                <TextInput input={{ name: "date_from", label: "Date from (BS)" }} value={filters.date_from} onChange={({ name, value }) => setFilters((s) => ({ ...s, [name]: value }))} />
                <TextInput input={{ name: "date_to", label: "Date to (BS)" }} value={filters.date_to} onChange={({ name, value }) => setFilters((s) => ({ ...s, [name]: value }))} />
                <div className="sm:col-span-4 flex items-end">
                    <Button variant="outlined" onClick={load}>Apply</Button>
                </div>
            </Section>

            {loading ? <Loader /> : !data ? null : (
                <>
                    <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
                        <Kpi label="Total Investment" value={rs(data.total_investment)} sub={`${data.purchase_count} purchases`} Icon={BanknotesIcon} gradient="bg-teal-50 border border-teal-100" />
                        <Kpi label="Items" value={data.total_items} sub={`${data.total_units_in_stock} units in stock`} Icon={CubeIcon} gradient="bg-sky-50 border border-sky-100" />
                        <Kpi label="Issues" value={data.issue_count} sub="stock-outs this period" Icon={ArchiveBoxIcon} gradient="bg-emerald-50 border border-emerald-100" />
                        <Kpi label="Wastage" value={rs(data.total_wastage_value)} sub={`${data.wastage_count || 0} write-offs`} Icon={TrashIcon} gradient="bg-rose-50 border border-rose-100" />
                        <Kpi label="Low Stock" value={data.low_stock_count} sub="at/below reorder level" Icon={ExclamationTriangleIcon} gradient="bg-amber-50 border border-amber-100" />
                    </div>

                    <div className="grid lg:grid-cols-2 gap-3">
                        {/* investment by category */}
                        <div className="rounded-xl bg-white/70 shadow border border-teal-100 p-4">
                            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600 mb-2">Investment by Category</h3>
                            {(!data.category_investment || data.category_investment.length === 0) ? (
                                <p className="text-xs text-gray-400">No purchases in this period.</p>
                            ) : (
                                <div className="flex flex-col gap-1.5">
                                    {data.category_investment.map((c, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm">
                                            <span className="capitalize">{c.category}</span>
                                            <span className="font-semibold">{rs(c.total)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* low stock items */}
                        <div className="rounded-xl bg-white/70 shadow border border-rose-100 p-4">
                            <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600 mb-2">Low-stock Items</h3>
                            {(!data.low_stock_items || data.low_stock_items.length === 0) ? (
                                <p className="text-xs text-gray-400">All items above reorder level. 👍</p>
                            ) : (
                                <div className="flex flex-col gap-1.5">
                                    {data.low_stock_items.map((it) => (
                                        <div key={it.id} className="flex items-center justify-between text-sm">
                                            <span className="capitalize">{it.name}</span>
                                            <span className="font-semibold text-rose-600">{it.stock} left</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* wastage by item (valued at last purchase price) */}
                        <div className="rounded-xl bg-white/70 shadow border border-rose-200 p-4 lg:col-span-2">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600">Wastage by Item</h3>
                                <span className="text-xs text-gray-500">valued at last purchase price</span>
                            </div>
                            {(!data.wastage_items || data.wastage_items.length === 0) ? (
                                <p className="text-xs text-gray-400">No wastage in this period. 🎉</p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="text-left text-gray-500">
                                            <tr>
                                                <th className="py-1 pr-2">Item</th>
                                                <th className="py-1 px-2">Category</th>
                                                <th className="py-1 px-2 text-right">Wasted Qty</th>
                                                <th className="py-1 px-2 text-right">Rate</th>
                                                <th className="py-1 pl-2 text-right">Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.wastage_items.map((w) => (
                                                <tr key={w.id} className="border-t border-gray-100">
                                                    <td className="py-1 pr-2 font-semibold capitalize">{w.name}</td>
                                                    <td className="py-1 px-2 capitalize">{w.category}</td>
                                                    <td className="py-1 px-2 text-right">{w.quantity}</td>
                                                    <td className="py-1 px-2 text-right">{w.unit_price ? rs(w.unit_price) : "—"}</td>
                                                    <td className="py-1 pl-2 text-right font-semibold text-rose-600">{rs(w.value)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t border-gray-200 font-bold">
                                                <td className="py-1 pr-2" colSpan={4}>Total wastage</td>
                                                <td className="py-1 pl-2 text-right text-rose-700">{rs(data.total_wastage_value)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default InventoryReport;
