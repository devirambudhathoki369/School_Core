import { TRANSPORTATION, HOSTEL, PER_STUDENT_TITLES } from "@/configs/payment";
import monthOptions from "@/components/inputs/options/months";
import cleanEmptyFields from "../cleanEmptyFields";
import safeDecimal from "../safeDecimal";

/**
 * This is used to extract table columns and it's amount details for ledger-posting-table. \
 * @REQUIRES
 * feeDetails : Each fee-detail includes: \
 * - fee : fee-rate
 * - id : fee-id
 * - isActive : fee-title-status
 * - title__id : fee-title-id
 * - title__months : fee-title-paying-months
 * - title__title : fee-title
 * @RETURNS
 * - columns : fee-titles in format [[fee-title], ...] or [[fee-title-id, fee-title], ...]
 * - details : Each detail/title-detail includes [[fee-rate, total-paying-amount, paying-months], ...]
 */
function extractFeeDetails(feeDetails) {
    const columns = [];
    const details = {};
    for (const det of feeDetails) {
        if (det?.title__months?.length > 0) {
            columns.push([det.title__id, det.title__title, det.fee]); // for custom column-header-with-rate, ", `${det.title__title} ${det.fee}`"
            details[det.title__id] = [det.fee, det.fee * det.title__months.length, det.title__months];
        }
    }
    return { columns, details };
}

function titlesAsObjects(titles, as_number) {
    const val = as_number ? 0 : '';
    const objects = titles.reduce((acc, title) => {
        acc[title] = val;
        return acc;
    }, {});
    return objects;
}

/**
 * @REQUIRES
 * - range : {min: num, max: num}
 */
export function genPostingMonths(range, exceptions = []) {
    const { min, max } = range;
    return Array.from({ length: max }, (_, index) => index + 1)
        .filter(num => num >= min && !exceptions.includes(num));
}

/**
 * The months a per-student service can be billed for.
 *
 * From the month it STARTED to the end of the year — unless it started in an
 * earlier year, in which case the whole year is billable. Named for the general
 * case now that the hostel uses it too; the arithmetic is unchanged.
 */
function getServicePostingLimits(today, enrolledDate) {
    const [currentYear,] = today.split('-').map(part => parseInt(part, 10));
    const [enrolledYear, enrolledMonth] = enrolledDate.split('-').map(part => parseInt(part, 10));

    let min = enrolledMonth;
    let max = 12;

    if (currentYear > enrolledYear) {
        min = 1;
        max = 12;
    }

    return { min, max };
}

function calculateSumpup(data) {
    let finalTotal = 0;
    const sumup = data.reduce((acc, val) => {
        let { discounts, name, student_id, total, ...others } = val;
        if (student_id) {
            Object.entries(others).forEach(([key, value]) => {
                acc[key] = (acc?.[key] || 0) + (value || 0);
            });
            finalTotal += parseFloat(total || 0);
        }
        return acc;
    }, {});
    sumup['name'] = 'TOTAL';
    sumup['total'] = finalTotal;
    return sumup;
}

export function generateLedgerTableData(students, feeDetails, previousPostings, today) {
    const data = [];
    let { columns, details } = extractFeeDetails(feeDetails);
    // ---
    // extracted posted-months from previous postings;
    // so that user couldn't post to those already posted months.
    // they can but from profile's ledger-posting-section only;
    //
    // `postedMonths` blocks a month for the WHOLE class. `studentTitles` holds
    // what individual students have already been billed, title by title (a
    // profile catch-up) — those months stay postable for the class, the holder
    // is simply not charged the same title twice. It is kept OUT of the row
    // objects: every calculation here reads a row as {student_id, name, total,
    // discounts, ...fee titles}, so an extra key would be billed as a title.
    const { months: postedMonths, studentTitles } = normalizePreviousPostings(previousPostings);
    const titles = Object.keys(details);
    for (const std of students) {
        // if (std.first_name === 'kiran') std[TRANSPORTATION] = [150, '2024-2-10'];
        // assign compulsory fee titles to be shown/calculated in the ledger;
        const stdObject = {
            student_id: std.id, name: std.name, total: 0,
            ...titlesAsObjects(titles, true)
        };
        // discounts
        stdObject['discounts'] = std?.discounts || null;
        // Services whose rate is the STUDENT's, not the class's — transport and
        // the hostel. Both work identically: a rate, the date the service
        // started, and a charge that runs from that month to the end of the
        // year. Written once over `PER_STUDENT_TITLES` rather than twice,
        // because the copy of this block that used to exist for transportation
        // alone is exactly what made adding the hostel a six-file edit.
        for (const [title, label, rate, since] of [
            [TRANSPORTATION, 'transportation', std.transportation_fee, std.transportation_date],
            [HOSTEL, 'hostel', std.hostel_fee, std.hostel_date],
        ]) {
            if (!rate || !since) continue;
            stdObject[title] = 0;
            if (!details?.[title]) {
                columns.push([title, label]);
                details[title] = {};
            }
            // The charge runs from the month the service started to the end of
            // the year — and from month 1 if it started in an earlier year.
            const { min, max } = getServicePostingLimits(today, since);
            details[title][std.id] = [rate, rate * max, genPostingMonths({ min, max })];
        }
        data.push(stdObject);
    }
    // console.log('data', data);
    // console.log('details', details);
    // console.log('posted-months', postedMonths);
    data.push({}); // placeholder for footer/totals; DONOT REMOVE THIS LINE!
    // _test();
    // `computed` is what the table itself last worked out for each cell
    // ({student_id: {title: amount}}), kept apart from the rows for the same
    // reason as `studentTitles`. It is how a typed amount is told from a
    // calculated one — see updateLedgerTableData.
    return { columns, columns_bkp: [...columns], data, details, postedMonths, studentTitles, computed: {} };
}

