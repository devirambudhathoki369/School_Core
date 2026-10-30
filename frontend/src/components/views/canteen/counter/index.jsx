import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import {
    BanknotesIcon, CalendarDaysIcon, CreditCardIcon, MagnifyingGlassIcon, MinusIcon, PlusIcon, PrinterIcon,
    TrashIcon, UserIcon, XMarkIcon, ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import { useReactToPrint } from "react-to-print";

import { confirmAction } from "@/components/ConfirmDialog";
import Loader from "@/components/Loader";
import {
    BUYER_STAFF, BUYER_STUDENT, BUYER_WALKIN, MAX_QTY, PAY_ACCOUNT, PAY_CASH, PAY_PLAN,
} from "@/configs/canteen";
import {
    findBuyers, getDaySales, getItems, getSale, ringUp, voidSale,
} from "@/services/functions/canteen";
import {
    SetupNeeded, StatusPill, balanceText, balanceTone, lineMoney, paisa, rs, sumMoney, useCanteenScope,
} from "../common";
import CanteenSlip, { slipPageStyle } from "./Slip";

const WALK_IN = { buyer_type: BUYER_WALKIN, id: null, name: "Walk-in customer", detail: "Cash only" };
const PRINT_PREF = "canteen-counter-print-slip";

function newKey() {
    try { return crypto.randomUUID(); } catch { return `k${Date.now()}${Math.random().toString(16).slice(2)}`; }
}
function readPref() {
    try { return localStorage.getItem(PRINT_PREF) !== "0"; } catch { return true; }
}
function writePref(on) {
    try { localStorage.setItem(PRINT_PREF, on ? "1" : "0"); } catch { /* private window */ }
}

/**
 * THE COUNTER.
 *
 * Built for a queue: the buyer box has the cursor the moment the page opens and
 * again after every sale. A card tapped on the USB reader types its number and
 * Enter, which finds the child at once; a roll number or part of a name works
 * the same way. Items are big tiles (a tap adds one), or a short code typed in
 * the item box.
 *
 * The price shown is only a preview. The server prices every line from the
 * item as it stands and checks the account (blocked card, daily limit,
 * balance) with the account locked, so two counters cannot spend the same
 * rupees and a tab left open since yesterday cannot sell at yesterday's price.
 *
 * Each ring-up carries a key. If the connection drops after pressing Pay, the
 * retry carries the same key and gets back the sale already made — the child
 * is never charged twice.
 */
function CanteenCounter() {
    const { school, today, settings, updateNotification } = useCanteenScope();
    const [items, setItems] = useState(null);
    const [category, setCategory] = useState("all");
    const [codeText, setCodeText] = useState("");

    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [buyer, setBuyer] = useState(null);

    const [cart, setCart] = useState([]);
    const [payment, setPayment] = useState(PAY_CASH);
    const [received, setReceived] = useState("");
    const [paying, setPaying] = useState(false);
    const [done, setDone] = useState(null);

    const [sales, setSales] = useState([]);
    const [printSlip, setPrintSlip] = useState(true);
    const [slip, setSlip] = useState(null);

    const buyerRef = useRef(null);
    const keyRef = useRef(null);
    const slipRef = useRef(null);
    const searchSeq = useRef(0);

    const width = Number(settings?.slip_width ?? 80);
    const print = useReactToPrint({ content: () => slipRef.current, pageStyle: slipPageStyle(width) });

    useEffect(() => { setPrintSlip(readPref()); }, []);

    async function loadItems() {
        if (!school) return;
        setItems(await getItems(school, true));
    }
    async function loadSales() {
        if (!school) return;
        setSales(await getDaySales(school, today));
    }
    useEffect(() => { loadItems(); loadSales(); /* eslint-disable-next-line */ }, [school]);
    useEffect(() => { focusBuyer(); }, [items]);

    function focusBuyer() {
        setTimeout(() => buyerRef.current?.focus(), 60);
    }

    /* ------------------------------------------------------------- buyer */
    // As-you-type search for names (debounced). A card is looked up on Enter:
    // the reader types the whole number and presses Enter itself.
    useEffect(() => {
        const q = query.trim();
        if (!school || q.length < 2 || buyer) { setResults([]); return; }
        const seq = ++searchSeq.current;
        const timer = setTimeout(async () => {
            setSearching(true);
            const { buyers } = await findBuyers(school, { q });
            if (seq === searchSeq.current) { setResults(buyers); setSearching(false); }
        }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, school, buyer]);

    async function onBuyerEnter(e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const value = query.trim();
        if (!value) return;
        const seq = ++searchSeq.current;
        setSearching(true);
        // Card first: a card number is exact, a name is not.
        let { buyers } = await findBuyers(school, { card: value });
        let byCard = buyers.length > 0;
        if (!byCard) ({ buyers } = await findBuyers(school, { q: value }));
        if (seq !== searchSeq.current) return;
        setSearching(false);
        if (buyers.length === 1) chooseBuyer(buyers[0]);
        else if (buyers.length > 1) setResults(buyers);
        else {
            setResults([]);
            updateNotification("", `Nobody found for "${value}". Check the card, roll number or name.`);
        }
        if (byCard && buyers.length !== 1) setQuery("");
    }

    function chooseBuyer(b) {
        setBuyer(b);
        setResults([]);
        setQuery("");
        setDone(null);
        if (b.buyer_type === BUYER_WALKIN) setPayment(PAY_CASH);
        // On a monthly type that includes counter meals: already paid for.
        else if (b.counter_plan) setPayment(PAY_PLAN);
        else if (settings?.allow_account && !b.is_blocked && Number(b.available) > 0) setPayment(PAY_ACCOUNT);
        else if (settings?.allow_cash) setPayment(PAY_CASH);
        else setPayment(PAY_ACCOUNT);
    }
    function clearBuyer() {
        setBuyer(null);
        setResults([]);
        setQuery("");
        focusBuyer();
    }

    /* -------------------------------------------------------------- cart */
    const categories = useMemo(() => {
        const seen = new Map();
        (items || []).forEach((i) => { if (!seen.has(i.category_name)) seen.set(i.category_name, 0); seen.set(i.category_name, seen.get(i.category_name) + 1); });
        return [...seen.entries()];
    }, [items]);
    const shown = useMemo(
        () => (items || []).filter((i) => category === "all" || i.category_name === category),
        [items, category]
    );
    // In paisa, so the screen's total is exactly the server's (which re-prices it anyway).
    const total = sumMoney(cart.map((line) => lineMoney(line.price, line.qty)));
    const count = cart.reduce((sum, line) => sum + line.qty, 0);

    function add(item, by = 1) {
        setDone(null);
        setCart((lines) => {
            const found = lines.find((l) => l.item === item.id);
            if (found) {
                return lines
                    .map((l) => l.item === item.id ? { ...l, qty: Math.min(MAX_QTY, Math.max(0, l.qty + by)) } : l)
                    .filter((l) => l.qty > 0);
            }
            if (by < 1) return lines;
            return [...lines, { item: item.id, name: item.name, price: item.price, qty: 1 }];
        });
    }
    function removeLine(itemId) {
        setCart((lines) => lines.filter((l) => l.item !== itemId));
    }
    function onCodeEnter(e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const raw = codeText.trim();
        if (!raw) return;
        // "2*SAM" or "2 SAM" adds two.
        const m = raw.match(/^(\d{1,2})\s*[*x ]\s*(.+)$/i);
        const qty = m ? Number(m[1]) : 1;
        const code = (m ? m[2] : raw).trim().toLowerCase();
        const item = (items || []).find((i) => (i.code || "").toLowerCase() === code)
            || (items || []).find((i) => i.name.toLowerCase() === code);
        if (!item) return updateNotification("", `No item with the code "${raw}".`);
        for (let n = 0; n < qty; n += 1) add(item);
        setCodeText("");
    }

    /* --------------------------------------------------------------- pay */
    const cashOk = !!settings?.allow_cash;
    const accountOk = !!settings?.allow_account && buyer && buyer.buyer_type !== BUYER_WALKIN;
    const change = (paisa(received) - paisa(total)) / 100;
    let accountProblem = null;
    if (payment === PAY_ACCOUNT && buyer && buyer.buyer_type !== BUYER_WALKIN) {
        if (buyer.is_blocked) accountProblem = `Card blocked${buyer.block_reason ? ` (${buyer.block_reason})` : ""}.`;
        else if (paisa(total) > paisa(buyer.available)) {
            accountProblem = `Only Rs. ${rs(buyer.available)} can be spent from this account now.`;
        }
    }

    async function onPay() {
        if (paying) return;
        if (!buyer) { updateNotification("", "Pick the buyer first — tap the card, or type a roll number or name."); focusBuyer(); return; }
        if (cart.length < 1) return updateNotification("", "Add at least one item.");
        if (!keyRef.current) keyRef.current = newKey();
        setPaying(true);
        const [status, message, data] = await ringUp({
            school,
            client_key: keyRef.current,
            buyer_type: buyer.buyer_type,
            buyer: buyer.id || undefined,
            payment,
            date: today || undefined,
            lines: cart.map((l) => ({ item: l.item, qty: l.qty })),
        });
        setPaying(false);
        if (status === 0) {
            // No answer at all. The key is kept: pressing Pay again sends the
            // same key, and the server hands back the sale if it was made.
            updateNotification(400, "No answer from the server. Press Pay again — the sale will not be charged twice.");
            return;
        }
        keyRef.current = null;
        if (status !== 200 || !data?.sale_no) {
            updateNotification(400, message || "The sale was not saved.");
            if (data && /item/i.test(message || "")) loadItems();
            return;
        }
        // "Cash only" is a hint for the counter, not something to print.
        const sale = { ...data, name: buyer.name, detail: buyer.buyer_type === BUYER_WALKIN ? "" : buyer.detail };
        updateNotification(200, data.message || `Sale ${data.sale_no} saved.`);
        setDone(sale);
        setCart([]);
        setReceived("");
        setBuyer(null);
        setPayment(settings?.allow_cash ? PAY_CASH : PAY_ACCOUNT);
        loadSales();
        if (printSlip) printNow(sale);
        focusBuyer();
    }

    function printNow(sale) {
        setSlip(sale);
        setTimeout(() => print(), 60);
    }
    async function reprint(row) {
        const data = await getSale(school, row.id);
        if (data?.sale_no) printNow(data);
    }
    async function onVoid(row) {
        const ok = await confirmAction({
            title: `Void sale No. ${row.sale_no} (Rs. ${rs(row.total)})?`,
            confirmText: "Void sale",
            body: "It stays on the record with its number, which is never used again. "
                + (row.payment === PAY_ACCOUNT ? "The amount goes back onto the buyer's account at once." : "Hand the cash back to the buyer."),
        });
        if (!ok) return;
        const [status, message] = await voidSale(school, row.id, "voided at the counter");
        updateNotification(status === 200 ? 200 : 400, message || (status === 200 ? "Voided." : "Failed."));
        if (status === 200) loadSales();
    }

    function togglePrint() {
        setPrintSlip((on) => { writePref(!on); return !on; });
    }

    if (!settings || items === null) return <Loader />;
    if (items.length < 1) {
        return <SetupNeeded what="items on the counter"
            where="Add what the canteen sells in Canteen > Items & Prices (or switch sold-out items back on)." />;
    }

    const activeSales = sales.filter((s) => s.is_active);
    const dayTotal = sumMoney(activeSales.map((s) => s.total));

    return (
        <div className="flex flex-col gap-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[auto_1fr] gap-4 items-start">
                {/* Phones read top to bottom: who, what, pay. From lg the buyer
                    and the order share the right-hand column and the order stays
                    in view while a long item list scrolls. */}
                <div className="min-w-0 lg:col-start-8 lg:col-span-5 xl:col-start-9 xl:col-span-4 lg:row-start-1">
                    <div className="rounded-xl border border-gray-200 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Buyer</p>
                        {!buyer ? (
                            <>
                                <div className="relative">
                                    <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                                    <input ref={buyerRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onBuyerEnter}
                                        aria-label="Buyer" placeholder="Tap card, or type roll no. / name"
                                        className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm" autoComplete="off" />
                                </div>
                                {searching && <p className="mt-2 text-xs text-gray-500">Searching…</p>}
                                {results.length > 0 && (
                                    <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200">
                                        {results.map((b) => (
                                            <li key={`${b.buyer_type}-${b.id}`}>
                                                <button type="button" onClick={() => chooseBuyer(b)}
                                                    className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2">
                                                    <span className="min-w-0">
                                                        <span className="block text-sm font-semibold text-gray-900 truncate">{b.name}</span>
                                                        <span className="block text-xs text-gray-500 truncate">
                                                            {b.buyer_type === BUYER_STAFF ? "Staff · " : ""}{b.detail}{b.roll_no ? ` · Roll ${b.roll_no}` : ""}
                                                        </span>
                                                    </span>
                                                    {b.account
                                                        ? <StatusPill text={balanceText(b.balance)} tone={balanceTone(b.balance)} />
                                                        : <StatusPill text="No account" />}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <div className="mt-2 flex justify-end">
                                    <Button variant="text" size="sm" className="normal-case" onClick={() => chooseBuyer(WALK_IN)} disabled={!cashOk}>
                                        Walk-in (cash)
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <BuyerCard buyer={buyer} onClear={clearBuyer} />
                        )}
                    </div>

                </div>

                <div className="min-w-0 lg:col-start-1 lg:col-span-7 xl:col-span-8 lg:row-start-1 lg:row-span-2">
                    <div className="rounded-xl border border-gray-200 bg-white p-3">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                                <CategoryChip label={`All (${items.length})`} on={category === "all"} onClick={() => setCategory("all")} />
                                {categories.map(([name, n]) => (
                                    <CategoryChip key={name} label={`${name} (${n})`} on={category === name} onClick={() => setCategory(name)} />
                                ))}
                            </div>
                            <input value={codeText} onChange={(e) => setCodeText(e.target.value)} onKeyDown={onCodeEnter}
                                aria-label="Item code" placeholder="Code + Enter (2*SAM)"
                                className="w-full sm:w-44 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                            {shown.map((item) => {
                                const inCart = cart.find((l) => l.item === item.id)?.qty || 0;
                                return (
                                    <button key={item.id} type="button" onClick={() => add(item)}
                                        className={`relative text-left rounded-lg border p-3 min-h-[76px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${inCart
                                            ? "border-[var(--t-brand-solid,#0f766e)] bg-[var(--t-brand-tint,#f0fdfa)]"
                                            : "border-gray-200 bg-white hover:border-gray-400"}`}>
                                        <span className="flex items-start justify-between gap-1">
                                            <span className="block text-sm font-semibold text-gray-900 leading-snug break-words">{item.name}</span>
                                            {item.food_type === 1 && <FoodMark veg />}
                                            {item.food_type === 2 && <FoodMark />}
                                        </span>
                                        <span className="mt-1 flex items-center justify-between gap-1">
                                            <span className="text-sm font-bold tabular-nums text-gray-800">Rs. {rs(item.price)}</span>
                                            {item.code && <span className="text-[10px] text-gray-500">{item.code}</span>}
                                        </span>
                                        {inCart > 0 && (
                                            <span className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-[var(--t-brand-solid,#0f766e)] text-white text-xs font-bold flex items-center justify-center">
                                                {inCart}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* ------------------------------------------------ order and pay */}
                <div className="min-w-0 flex flex-col gap-3 lg:col-start-8 lg:col-span-5 xl:col-start-9 xl:col-span-4 lg:row-start-2 lg:sticky lg:top-2">
                    <div className="rounded-xl border border-gray-200 bg-white p-3">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Order · {count} item(s)</p>
                            {cart.length > 0 && (
                                <button type="button" className="text-xs text-rose-600 hover:underline" onClick={() => setCart([])}>Clear</button>
                            )}
                        </div>
                        {cart.length < 1 ? (
                            <p className="text-sm text-gray-500 py-3 text-center">Tap an item to add it.</p>
                        ) : (
                            <ul className="divide-y divide-gray-100">
                                {cart.map((line) => (
                                    <li key={line.item} className="py-1.5 flex items-center gap-2">
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-sm font-semibold text-gray-900 truncate">{line.name}</span>
                                            <span className="block text-xs text-gray-500 tabular-nums">Rs. {rs(line.price)} each</span>
                                        </span>
                                        <span className="flex items-center gap-1">
                                            <QtyButton label={`One less ${line.name}`} onClick={() => add({ id: line.item }, -1)}><MinusIcon className="w-3.5 h-3.5" /></QtyButton>
                                            <span className="w-6 text-center text-sm font-bold tabular-nums">{line.qty}</span>
                                            <QtyButton label={`One more ${line.name}`} onClick={() => add({ id: line.item, name: line.name, price: line.price })}><PlusIcon className="w-3.5 h-3.5" /></QtyButton>
                                        </span>
                                        <span className="w-20 text-right text-sm font-semibold tabular-nums">{rs(lineMoney(line.price, line.qty))}</span>
                                        <button type="button" aria-label={`Remove ${line.name}`} onClick={() => removeLine(line.item)}
                                            className="p-1 rounded text-gray-400 hover:text-rose-600"><XMarkIcon className="w-4 h-4" /></button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-700">Total</span>
                            <span className="text-2xl font-bold tabular-nums text-gray-900">Rs. {rs(total)}</span>
                        </div>

                        <div className={`mt-3 grid gap-2 ${buyer?.counter_plan ? "grid-cols-3" : "grid-cols-2"}`}>
                            {buyer?.counter_plan && (
                                <PayChoice on={payment === PAY_PLAN} onClick={() => setPayment(PAY_PLAN)}
                                    icon={<CalendarDaysIcon className="w-5 h-5" />} label="Plan" />
                            )}
                            <PayChoice on={payment === PAY_CASH} disabled={!cashOk} onClick={() => setPayment(PAY_CASH)}
                                icon={<BanknotesIcon className="w-5 h-5" />} label="Cash" />
                            <PayChoice on={payment === PAY_ACCOUNT} disabled={!accountOk} onClick={() => setPayment(PAY_ACCOUNT)}
                                icon={<CreditCardIcon className="w-5 h-5" />}
                                label={Number(buyer?.due_allowed) > 0 || Number(buyer?.credit_limit) > 0 ? "Account / Due" : "Account"} />
                        </div>
                        {payment === PAY_PLAN && buyer?.counter_plan && (
                            <p className="mt-2 text-xs text-green-800">
                                Covered by <span className="font-semibold">{buyer.counter_plan.name}</span> — billed with the month&apos;s fees. Nothing is charged here; the meal is counted.
                            </p>
                        )}
                        {payment === PAY_CASH && total > 0 && (
                            <div className="mt-2 flex items-center gap-2">
                                <input type="number" min="0" step="1" value={received} onChange={(e) => setReceived(e.target.value)}
                                    aria-label="Cash received" placeholder="Cash received"
                                    className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm text-right" />
                                <span className={`text-sm font-semibold whitespace-nowrap ${received && change < 0 ? "text-rose-600" : "text-gray-700"}`}>
                                    {received ? (change < 0 ? `Short ${rs(-change)}` : `Change ${rs(change)}`) : "Change —"}
                                </span>
                            </div>
                        )}
                        {accountProblem && (
                            <p className="mt-2 flex items-start gap-1.5 text-xs text-rose-700">
                                <ExclamationTriangleIcon className="w-4 h-4 shrink-0" aria-hidden="true" />{accountProblem}
                            </p>
                        )}
                        <Button color="teal" fullWidth disabled={paying || cart.length < 1 || !buyer || !!accountProblem}
                            className="mt-3 py-3 text-base normal-case font-semibold" onClick={onPay}>
                            {paying ? "Saving…" : payment === PAY_PLAN
                                ? `Serve on ${buyer?.counter_plan?.name || "plan"}`
                                : payment === PAY_ACCOUNT
                                    ? `Charge Rs. ${rs(total)} to account`
                                    : `Take Rs. ${rs(total)} cash`}
                        </Button>
                        <label className="mt-2 flex items-center justify-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
                            <input type="checkbox" checked={printSlip} onChange={togglePrint} className="accent-teal-600" />
                            Print a slip after each sale
                        </label>
                    </div>

                    {done && (
                        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                            <p className="font-semibold">Sale No. {done.sale_no} — {done.payment === PAY_PLAN
                                ? `served on ${done.payment_name.replace(/^Plan · /, "")}`
                                : `Rs. ${rs(done.total)} (${done.payment_name})`}</p>
                            <p className="text-xs">{done.name}
                                {done.balance_after !== null && done.balance_after !== undefined
                                    ? ` · ${Number(done.balance_after) < 0 ? "owing" : "left"} Rs. ${rs(Math.abs(done.balance_after))}` : ""}
                            </p>
                            {!printSlip && (
                                <button type="button" className="mt-1 text-xs font-semibold underline" onClick={() => printNow(done)}>Print slip</button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ---------------------------------------------- today's sales */}
            <div className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-semibold text-gray-800">Today at the counter · {activeSales.length} sale(s) · Rs. {rs(dayTotal)}</p>
                    <Button variant="text" size="sm" className="normal-case" onClick={loadSales}>Refresh</Button>
                </div>
                {sales.length < 1 ? <p className="text-sm text-gray-500">No sales yet today.</p> : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-table-header text-left">
                                <tr>
                                    <th className="px-3 py-2">No.</th>
                                    <th className="px-3 py-2">Time</th>
                                    <th className="px-3 py-2">Buyer</th>
                                    <th className="px-3 py-2">Paid by</th>
                                    <th className="px-3 py-2 text-right">Total</th>
                                    <th className="px-3 py-2 hidden md:table-cell">Served by</th>
                                    <th className="px-3 py-2 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sales.map((row) => (
                                    <tr key={row.id} className={`border-t border-gray-100 ${row.is_active ? "" : "opacity-50"}`}>
                                        <td className="px-3 py-1.5 font-semibold">{row.sale_no}</td>
                                        <td className="px-3 py-1.5 whitespace-nowrap">{row.time}</td>
                                        <td className="px-3 py-1.5">
                                            <span className="block">{row.name}</span>
                                            {row.detail && <span className="block text-xs text-gray-500">{row.detail}</span>}
                                        </td>
                                        <td className="px-3 py-1.5">{row.is_active ? row.payment_name : <StatusPill text="Voided" tone="red" />}</td>
                                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{rs(row.total)}</td>
                                        <td className="px-3 py-1.5 hidden md:table-cell">{row.entered_by}</td>
                                        <td className="px-3 py-1.5">
                                            <div className="flex items-center justify-end gap-x-1">
                                                <button type="button" aria-label={`Print slip ${row.sale_no}`} onClick={() => reprint(row)}
                                                    className="p-1.5 rounded bg-teal-50 text-teal-700"><PrinterIcon className="w-4 h-4" /></button>
                                                {row.is_active && (
                                                    <button type="button" aria-label={`Void sale ${row.sale_no}`} onClick={() => onVoid(row)}
                                                        className="p-1.5 rounded bg-rose-50 text-rose-600"><TrashIcon className="w-4 h-4" /></button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Off-screen rather than unmounted: react-to-print clones the node. */}
            <div className="hidden">
                <div ref={slipRef}>
                    <CanteenSlip sale={slip} width={width} footer={settings?.slip_footer} />
                </div>
            </div>
        </div>
    );
}

function CategoryChip({ label, on, onClick }) {
    return (
        <button type="button" onClick={onClick} aria-pressed={on}
            className={`rounded-full border px-3 py-1 text-xs font-semibold whitespace-nowrap ${on
                ? "border-[var(--t-brand-solid,#0f766e)] bg-[var(--t-brand-solid,#0f766e)] text-white"
                : "border-gray-300 bg-white text-gray-700 hover:border-gray-500"}`}>
            {label}
        </button>
    );
}

function FoodMark({ veg = false }) {
    // The square-and-dot mark printed on Indian and Nepali food packets.
    const colour = veg ? "border-green-600" : "border-red-700";
    const dot = veg ? "bg-green-600" : "bg-red-700";
    return (
        <span title={veg ? "Veg" : "Non-veg"} className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-3.5 h-3.5 border ${colour}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
            <span className="sr-only">{veg ? "Veg" : "Non-veg"}</span>
        </span>
    );
}

function QtyButton({ label, onClick, children }) {
    return (
        <button type="button" aria-label={label} onClick={onClick}
            className="w-7 h-7 rounded-md border border-gray-300 flex items-center justify-center text-gray-700 hover:bg-gray-100">
            {children}
        </button>
    );
}

function PayChoice({ on, disabled, onClick, icon, label }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
            className={`flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${on
                ? "border-[var(--t-brand-solid,#0f766e)] bg-[var(--t-brand-tint,#f0fdfa)] text-[var(--t-brand-ink,#115e59)]"
                : "border-gray-300 bg-white text-gray-700 hover:border-gray-500"}`}>
            {icon}{label}
        </button>
    );
}

function BuyerCard({ buyer, onClear }) {
    const walkIn = buyer.buyer_type === BUYER_WALKIN;
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-start gap-3">
                <span className="shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
                    <UserIcon className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-gray-900 truncate">{buyer.name}</span>
                    <span className="block text-xs text-gray-500 truncate">
                        {buyer.buyer_type === BUYER_STAFF ? "Staff · " : buyer.buyer_type === BUYER_STUDENT ? "" : ""}
                        {buyer.detail}{buyer.roll_no ? ` · Roll ${buyer.roll_no}` : ""}
                    </span>
                </span>
                <button type="button" onClick={onClear} className="text-xs font-semibold text-teal-700 hover:underline">Change</button>
            </div>
            {!walkIn && (
                <div className="grid grid-cols-3 gap-2 text-center">
                    <Fact label="Balance" value={buyer.account ? balanceText(buyer.balance) : "No account"}
                        tone={Number(buyer.balance) < 0 ? "text-rose-700" : "text-gray-900"} />
                    <Fact label="Can spend now" value={`Rs. ${rs(buyer.available)}`}
                        hint={Number(buyer.due_allowed) > 0 ? `due up to ${rs(buyer.due_allowed)}` : null} />
                    <Fact label="Spent today" value={`Rs. ${rs(buyer.spent_today)}`}
                        hint={Number(buyer.daily_limit) > 0 ? `of ${rs(buyer.daily_limit)}` : "no daily limit"} />
                </div>
            )}
            {buyer.plans?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {buyer.plans.map((p) => <StatusPill key={p.plan} text={p.name} tone="blue" />)}
                </div>
            )}
            {buyer.is_blocked && (
                <p className="rounded-md bg-rose-50 border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700">
                    Card blocked{buyer.block_reason ? `: ${buyer.block_reason}` : ""}. Cash only.
                </p>
            )}
            {buyer.notes && (
                <p className="rounded-md bg-amber-50 border border-amber-200 px-2 py-1 text-xs text-amber-900">
                    <span className="font-semibold">Note: </span>{buyer.notes}
                </p>
            )}
        </div>
    );
}

function Fact({ label, value, hint, tone = "text-gray-900" }) {
    return (
        <div className="rounded-lg bg-gray-50 px-2 py-1.5 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`text-xs font-bold tabular-nums truncate ${tone}`}>{value}</p>
            {hint && <p className="text-[10px] text-gray-500 truncate">{hint}</p>}
        </div>
    );
}

export default CanteenCounter;
