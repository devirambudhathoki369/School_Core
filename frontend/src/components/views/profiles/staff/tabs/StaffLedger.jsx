import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { months as monthNames } from "@/components/inputs/options/months";
import { ButtonsSecion, Section } from "@/components/sections";
import EmptyState from "@/components/EmptyState";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { useAppContext } from "@/contexts/AppContext";
import { useStaffProfile } from "@/contexts/StaffProfile";
import { fetchStaffLedgers, saveSalaryPostings } from "@/services/functions/ledgers";
import { ReceiptPercentIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import StaffPaymentHistory from "../StaffPaymentHistory";

// The student Ledger tab, with payroll titles in place of fee titles.
// MUST MATCH ALL_TITLES in backend/main/views/LedgerViewsStaff.py — the backend
// rejects any other key. `rate` is the Finance Info field the monthly rate is
// read from.
const PAYROLL_TITLES = [
    { key: 'salary', label: 'Basic salary (Net)', rate: 'basic_salary' },
    { key: 'funds', label: 'Funds', rate: 'funds' },
    { key: 'grade', label: 'Grade', rate: 'grade' },
    { key: 'allowance', label: 'Allowance', rate: 'allowance' },
    { key: 'extra', label: 'Extra', rate: 'extra' },
];
const TITLE_OPTIONS = PAYROLL_TITLES.map(t => ({ name: t.label, value: t.key }));
const titleOf = (key) => PAYROLL_TITLES.find(t => t.key === key);

function rs(value) {
    const n = Number(value);
    return (Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

const round2 = (n) => Math.round(n * 100) / 100;

function emptyPosting(today) {
    // `months` is the chosen option's value ("7,8,9"); `title`/`amount` are the
    // picker; `details` is what has been added so far; `edited` holds the titles
    // whose amount was typed by hand (the rest follow rate × months).
    return { date: today || '', months: '', remarks: '', title: '', amount: '', details: {}, edited: {} };
}

const REMARKS_MAX = 50; // StaffLedger.remarks is varchar(50)
const countOf = (months) => (months ? months.split(',').length : 1);

// One staff member's catch-up: a payroll title the salary posting missed, a
// period they were left out of (late joiner, rate was 0 at the time), or a
// one-off with no month (bonus, advance).
function StaffLedgerPosting({ onPosted }) {
    const { user: { user }, fiscalYear: { year },
        notification: { updateNotification } } = useAppContext();
    const { data: { staffId, staffBackup } } = useStaffProfile();
    // SAVED Finance Info rates — not the profile's form state, which holds
    // whatever is half-typed in the Finance tab before Update.
    const rates = staffBackup?.data?.other_info || {};
    const schoolId = user?.profile?.school || user?.profile?.id;
    const [posting, setPosting] = useState(() => emptyPosting(user?.today));
    const [monthChoices, setMonthChoices] = useState([]);
    const [loadingMonths, setLoadingMonths] = useState(true);
    const [saving, setSaving] = useState(false);
    const [refresh, setRefresh] = useState(0);

    // Only periods Salary posting has already run (school-wide) — a month
    // nobody else was paid for belongs on Salary posting, not here. Periods
    // this staff member already holds stay listed, tagged, because a title can
    // have been missed the first time.
    useEffect(() => {
        if (!year?.academic_year || !year?.economic_year || !staffId) return;
        // A slower answer for the previous staff member / year must not land
        // on this one.
        let stale = false;
        setLoadingMonths(true);
        (async () => {
            const [school, own] = await Promise.all([
                fetchStaffLedgers(schoolId, year.academic_year, year.economic_year, true),
                fetchStaffLedgers(schoolId, year.academic_year, year.economic_year, true, staffId),
            ]);
            if (stale) return;
            const held = new Set(Array.isArray(own?.months) ? own.months : []);
            setMonthChoices((school?.groups || []).map(({ months, date }) => {
                const billed = months.some(m => held.has(m));
                return {
                    name: `${months.map(m => monthNames[m] || m).join(', ')}${date ? ` — posted ${date}` : ''}${billed ? ' [already posted]' : ''}`,
                    value: months.toString(),
                    billed,
                    tone: billed ? 'warn' : undefined,
                };
            }));
            setLoadingMonths(false);
        })();
        return () => { stale = true; };
    }, [staffId, year?.academic_year, year?.economic_year, refresh]);

    // A period belongs to one fiscal year; carrying it into another would post
    // under the wrong one.
    useEffect(() => {
        setPosting(emptyPosting(user?.today));
    }, [staffId, user?.today, year?.academic_year, year?.economic_year]);

    const selectedMonths = posting.months || '';
    const monthList = selectedMonths ? selectedMonths.split(',').map(Number) : [];
    const selectedChoice = selectedMonths ? monthChoices.find(m => m.value === selectedMonths) : undefined;
    const settled = Boolean(year?.academic_year) && !loadingMonths;
    const noPostedMonths = settled && monthChoices.length === 0;

    const enteredTitles = PAYROLL_TITLES.map(t => t.key).filter(k => k in posting.details);
    const blankAmounts = enteredTitles.filter(k => !(parseFloat(posting.details[k]) > 0));
    const entryCount = enteredTitles.length;
    const nothingToPost = entryCount < 1;
    const total = round2(enteredTitles.reduce((acc, k) => acc + (parseFloat(posting.details[k]) || 0), 0));

    // Rate × months in the chosen period (a single rate when none is chosen).
    function rateFor(key, count) {
        const rate = parseFloat(rates?.[titleOf(key)?.rate]) || 0;
        return rate ? String(round2(rate * (count || 1))) : '';
    }

    function onChange({ name, value }) {
        if (name === 'title') {
            setPosting(state => {
                if (!value) return { ...state, title: '', amount: '' };
                const amount = state.details[value] ?? rateFor(value, countOf(state.months));
                return { ...state, title: value, amount, details: { ...state.details, [value]: amount } };
            });
        } else if (name === 'amount') {
            setPosting(state => state.title
                ? {
                    ...state, amount: value,
                    details: { ...state.details, [state.title]: value },
                    edited: { ...state.edited, [state.title]: true },
                }
                : state);
        } else if (name === 'months') {
            // Titles still at their rate follow the new period (3 months = 3 ×
            // the rate); amounts typed by hand are left alone.
            setPosting(state => {
                const details = Object.fromEntries(Object.entries(state.details).map(([key, amount]) =>
                    [key, state.edited[key] ? amount : rateFor(key, countOf(value))]));
                return {
                    ...state, months: value, details,
                    amount: state.title ? details[state.title] ?? '' : state.amount,
                };
            });
        } else if (name === 'remarks') {
            setPosting(state => ({ ...state, remarks: (value || '').slice(0, REMARKS_MAX) }));
        } else {
            setPosting(state => ({ ...state, [name]: value }));
        }
    }

    function deleteTitle(key) {
        setPosting(state => {
            const { [key]: _, ...details } = state.details;
            const { [key]: __, ...edited } = state.edited;
            return { ...state, details, edited, ...(state.title === key ? { title: '', amount: '' } : {}) };
        });
    }

    // Every title at its rate for the chosen period — what Salary posting
    // would have billed this staff member. Everything stays editable.
    function fillFullSalary() {
        const details = Object.fromEntries(PAYROLL_TITLES
            .map(t => [t.key, rateFor(t.key, monthList.length)])
            .filter(([, amount]) => amount));
        if (Object.keys(details).length === 0) {
            updateNotification('', 'No salary rates set for this staff member — add them in Finance Info, or enter amounts by title.');
            return;
        }
        setPosting(state => ({ ...state, title: '', amount: '', details, edited: {} }));
    }

    async function onSubmit(e) {
        e.preventDefault();
        if (saving || nothingToPost) return;
        if (!posting.date) {
            updateNotification('', 'Enter the posting date.');
            return;
        }
        if (blankAmounts.length > 0) {
            updateNotification('', 'Enter an amount for every title, or remove it.');
            return;
        }
        setSaving(true);
        const details = Object.fromEntries(enteredTitles.map(k => [k, round2(parseFloat(posting.details[k]))]));
        const [status, message] = await saveSalaryPostings({
            school: schoolId,
            academic_year: year?.academic_year,
            economic_year: year?.economic_year,
            date: posting.date,
            months: monthList,
            single_staff: true,
            ledgers: [{
                staff: staffId, details, total,
                remarks: (posting.remarks || '').trim() || null,
            }],
        });
        updateNotification(status, status === 200 ? 'Posted to ledger!' : message);
        if (status === 200) {
            setPosting(emptyPosting(user?.today));
            setRefresh(n => n + 1);
            onPosted?.();
        }
        setSaving(false);
    }

    return (
        <form onSubmit={onSubmit}>
            <Section title={"Ledger posting"}
                description={"Bill this staff member for something the salary posting missed."}
                className="!items-start">
                <TextInput grid={3} input={{ name: 'date', label: "Date" }}
                    value={posting.date} onChange={onChange} />
                <SelectInput grid={5} input={{
                    name: 'months', label: "Months (optional)", options: monthChoices,
                    placeholder: !settled ? 'loading…'
                        : noPostedMonths ? 'no posted months'
                            : 'month — or leave blank',
                }}
                    info={selectedChoice?.billed
                        ? "This staff member is already posted for this period — saving posts it a second time."
                        : !selectedMonths
                            ? (noPostedMonths
                                ? "Salary posting has not run this year yet — post it from Payroll > Salary posting first, or leave the month blank for a one-off."
                                : "Leave blank for a one-off (bonus, advance); pick a month for salary.")
                            : "Only months the salary posting already ran for"}
                    value={selectedMonths} onChange={onChange} />
                <TextInput grid={4} value={posting.remarks}
                    input={{ name: 'remarks', label: 'Remarks', placeholder: 'Optional note kept with the posting' }}
                    info={posting.remarks ? `${posting.remarks.length}/${REMARKS_MAX}` : ''}
                    onChange={onChange} />
            </Section>

            <Section title={"Fees to post"}
                description={"Choose a title — its rate fills in — then repeat for each fee."}
                className="!items-start"
                actions={selectedMonths ? [
                    <Button key="fill" size="sm" variant="outlined" type="button"
                        className="flex items-center gap-1.5 normal-case rounded-lg"
                        title="Each payroll title's rate from Finance Info × the months in this period. Everything stays editable."
                        onClick={fillFullSalary}>
                        <SparklesIcon className="icon" aria-hidden="true" />
                        Fill this staff&apos;s salary
                    </Button>
                ] : []}>
                <SearchInput grid={5} value={posting.title} input={{
                    name: 'title', label: 'Fee title', options: TITLE_OPTIONS,
                }} info={posting.title ? `Rate : ${rates?.[titleOf(posting.title)?.rate] || 0}${monthList.length > 1 ? ` × ${monthList.length} months` : ''}` : ''}
                    onChange={onChange} />
                <TextInput grid={3} value={posting.amount}
                    input={{ name: 'amount', label: 'Amount', type: 'number', readOnly: !posting.title }}
                    info={posting.title ? 'Edits the title selected above' : 'Pick a fee title first'}
                    onChange={onChange} />

                <div className="sm:col-span-12">
                    {entryCount > 0 ? (
                        <>
                            <ul className="flex flex-wrap gap-2">
                                {enteredTitles.map((key) => {
                                    const title = titleOf(key)?.label || key;
                                    const amount = parseFloat(posting.details[key]) > 0 ? posting.details[key] : '';
                                    return (
                                        <li key={key}
                                            title={amount ? undefined : 'Enter an amount for this title'}
                                            className={`app-ledger-chip group flex items-center gap-2 rounded-full border py-1 pl-3 pr-1
                                                ${amount
                                                    ? 'border-blue-gray-100 bg-white shadow-sm'
                                                    : 'border-amber-300 bg-amber-50'}`}>
                                            <span className="capitalize text-[0.82rem] font-medium text-gray-700">{title}</span>
                                            <span className={`text-[0.82rem] font-semibold tabular-nums
                                                ${amount ? 'text-gray-900' : 'text-amber-700'}`}>
                                                {amount ? rs(amount) : 'no amount'}
                                            </span>
                                            <button type="button"
                                                aria-label={`Remove ${title}`}
                                                onClick={() => deleteTitle(key)}
                                                className="grid place-items-center rounded-full p-1 text-gray-400
                                                    transition-colors hover:bg-red-50 hover:text-red-600">
                                                <XMarkIcon className="h-3.5 w-3.5" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                            {blankAmounts.length > 0 &&
                                <p className="mt-2 text-[0.8rem] font-medium text-amber-700">
                                    {blankAmounts.length} title{blankAmounts.length > 1 ? 's have' : ' has'} no
                                    amount — fill or remove {blankAmounts.length > 1 ? 'them' : 'it'} before posting.
                                </p>
                            }
                        </>
                    ) : (
                        <EmptyState icon={ReceiptPercentIcon}
                            title="Nothing to post yet"
                            hint={selectedMonths
                                ? "Pick a fee title above, or fill this staff's salary for the selected month in one go."
                                : "Pick a fee title above. Its rate fills in and stays editable."} />
                    )}
                </div>
            </Section>

            <ButtonsSecion className="justify-between">
                <div className="app-ledger-total flex flex-wrap items-baseline gap-x-2 gap-y-1 text-left">
                    {nothingToPost ? (
                        <span className="text-[0.85rem] text-gray-500">
                            Nothing selected to post.
                        </span>
                    ) : (
                        <>
                            <span className="text-[0.8rem] font-medium uppercase tracking-wide text-gray-500">
                                Total to post
                            </span>
                            <span className="text-lg font-bold tabular-nums text-gray-900">
                                Rs. {rs(total)}
                            </span>
                            <span className="text-[0.8rem] text-gray-500">
                                · {entryCount} title{entryCount > 1 ? 's' : ''}
                                {selectedMonths ? '' : ' · no month'}
                            </span>
                        </>
                    )}
                </div>
                <FormSaveButton
                    custom={[saving, 'Post to ledger', 'Posting...']}
                    disabled={saving || !year?.economic_year || !posting.date || nothingToPost} />
            </ButtonsSecion>
        </form>
    );
}

function StaffLedgerTab({ tab }) {
    const [refreshKey, setRefreshKey] = useState(0);
    return (
        <>
            <StaffLedgerPosting onPosted={() => setRefreshKey(n => n + 1)} />
            <StaffPaymentHistory refreshKey={refreshKey} />
        </>
    )
}

export default StaffLedgerTab;