/**
 * Accepts either the current {months, studentTitles} shape or the plain array
 * of months the endpoint used to return.
 */
export function normalizePreviousPostings(previousPostings) {
    if (Array.isArray(previousPostings)) return { months: previousPostings, studentTitles: {} };
    return {
        months: previousPostings?.months || [],
        studentTitles: previousPostings?.studentTitles || {},
    };
}

/**
 * The months of the class-wide selection this student still owes for ONE title
 * — the ones they were already billed that title for are dropped.
 */
export function studentTitleMonths(postingMonths, studentTitles, student_id, title) {
    const billed = studentTitles?.[student_id]?.[title];
    if (!billed?.length) return postingMonths;
    return (postingMonths || []).filter(month => !billed.includes(month));
}

/**
 * Months of the selection this student is billed nothing at all for — every
 * title they'd be charged is one they already hold for that month.
 * `titles` is the list of fee titles being posted.
 */
export function studentBilledMonths(postingMonths, studentTitles, student_id, titles) {
    const billed = studentTitles?.[student_id];
    if (!billed) return [];
    return (postingMonths || []).filter(month =>
        titles.every(title => billed?.[title]?.includes(month)));
}

function justLog(studentName, title, actualTotal, total, discount) {
    if (total === actualTotal) {
        // console.log(
        //     `+++ ${studentName}
        //     ${title} > WOD : ${actualTotal} \t > WD [${discount}] : ${total}`
        // );
    }
    else {
        console.log(
            `--- ${studentName}
            ${title} > WOD : ${actualTotal} \t > WD [${discount}] : ${total}, 
            right? :`, (actualTotal - total) === discount
        );
    }
}

/**
 * What a title costs for `pmc` months at `rate`, less a per-month `discount`.
 *
 * THE one place this is worked out — the class-wide table and the profile's
 * "Fill this class's fees" both call it, so a student caught up from their
 * profile is billed exactly what the classmates posted beside them were.
 *
 * - The discount is per month and never more than the rate itself: a discount
 *   larger than the fee waives the fee, it does not turn into a charge.
 * - One month's charge is rounded to the paisa and THEN multiplied, so three
 *   months are three times one month whatever the percentage.
 */
export function netForMonths(rate, discount, pmc) {
    rate = parseFloat(rate) || 0;
    const off = Math.min(rate, Math.max(0, parseFloat(discount) || 0));
    if (rate <= 0 || !(pmc > 0)) return 0;
    return safeDecimal(safeDecimal(rate - off) * pmc);
}

/* Steps a total by one month at a time. Salary posting still uses it (no
   discounts there). The student ledger table no longer does: comparing the
   new total with the old one as floats decided the direction of the step, so
   a percentage discount (57% of 300 is 170.99999999999997) could move a title
   by a month when the selection changed without changing that title's months,
   and a discount above 100% came out as a charge. See netForMonths. */
export function calculateTotal(prevTotal, pmc, rate, discountRate) {
    let newTotal = (rate * pmc) - (discountRate * pmc);
    const oneMonthTotal = (rate * 1) - (discountRate * 1);
    if (newTotal > prevTotal) {
        return safeDecimal(prevTotal + oneMonthTotal);
    } else if (newTotal < prevTotal) {
        return safeDecimal(prevTotal - oneMonthTotal);
    } else if (newTotal < 1) return safeDecimal(prevTotal);
    return safeDecimal(newTotal);
}

