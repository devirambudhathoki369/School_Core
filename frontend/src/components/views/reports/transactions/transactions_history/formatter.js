import { INVOICE_DETAILS, TITLE_NAMES_KEY } from "@/configs/payment";
import { collectionByMode, paymentModeLabel } from "@/methods/payment/collection";

// FeeTitle name snapshot lives inside the same `details` dict as the real
// title rows. Strip it before any iteration so it doesn't render as a fake
// title with 0 amount.
const isFeeKey = (key) => key !== TITLE_NAMES_KEY;

export function memoize(fn) {
    const cache = new Map();
    return function (key, ...args) {
        if (cache.has(key)) {
            return cache.get(key);
        } else {
            cache.forEach((_, _key) => {
                if (_key !== key) cache.delete(_key);
            });
        }
        const result = fn.apply(this, args);
        cache.set(key, result);
        return result;
    };
}
/* 
- BACKEND -> [date, invoice_id, details: {}, classname, student_name: name]
- VIEW::Overall-title-wise -> [feetitle, total]
- VIEW::Detailed -> [Same of BACKEND]
- VIEW::Intermediate -> [Same of BACKEND except feetitle] 
*/
// `total` is always NET of the discount, which used to make a discounted title
// indistinguishable from one that was simply billed less. The discount is
// carried as its own column so it stays attached to the title it was given on.
const columns = [
    ['date'], ['invoice_id', 'receipt no'], ['classname'], ['name'], ['academic_year_name', 'academic year'], ['payment_mode', 'Payment mode'], ['discount'], ['total'], ['cashier'], ['remarks']
],
    intermediate_columns = [...columns],
    overall_titlewise_columns = [['particular'], ['discount'], ['total']];
columns.splice(2, 0, ['particular']); // these are detailed_columns;

// The list of DELETED receipts also says who deleted each one and when. The
// server sends the two fields for that list only, so their presence is what
// decides whether the columns are there.
const deletion_columns = [['deleted_by', 'deleted by'], ['deleted_on', 'deleted on']];
const withDeletion = (cols, data) =>
    data.some(row => row?.deleted_by !== undefined) ? [...cols, ...deletion_columns] : cols;

// Money values can arrive as STRINGS, so anything doing arithmetic on them must
// coerce first — `a + b` would otherwise concatenate.
export function toNum(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
}

// Money maths on floats drifts (6000 + 13.5 style sums); round to paisa.
export function round2(n) {
    return Math.round(n * 100) / 100;
}

// 
const SORTBY = {
    DATE: 1,
    RECEIPT: 2
};

const SORTING = {
    DATE: (a, b) => new Date(a.date) - new Date(b.date),
    RECEIPT: (a, b) => a.invoice_id - b.invoice_id
};

const VIEW_FORMATTER = {
    // TODO: apply sorting and apply by specific fee-title;
    sort: (data, sort_method) => {
        // console.log(sort_method);
        if (sort_method === SORTBY.DATE) return data.sort(SORTING.DATE);
        else if (sort_method === SORTBY.RECEIPT) return data.sort(SORTING.RECEIPT);
        else return data;
    },
    detailed: memoize((data, titles, sort) => {
        data = data.reduce((acc, inv) => {
            const { details, ...others } = inv;
            Object.keys(details)
                .filter(isFeeKey)
                .map((titleId) => {
                    const discount = toNum(details[titleId]?.[INVOICE_DETAILS.DISCOUNT]);
                    const total = toNum(details[titleId]?.[INVOICE_DETAILS.AMOUNT]) - discount;
                    const row = {
                        ...others,
                        payment_mode: paymentModeLabel(inv.mode),
                        particular: titles?.[titleId] || titleId,
                        discount,
                        total,
                    }
                    acc.push(row);
                })
            return acc;
        }, []);
        data = VIEW_FORMATTER.sort(data, sort);
        return [withDeletion(columns, data), data];
    }),
    sum: (details) => {
        return Object.entries(details)
            .filter(([key]) => isFeeKey(key))
            .reduce((acc, [, val]) => {
                acc += ((val?.[INVOICE_DETAILS.AMOUNT] || 0) - (val?.[INVOICE_DETAILS.DISCOUNT] || 0));
                return acc;
            }, 0);
    },
    sumDiscount: (details) => {
        return round2(Object.entries(details)
            .filter(([key]) => isFeeKey(key))
            .reduce((acc, [, val]) => acc + toNum(val?.[INVOICE_DETAILS.DISCOUNT]), 0));
    },
    intermediate: memoize((data, sort) => {
        data = data.reduce((acc, inv) => {
            const { details, ...others } = inv;
            const total = VIEW_FORMATTER.sum(details);
            const row = { ...others, payment_mode: paymentModeLabel(inv.mode), discount: VIEW_FORMATTER.sumDiscount(details), total };
            acc.push(row);
            return acc;
        }, []);
        data = VIEW_FORMATTER.sort(data, sort);
        return [withDeletion(intermediate_columns, data), data];
    }),
    modewise: (data) => [
        [['payment_mode', 'Payment mode'], ['total', 'Collected amount']],
        collectionByMode(data, invoice => VIEW_FORMATTER.sum(invoice.details)),
    ],
    overall_titlewise: memoize((data, titles) => {
        let title_wise = {};
        data.forEach((inv) => {
            Object.keys(inv?.details || {})
                .filter(isFeeKey)
                .forEach((key) => {
                    const discount = toNum(inv.details[key]?.[INVOICE_DETAILS.DISCOUNT]);
                    const net = toNum(inv.details[key]?.[INVOICE_DETAILS.AMOUNT]) - discount;
                    const bucket = title_wise[key] || (title_wise[key] = { total: 0, discount: 0 });
                    bucket.total += net;
                    bucket.discount += discount;
                });
        });
        const cols = overall_titlewise_columns;
        data = Object.keys(title_wise).reduce((acc, key) => {
            const { total, discount } = title_wise[key];
            const row = { particular: titles?.[key] || key, discount: round2(discount), total: round2(total) };
            acc.push(row);
            return acc;
        }, []);
        return [cols, data];
    })
}

export default VIEW_FORMATTER;
