import { memoize } from "@/components/views/reports/transactions/transactions_history/formatter";
import monthsMapper from "@/methods/monthsMapper";
import safeDecimal from "@/methods/safeDecimal";
import { TITLE_NAMES_KEY } from "@/configs/payment";

// See formatter.js — strip the reserved snapshot key before iterating.
const isFeeKey = (key) => key !== TITLE_NAMES_KEY;

const base_columns = [
    ['id', "S.N."], ['student_name', "Student Name"],
    ['date'], ['total'], ['classname'],
],
    overall_titlewise_columns = [['index', "S.N."], ['particular'], ['total']];

const detailed_columns = [...base_columns].toSpliced(3, 0, ['particular']);
const intermediate_columns = [...base_columns].toSpliced(6, 0, ['months']);

const LP_VIEW_FORMATTER = {
    sum: (details) => {
        return Object.entries(details)
            .filter(([key]) => isFeeKey(key))
            .reduce((acc, [, val]) => {
                acc += val;
                return acc;
            }, 0);
    },
    detailed: memoize((data, titles, classes) => {
        data = data.reduce((acc, ledger) => {
            const { details, student_class, months, ...others } = ledger;
            Object.keys(details)
                .filter(isFeeKey)
                .map((titleId) => {
                    const total = details?.[titleId] || 0;
                    const row = { ...others, classname: classes?.[student_class], particular: titles?.[titleId] || titleId, total };
                    acc.push(row);
                });
            return acc;
        }, [])
        return [detailed_columns, data];
    }),
    intermediate: memoize((data, classes) => {
        data = data.reduce((acc, ledger) => {
            const { details, student_class, months, total, ...others } = ledger;
            const _months = monthsMapper(months);
            let details_total = LP_VIEW_FORMATTER.sum(details);
            details_total = safeDecimal(details_total);
            const row = {
                ...others,
                color: total != details_total ? 'red' : '',
                classname: classes?.[student_class],
                months: _months,
                total: details_total,
            };
            acc.push(row);
            return acc;
        }, []);
        return [intermediate_columns, data];
    }),
    overall_titlewise: memoize((data, titles) => {
        let title_wise_total = {};
        data
            .map((inv) => {
                Object.keys(inv?.details || {})
                    .filter(isFeeKey)
                    .map((key) => {
                        title_wise_total[key] = (title_wise_total?.[key] || 0) +
                            (inv.details[key] || 0);
                    });
            });
        // 
        data = Object.keys(title_wise_total)
            .reduce((acc, key, index) => {
                // round the summed total — JS float addition leaks artifacts
                // like 436299.20999999996 into the report otherwise.
                acc.push({ index: index + 1, particular: titles?.[key] || key, total: safeDecimal(title_wise_total[key]) });
                return acc;
            }, []);
        return [overall_titlewise_columns, data];
    })
}

export default LP_VIEW_FORMATTER;