function calculateDiscountAmount(discountObject, feeDetails) {
    let { discount, percentage } = discountObject;
    const titleRate = feeDetails?.[0];
    if (percentage && titleRate) {
        discount = (percentage / 100) * titleRate;
    }
    return discount;
}

export function payableMonthsCount(postingMonths, titleDetails) {
    const PAYABLE_MONTHS_INDEX = 2;
    return (postingMonths
        ?.filter(val => titleDetails?.[PAYABLE_MONTHS_INDEX]?.includes(val)) || []).length;
}

/**
 * Recalculates columns and student ledger based on user-selected and
 * title-payable months.
 *
 * Every cell is worked out from scratch for the selection — months payable ×
 * the month's charge (netForMonths) — rather than stepped from whatever the
 * cell held before.
 *
 * A TYPED amount still travels with the months, as it always has: an admin who
 * sets a cell to 2,000 where the table had 2,080 has taken 80 off that
 * student, and adding a month keeps the 80 off. So the difference between what
 * the cell holds and what the table last calculated for it (`computed`) is
 * carried onto the new figure. With nothing typed the difference is zero and
 * the cell is simply the calculation.
 */
export function updateLedgerTableData(ledgerTableData, postingMonths) {
    if (!ledgerTableData?.data || !ledgerTableData?.details || !ledgerTableData?.columns) return { ledgerTableData };
    // Mutated in place, like the rows: a second pass over the same selection
    // then finds its own results and changes nothing.
    const computed = ledgerTableData.computed || (ledgerTableData.computed = {});
    // 
    const smc = postingMonths?.length || 0; // user-selected-months-count;
    // payableTitles : titles with payable-months-count i.e. {title: count}.
    // Per-student titles get a bucket keyed by student; class titles hold one
    // shared count.
    const payableTitles = PER_STUDENT_TITLES.reduce((acc, t) => ({ ...acc, [t]: {} }), {});
    const studentTitles = ledgerTableData?.studentTitles || {};
    // Students already billed one of the selected months for a title they'd be
    // charged again here — {student_id: {name, months: Set, skipped: bool}}.
    const alreadyBilled = {};
    const data = ledgerTableData?.data?.reduce((acc, stdLedger) => {
        stdLedger['total'] = 0;
        const { student_id, name, total, discounts, ...titleColumns } = stdLedger;
        const billedTitles = studentTitles?.[student_id];
        let payableForAll = 0, payableForStudent = 0;
        const billedMonths = new Set();
        // the totals row at the foot is rebuilt below, never calculated
        if (!student_id) { acc.push(stdLedger); return acc; }
        const worked = computed[student_id] || (computed[student_id] = {});
        for (const title of Object.keys(titleColumns)) {
            if (smc < 1) {
                // THIS is neccessary to make all values 0, so if postingMonths/user-selected-months < 1, it won't use previous value;
                stdLedger[title] = 0;
                worked[title] = 0;
                continue;
            }
            const perStudent = PER_STUDENT_TITLES.includes(title);
            const titleDetails = perStudent ?
                ledgerTableData?.details[title]?.[student_id] || [] :
                ledgerTableData?.details[title];
            // A student already caught up on this title for some of the selected
            // months (posted from their profile) is charged for the rest only —
            // the class keeps the month, they just don't pay for it twice.
            const alreadyHas = billedTitles?.[title]?.length > 0;
            const monthsForStudent = alreadyHas
                ? studentTitleMonths(postingMonths, studentTitles, student_id, title)
                : postingMonths;
            //
            let pmc = payableTitles?.[title]?.[student_id] || payableTitles?.[title] || 0;
            if (perStudent) {
                pmc = payableMonthsCount(monthsForStudent, titleDetails);
                payableTitles[title][student_id] = pmc;
            } else if (alreadyHas) {
                // counted for this student alone; the cached per-title count
                // stays on the full selection so the column set (below) is the
                // same for everyone.
                pmc = payableMonthsCount(monthsForStudent, titleDetails);
                if (payableTitles?.[title] === undefined) {
                    payableTitles[title] = payableMonthsCount(postingMonths, titleDetails);
                }
            } else if (payableTitles?.[title] === undefined) {
                pmc = payableMonthsCount(postingMonths, titleDetails);
                payableTitles[title] = pmc;
            }
            // what this title WOULD have billed, to tell "already billed" apart
            // from "this title isn't payable in the selected months anyway".
            const fullPmc = alreadyHas ? payableMonthsCount(postingMonths, titleDetails) : pmc;
            payableForAll += fullPmc;
            payableForStudent += pmc;
            if (alreadyHas) {
                for (const month of postingMonths) {
                    if (billedTitles[title].includes(month)
                        && payableMonthsCount([month], titleDetails) > 0) billedMonths.add(month);
                }
            }
            //
            if (pmc >= 0) {
                let discountObject = discounts?.[title] || {},
                    titleDiscount = calculateDiscountAmount(discountObject, titleDetails) || 0;
                const net = netForMonths(titleDetails?.[0], titleDiscount, pmc);
                // what was typed over the last calculation, if anything
                const typed = safeDecimal((parseFloat(stdLedger[title]) || 0) - (worked[title] || 0));
                const newTitleTotal = Math.max(0, safeDecimal(net + (Math.abs(typed) < 0.005 ? 0 : typed)));
                worked[title] = net;
                stdLedger[title] = newTitleTotal;
                stdLedger.total = safeDecimal(stdLedger.total + newTitleTotal);
            }
        }
        if (student_id && billedMonths.size > 0) {
            alreadyBilled[student_id] = {
                name,
                months: [...billedMonths].sort((a, b) => a - b),
                // nothing left to charge them — posting a row of zeroes would be
                // a second bill for a period they have already been charged for.
                skipped: payableForAll > 0 && payableForStudent < 1,
            };
        }
        acc.push(stdLedger);
        return acc;
    }, []);
    // console.log('data', data);
    const sumup = calculateSumpup(data);
    data.pop();
    data.push(sumup);
    // A column survives when its title has a payable count. `columns_bkp` only
    // ever contains a per-student title when at least one student in the class
    // actually uses that service (see generateLedgerTableData), so the plain
    // existence test is right for those too — and keeping it identical to what
    // transportation has always done means the hostel column behaves the same
    // and no existing bill changes shape.
    const columns = ledgerTableData?.columns_bkp?.
        filter(([titleId, ,]) => payableTitles?.[titleId]);
    // console.log(columns);
    return { columns, data, alreadyBilled, computed };
}

