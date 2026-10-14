import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import EmptyState from "@/components/EmptyState";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { OLD_DUES, OPENING_BALANCE } from "@/configs/payment";
import StudentPaymentHistory from "@/components/views/payments/student/StudentPaymentHistory";
import { useAppContext } from "@/contexts/AppContext";
import StudentPaymentProvider from "@/contexts/StudentPayment";
import { useStudentProfile } from "@/contexts/StudentProfile";
import { ReceiptPercentIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@material-tailwind/react";
import { useEffect } from "react";

// Money reads as money — two decimals, thousands separated (en-IN), same as the
// payment screens. A bare `1200` and a bare `1200.5` in the same row of chips
// do not compare at a glance; `1,200.00` and `1,200.50` do.
function rs(value) {
    const n = Number(value);
    return (Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

function LedgerInfoTab({ tab }) {
    const { fiscalYear: { year } } = useAppContext();
    const { data: { studentBackup, titles, titleMappings, titleRates },
        view: { currentTab },
        ledger: { postedLedgers, classHasPostings, postedMonthsLoading, studentLedger,
            onStudentLedgerChange, getLedgerTabData, fillClassFeesForMonths, fillingLedger, savingLedger,
            deleteTitleFromLedger, saveStudentLedger } } = useStudentProfile();
    // The month is OPTIONAL. A monthly fee should say which period it bills, but
    // this same entry also charges one-off items — a tie, a belt, a lost book,
    // old dues — that belong to no billing period, so leaving Months blank is a
    // valid posting, not an incomplete one.
    const enteredTitles = Object.keys(studentLedger?.details || {});
    const oldDuesOnly = enteredTitles.length > 0 &&
        enteredTitles.every(title => title === OLD_DUES || title === OPENING_BALANCE);
    const noMonthChosen = !(studentLedger?.months?.length > 0);
    // Only months this class has ALREADY been billed for. This screen exists to
    // catch up a student who enrolled after the class was posted through
    // Payment > Ledger posting, so the choice has to be limited to what the rest
    // of the class already owes. Offering all twelve months (the old fallback)
    // let one student be billed for a period nobody else was, which then reads
    // as a phantom due on every report that compares them.
    // Months the student ALREADY holds are listed too (tagged "already billed"),
    // so the same period can be posted again when a title was missed the first
    // time — the tag is the warning, the cashier makes the call.
    const monthChoices = postedLedgers || [];
    const selectedMonths = studentLedger?.months?.toString() || '';
    const selectedChoice = selectedMonths
        ? monthChoices.find(m => m.value === selectedMonths) : undefined;
    const selectedIsBilled = Boolean(selectedChoice?.billed);
    // Nothing here was posted for the class — every option is some individual
    // student's catch-up. Without saying so the picker looks like it is offering
    // months that were never posted at all.
    const noneClassWide = monthChoices.length > 0 &&
        monthChoices.every(m => m.notClassWide);
    // Until the academic year resolves nothing has been LOOKED UP yet, which is
    // not the same as "nothing is posted" — claiming the latter sent people off
    // to re-post a class that was already billed.
    const yearReady = Boolean(year?.academic_year);
    const settled = yearReady && !postedMonthsLoading;
    const noPostedMonths = settled && monthChoices.length === 0;
    // What is actually about to be posted. `total` is kept by the context as
    // titles come and go; the count and the "has a blank amount" check are what
    // decide whether Save can do anything, so they are computed from the same
    // object the validator reads rather than tracked separately.
    const entryCount = enteredTitles.length;
    const blankAmounts = enteredTitles.filter(key => !studentLedger?.details?.[key]);
    const nothingToPost = entryCount < 1;
    // What "Fill this class's fees" took off for this student's discount. The
    // amounts on the chips are already net of it; without saying so a discounted
    // fee is indistinguishable from one that was simply filled in wrong.
    const discounted = studentLedger?.discounted || {};
    // Written into the sentence itself, so the names are capitalised here the
    // way the chips' `capitalize` does it — a nested span would not take the
    // paragraph's size.
    const waivedTitles = (studentLedger?.waived || []).map(key =>
        `${titleMappings?.[key] || key}`.replace(/(^|\s)\S/g, letter => letter.toUpperCase()));
    const discountTotal = enteredTitles.reduce((sum, key) => sum + (discounted[key] || 0), 0);
    //
    // The academic year arrives from AppContext ASYNCHRONOUSLY, so on the first
    // render it is still ''. Firing the lookup then asked the API for "posted
    // months in academic year <nothing>", which the backend answered with a
    // different endpoint's payload — and the tab settled on "this class has no
    // posted ledger yet" for a class that had dozens of postings. The year is a
    // dependency, not just an argument: skip until it exists, and re-run when it
    // lands.
    useEffect(() => {
        if (!year?.academic_year) return;
        (async () => {
            await getLedgerTabData(tab, studentBackup?.ids?.cid);
        })();
    }, [studentBackup?.ids?.sid, currentTab, year?.academic_year]);

    if (!studentBackup?.ids?.cid) {
        return (
            <EmptyState tone="warn" icon={ReceiptPercentIcon}
                title="This student isn't in a class yet"
                hint="A ledger posting is billed against a class. Assign one from the Personal tab, then come back here." />
        );
    }
    return (
        <>
            <form onSubmit={saveStudentLedger}>
                {/* WHEN it is billed. Date and period belong together and are
                    answered once; the fee titles below are the part that
                    repeats, which is why they are now their own section rather
                    than three more fields in the same run of five. */}
                <Section title={"Ledger posting"}
                    description={"Bill this student for something the class posting missed."}
                    className="!items-start">
                    <TextInput grid={3} input={{ name: 'date', label: "Date" }}
                        value={studentLedger?.date} onChange={onStudentLedgerChange} />
                    <SelectInput grid={5} input={{
                        // An option can carry SEVERAL months ("1,2,3"), so the label stays plural.
                        name: 'months', label: "Months (optional)", options: monthChoices,
                        placeholder: !settled ? 'loading…'
                            : noPostedMonths ? 'no posted months'
                                : 'month — or leave blank',
                    }}
                        // An empty list is a real state, not a glitch — but it has two
                        // causes and they need opposite actions. Either the class has
                        // never been posted (go and post it), or it has and this student
                        // already holds every one of those months (nothing to do). Saying
                        // the first to someone looking at a paid-up student sent them off
                        // to re-post a class that was already billed. It is a hint, not an
                        // error: a month-less posting saves fine.
                        info={selectedIsBilled
                            ? "This student is already billed for this period — saving posts it a second time."
                            : selectedChoice?.notClassWide
                                ? "This period was never posted for the class — it comes from another student's individual entry."
                                : noMonthChosen
                                    ? (oldDuesOnly
                                        ? "Old dues need no month."
                                        : noPostedMonths && !classHasPostings
                                            ? "This class has no posted ledger yet — post it from Payment > Ledger posting first, or leave the month blank for a one-off charge."
                                            : "Leave blank for a one-off charge (tie, belt, old dues); pick a month for a monthly fee.")
                                    : noneClassWide
                                        ? "This class has no class-wide posting — these months come from individual student entries"
                                        : "Only months already posted for this class"}
                        value={selectedMonths} onChange={onStudentLedgerChange} />
                    <TextInput grid={4} value={studentLedger?.remarks}
                        input={{ name: 'remarks', label: 'Remarks', placeholder: 'Optional note kept with the posting' }}
                        onChange={onStudentLedgerChange} />
                </Section>

                {/* WHAT is billed — the repeated part: pick a title, its rate
                    fills in, adjust the amount, pick the next one. The list of
                    what has been picked so far sits directly under the two
                    fields that build it, instead of in a section of its own
                    that was empty until you noticed the connection. */}
                <Section title={"Fees to post"}
                    description={"Choose a title — its rate fills in — then repeat for each fee."}
                    className="!items-start"
                    actions={selectedMonths ? [
                        // The point of this tab: rebuild what the class was
                        // billed for the chosen period, instead of making
                        // someone retype every title and amount and hope it
                        // matches a posting they cannot see from here.
                        <Button key="fill" size="sm" variant="outlined" type="button"
                            className="flex items-center gap-1.5 normal-case rounded-lg"
                            title="Uses each title's rate and the months it is payable in, adds this student's transportation, and takes off their discount. Everything stays editable."
                            disabled={fillingLedger}
                            onClick={() => fillClassFeesForMonths(selectedMonths)}>
                            <SparklesIcon className="icon" aria-hidden="true" />
                            {fillingLedger ? 'Filling…' : <>Fill this class&apos;s fees</>}
                        </Button>
                    ] : []}>
                    <SearchInput grid={5} value={studentLedger?.title} input={{
                        name: 'title', label: 'Fee title',
                        options: [...titles]
                    }} info={studentLedger?.title ? `Rate : ${titleRates?.[studentLedger.title] || ''}` : ''}
                        onChange={onStudentLedgerChange} />
                    <TextInput grid={3} value={studentLedger?.amount}
                        input={{ name: 'amount', label: 'Amount', type: 'number' }}
                        info={studentLedger?.title ? 'Edits the title selected above' : ''}
                        onChange={onStudentLedgerChange} />

                    {/* The running list. It used to be a row of grey blocks
                        reading "tuition fee :: 1200" with a square × tacked on,
                        and NOTHING when it was empty — a heading, a sentence and
                        then a band of blank card, which is the state a cashier
                        opens this tab in. */}
                    <div className="sm:col-span-12">
                        {entryCount > 0 ? (
                            <>
                                <ul className="flex flex-wrap gap-2">
                                    {enteredTitles.map((key) => {
                                        const title = titleMappings?.[key] || key;
                                        const amount = studentLedger?.details?.[key] || '';
                                        // A title with no amount cannot be saved — the
                                        // validator rejects the whole posting. Saying so
                                        // ON the chip beats a notification that names no
                                        // title once Save has already failed.
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
                                                {amount && discounted[key] > 0 &&
                                                    <span className="text-[0.74rem] font-medium text-teal-700">
                                                        after {rs(discounted[key])} discount
                                                    </span>
                                                }
                                                <button type="button"
                                                    aria-label={`Remove ${title}`}
                                                    onClick={() => deleteTitleFromLedger(key)}
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
                                {waivedTitles.length > 0 &&
                                    <p className="mt-2 text-[0.8rem] font-medium text-teal-700">
                                        Not billed — fully covered by this student&apos;s discount: {waivedTitles.join(', ')}.
                                    </p>
                                }
                            </>
                        ) : (
                            <EmptyState icon={ReceiptPercentIcon}
                                title="Nothing to post yet"
                                hint={selectedMonths
                                    ? "Pick a fee title above, or fill this class's fees for the selected month in one go."
                                    : "Pick a fee title above. Its rate fills in and stays editable."} />
                        )}
                    </div>
                </Section>

                {/* The tray used to be a wide empty bar with one outlined button
                    in the corner. What belongs beside Save is the number the
                    click commits: a posting is money, and it should be readable
                    without adding the chips up by eye. */}
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
                                    Rs. {rs(studentLedger?.total)}
                                </span>
                                <span className="text-[0.8rem] text-gray-500">
                                    · {entryCount} title{entryCount > 1 ? 's' : ''}
                                    {selectedMonths ? '' : ' · no month'}
                                    {discountTotal > 0 ? ` · Rs. ${rs(discountTotal)} discount taken off` : ''}
                                </span>
                            </>
                        )}
                    </div>
                    <FormSaveButton
                        custom={[savingLedger, 'Post to ledger', 'Posting...']}
                        disabled={!year?.academic_year || nothingToPost} />
                </ButtonsSecion>
            </form>

            <StudentPaymentProvider studentId={studentBackup?.ids?.sid}
                onlyForTrialBalance={true}>
                <StudentPaymentHistory />
            </StudentPaymentProvider>
        </>
    )
}

/**
 *
 */

export default LedgerInfoTab;