/**
 * What ONE student would be billed for a period — the single-student form of
 * the class-wide table above, for the profile's "Fill this class's fees".
 *
 * It has to come out the same as that table, or a student caught up from their
 * profile is billed differently from the classmates posted beside them. So it
 * is built from the same three things, with the same helpers (netForMonths
 * above all):
 * - a class fee title: its rate, for the selected months it is payable in;
 * - a per-student service (bus, hostel): the student's own rate, from the month
 *   the service started (see `getServicePostingLimits`);
 * - the student's discount on a title, taken off each month's rate.
 *
 * @REQUIRES
 * - months : the selected months, as numbers
 * - rates : {title: rate} for the class's fee titles
 * - titleMonths : {title: [months the title is payable in]}
 * - services : {tn|hs: {rate, since}} — what this student uses, if anything
 * - discounts : the student's discount rows, [{title, discount, percentage}]
 * - today : the school's date, which decides whether a service began this year
 * @RETURNS
 * - details : {title: amount to bill}, discount already taken off
 * - discounted : {title: how much discount that amount has had taken off}
 * - waived : titles left out because the discount covers them completely — a
 *   zero row still reads as a charge, so they are named rather than billed 0
 */
export function studentFeesForMonths({ months, rates, titleMonths, services, discounts, today }) {
    const details = {}, discounted = {}, waived = [];
    // Same as the class-wide lookup: one discount per title, and where a
    // student holds two for the same title the later one stands.
    const discountByTitle = (discounts || []).reduce((acc, row) => {
        acc[row?.title?.toString()] = row;
        return acc;
    }, {});
    const bill = (title, titleRate, payableMonths) => {
        const rate = parseFloat(titleRate) || 0;
        const pmc = payableMonthsCount(months, [rate, null, payableMonths]);
        if (rate <= 0 || pmc < 1) return;
        const row = discountByTitle[title] || {};
        const perMonth = parseFloat(calculateDiscountAmount(
            { discount: row.discount, percentage: parseFloat(row.percentage) || 0 }, [rate])) || 0;
        const net = netForMonths(rate, perMonth, pmc);
        const off = safeDecimal(rate * pmc - net);
        if (net > 0) {
            details[title] = net;
            if (off > 0) discounted[title] = off;
        } else {
            waived.push(title);
        }
    };
    for (const title of Object.keys(titleMonths || {})) {
        bill(title, rates?.[title], titleMonths[title]);
    }
    for (const title of PER_STUDENT_TITLES) {
        const service = services?.[title];
        if (!service?.rate || !service?.since) continue;
        const limits = today ? getServicePostingLimits(today, service.since) : { min: 1, max: 12 };
        bill(title, service.rate, genPostingMonths(limits));
    }
    return { details, discounted, waived };
}

/**
 * The months of the year this class cannot be billed a single rupee for.
 *
 * A month is "fully billed" when, for every student in the loaded class, every
 * fee title is either not payable in that month (its fee months exclude the
 * period) or already held by that student from an earlier posting. Selecting
 * such a month can only produce rows that charge nothing — which is how ledgers
 * filled up with dated entries showing no particulars and no amount.
 *
 * This is deliberately NOT "every month this class has ever been posted".
 * Schools bill one fee title at a time, so a month already billed for
 * "Monthly Fee" must stay open for "Exam Fee" — blocking on the posting alone
 * is what once locked 936 class/year groups out of posting anything. A month
 * only closes when there is genuinely nothing left in it for anybody.
 */
export function fullyBilledMonths(ledgerTableData) {
    const { data, details, studentTitles } = ledgerTableData || {};
    if (!Array.isArray(data) || !details) return [];
    const titles = Object.keys(details);
    if (titles.length < 1) return [];
    const blocked = [];
    for (const { value: month } of monthOptions) {
        let billable = false;
        for (const row of data) {
            const student_id = row?.student_id;
            if (!student_id) continue; // the totals/placeholder row
            for (const title of titles) {
                const titleDetails = PER_STUDENT_TITLES.includes(title)
                    ? details?.[title]?.[student_id]
                    : details?.[title];
                if (!titleDetails) continue;                       // not this student's service
                if (payableMonthsCount([month], titleDetails) < 1) continue; // not payable this month
                if (studentTitles?.[student_id]?.[title]?.includes(month)) continue; // already billed
                billable = true;
                break;
            }
            if (billable) break;
        }
        if (!billable) blocked.push(month);
    }
    return blocked;
}

/**
 * Does this row actually charge a fee title?
 *
 * `details` holds {title: amount} with the zeroes already stripped, so a row
 * left with an empty object bills nobody for anything. Sending it anyway is
 * what wrote 10,303 phantom ledger entries across the schools; the backend
 * drops these too (LedgerViews.dropEmptyCharges).
 */
function billsSomething(details, total) {
    return Object.keys(details || {}).length > 0 || parseFloat(total) > 0;
}

/**
 * this function prepares a required/valid format of a ledger for a class to be posted to the backend.
 */
export function generateLedger(ledgerTableData, postingMonths, gradeDetails, schoolId, fiscalYear, date) {
    gradeDetails = cleanEmptyFields(gradeDetails);
    const alreadyBilled = ledgerTableData?.alreadyBilled || {};
    const studentLedgers = ledgerTableData.data
        .reduce((acc, val) => {
            const { student_id, total, name, discounts, ...others } = val;
            // Students with nothing left to charge (every title they'd be billed
            // here, they already hold for these months) are left out of the
            // posting altogether — see updateLedgerTableData. Unless the admin
            // typed an amount into their row by hand: that is a deliberate
            // charge and must not be thrown away.
            const skip = alreadyBilled?.[student_id]?.skipped && !(parseFloat(total) > 0);
            if (student_id && !skip) {
                const details = { ...cleanEmptyFields(others, [], true) };
                // A row where every title came out zero — the months aren't
                // payable for any title, or the student already holds them all
                // — charges nothing. Posting it would put a dated entry with no
                // particulars and no amount on that student's ledger, which
                // reads to a parent as a phantom bill and to a cashier as a
                // double posting. Leave it out.
                if (billsSomething(details, total)) {
                    acc.push({ student: student_id, details, total });
                }
            }
            return acc;
        }, []);
    return {
        ledgerPosting: {
            months: postingMonths,
            class_info: gradeDetails
        },
        studentLedgers,
        ...fiscalYear,
        date
    };
}

// TESTING;
function _test() {
    [
        { today: "2081-07-05", transportation_date: "2081-04-01" },
        { today: "2082-01-05", transportation_date: "2081-04-01" },
        { today: "2082-05-05", transportation_date: "2081-04-01" },
        { today: "2083-01-05", transportation_date: "2081-04-01" },
        { today: "2083-04-05", transportation_date: "2081-04-01" },
    ].forEach(({ today, transportation_date }) => {
        const limit = getServicePostingLimits(today, transportation_date);
        console.log(transportation_date, today, limit, genPostingMonths(limit));
    })
}