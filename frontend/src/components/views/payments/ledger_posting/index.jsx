import ClassPicker from "@/components/inputs/ClassPicker";
import { useEffect, useMemo, useState } from "react";
import classPickerSchema from "@/schemas/class-picker";
import { useAppContext } from "@/contexts/AppContext";
import { ButtonsSecion, Section } from "@/components/sections";
import { Button, Typography } from "@material-tailwind/react";
import { searchStudents } from "@/services/functions/students";
import BasicTable from "@/components/tables/BasicTable";
import { searchFeeDetails } from "@/services/functions/fees";
import MonthPicker from "@/components/inputs/MonthPicker";
import { fullyBilledMonths, generateLedger, generateLedgerTableData, updateLedgerTableData } from "@/methods/payment/ledger";
import { fetchPreviousPostings, saveLedgers } from "@/services/functions/ledgers";
import { TextInput } from "@/components/inputs";
import withTimer from "@/methods/withTimer";
import cleanClassInfo from "@/methods/cleanClassInfo";
import useRequestStatus from "@/hooks/requestStatus";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { months } from "@/components/inputs/options/months";
import AttentionBox from "@/components/AttentionBox";
import { options as education_levels } from "@/components/inputs/options/education";

// Disable whole feature or Allow specific education levels only!
const page_disabled = false;
const allowedEducationLevelKeys = [];
const allowedEducationLevels = education_levels.filter(e => allowedEducationLevelKeys.includes(e.value));
// 
const postingMonthsSchema = { months: [], date: '' }; // PostingMonths // later change this to just list;
const studentLedgerSchema = { student: '', school: '', ledgers: [], total: '' } // schema being used for data to be sent to db;
function LedgerPosting({ allowPost = true }) {
    const { user: { user },
        fiscalYear: { year, hasFiscalYears },
        notification: { updateNotification } } = useAppContext();
    postingMonthsSchema['date'] = user?.today || '';
    classPickerSchema['academic_year'] = year?.academic_year;
    classPickerSchema['school'] = user?.profile?.school || user?.profile?.id;
    studentLedgerSchema['school'] = user?.profile?.school || user?.profile?.id;
    // 
    const [input, setInput] = useState(() => ({ ...classPickerSchema }));
    const [ledgerTableData, setLedgerTableData] = useState([]);
    const [postingMonths, setPostingMonths] = useState(() => ({ ...postingMonthsSchema }));
    // 
    const [pickedAllMonths, setPickedAllMonths] = useState(false);
    const [editable, setEditable] = useState(false);
    const [status, setStatus] = useState(false);

    const { searching, statusHandler } = useRequestStatus();
    // SEARCH INPUT
    function updateInput({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }
    function onStudentSelect(action, studentId) {
        // console.log(action, studentId);
    }
    function onMonthSelect({ name, value }) {
        if (name === 'month') {
            // value is an updated months' array;
            // 
            setPostingMonths(state => ({ ...state, months: value }));
        } else setPostingMonths(state => ({ ...state, [name]: value }));
    }
    function onSelectAllMonths(months) {
        setPostingMonths(state => ({ ...state, months }));
    }
    function resetFetchedData() {
        setLedgerTableData([]);
        setPostingMonths({ ...postingMonthsSchema });
        setPickedAllMonths(false);
    }
    function reset() {
        setInput({ ...classPickerSchema });
        resetFetchedData();
    }
    /* When user search for students, it fetches fees, students, and already posted ledgers' months */
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const _classInfo = cleanClassInfo(input);
        resetFetchedData(); // cleaning fetched data so, calculations won't be there after search;
        const [status, message, _feeDetails] = await searchFeeDetails(_classInfo);
        if (_feeDetails?.length > 0 && user?.today) {
            const [, , _students] = await searchStudents({
                ..._classInfo,
                transportation_fee: true,
                // Per-student hostel rate, for the "hostel" column — asked for
                // ONLY by a school that has the hostel module. For everyone
                // else the flag is absent, the backend skips the subquery
                // entirely, and this screen is exactly what it was before the
                // hostel existed.
                hostel_fee: user?.profile?.uses_hostel || undefined,
                include_discounts: true,
                ledger_posting: true,
            });
            const [, , _previousPostings] = await fetchPreviousPostings(_classInfo, year?.academic_year);
            const _ledgerTableData = generateLedgerTableData(_students, _feeDetails, _previousPostings, user.today);
            // const _ledgerTableData = withTimer(generateLedgerTableData)(_students, _feeDetails);
            // console.log(_ledgerTableData);
            setLedgerTableData(_ledgerTableData);
        } else {
            if (message) {
                updateNotification(status, message);
            } else {
                updateNotification(null, "No fee details found for this class!");
            }
        }
        statusHandler.toggleSearching();
    }
    // LEDGER
    /* Is used to update ledger when admin makes manual edit on generated ledger! */
    function onManualLedgerUpdate(index, key, value) {
        setLedgerTableData(state => {
            const _s = { ...state };
            _s['data'][index][key] = parseFloat(value) || 0;
            const { student_id, name, total, discounts, ...titleAmounts } = _s['data'][index];
            const newTotal = Object.values(titleAmounts)?.reduce((acc, val) => {
                acc += val;
                return acc;
            }, 0);
            _s['data'][index]['total'] = newTotal;
            return _s;
        });
    }
    /* Save ledger to database */
    async function postLedger(e) {
        e.preventDefault();
        setStatus(true);
        if (!hasFiscalYears()) {
            setStatus(false);
            return;
        }
        if (!postingMonths?.date) {
            setStatus(false);
            updateNotification('', "Posting date is required!");
            return;
        }
        const uploadData = generateLedger(ledgerTableData,
            postingMonths.months,
            cleanClassInfo(input),
            user?.profile?.school || user?.profile?.id,
            year,
            postingMonths.date);
        // Everyone in the class already holds every selected month — there is
        // nothing left to bill, and an empty posting is not a valid one.
        if (uploadData?.studentLedgers?.length < 1) {
            setStatus(false);
            updateNotification('', "Every student here is already billed for the selected month(s)!");
            return;
        }
        // console.log(uploadData);
        // setStatus(false);
        // return;
        const [status, message, data] = await saveLedgers(uploadData);
        updateNotification(status, message);
        if (status === 200) {
            reset();
        }
        setStatus(false);
    }
    /* Students who were already billed one of the selected months for a fee
       title being posted here — a catch-up posted from their profile. The month
       stays postable for the class; they are charged only for what they don't
       already hold, and dropped from the posting when nothing is left. Said out
       loud, because their row shows less than everyone else's and that must not
       look like a bug. */
    function alreadyBilledStudents() {
        if ((postingMonths?.months?.length || 0) < 1) return [];
        return Object.values(ledgerTableData?.alreadyBilled || {})
            .map(student => ({
                ...student,
                months: student.months.map(month => months?.[month]).join(', '),
            }));
    }
    /* Months this class can no longer be billed anything for — every fee title
       is either already posted to every student or not payable in the period.
       Recomputed only when the searched class changes. */
    const closedMonths = useMemo(() => fullyBilledMonths(ledgerTableData),
        [ledgerTableData?.data, ledgerTableData?.details, ledgerTableData?.studentTitles]);
    /* disables ledger posting if no months is selected! */
    function shouldDisable() {
        return (ledgerTableData?.data?.length < 1) ||
            (postingMonths?.months?.length < 1) || status;
    }
    /* Post is disabled on top of that when the selection adds up to no charge
       at all — every row would be stored empty. Kept separate from
       `shouldDisable` so Reset and Edit stay live: typing an amount by hand is
       exactly how an admin turns such a selection INTO a real charge. */
    function shouldDisablePost() {
        return shouldDisable() || billableStudentCount() < 1;
    }
    /* How many students this posting would actually charge. */
    function billableStudentCount() {
        return (ledgerTableData?.data || [])
            .filter(row => row?.student_id && parseFloat(row?.total || 0) !== 0).length;
    }
    function resetLedgerCalculations() {
        const data = ledgerTableData.data.reduce((acc, ledger) => {
            const { student_id, name, discounts, total, ...titleCols } = ledger;
            Object.keys({ ...titleCols }).map(key => {
                ledger[key] = 0;
            })
            ledger.total = 0;
            acc.push(ledger);
            return acc;
        }, []);
        // `computed` goes with the cells: it is what tells a typed amount from a
        // calculated one, and after a reset nothing has been typed.
        setLedgerTableData(state => ({ ...state, data, computed: {} }))
        setPostingMonths({ ...postingMonthsSchema });  // reset selected months
        setPickedAllMonths(false);
    }
    // The initial state is snapshotted from classPickerSchema on the FIRST render,
    // when the fiscal-year context may not have resolved yet — leaving
    // academic_year undefined for the whole session. It then gets stripped from
    // the payload (empty values are cleaned) and the posting fails server-side.
    // Re-sync once the context lands.
    useEffect(() => {
        if (!year?.academic_year) return;
        setInput(state => (state.academic_year ? state
            : { ...state, academic_year: year.academic_year }));
    }, [year?.academic_year]);
    //
    useEffect(() => {
        if (ledgerTableData?.data?.length > 0 && postingMonths?.months?.length > 0) {
            /* on month select, ledger will be updated according to the selected and title-payable months */
            const data = updateLedgerTableData(ledgerTableData, postingMonths?.months);
            // const data = withTimer(updateLedgerTableData)(ledgerTableData, postingMonths?.months?.length);
            // console.log(data);
            setLedgerTableData(state => ({ ...state, ...data }));
        }
    }, [postingMonths?.months]);

    return (
        <>
            {page_disabled &&
                <AttentionBox title={"Page Under Maintenance"}
                    description={"This page is temporarily unavailable due to maintenance.\n We're working to bring this back online as quickly as possible."} />
            }
            {allowPost ?
                <AttentionBox title={"नोट"}
                    description={"लेजर पोस्ट गर्नु अघि विद्यार्थी छुट/ फि शिर्षक/ बस स्रटेशन को रकम ठिक छ छैन रुजु गरि पोस्ट गर्नुहोला !!"} />
                :
                <AttentionBox title={"Note"}
                    description={"Please select exact class before search."} />
            }
            <>
                <form onSubmit={onSearch}>
                    <Section>
                        <ClassPicker data={input} onChange={updateInput} classwise={true} />
                    </Section>
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={reset}>Reset</Button>
                        <FormSaveButton isSearch={true} disabled={!input?.education_level || page_disabled} searching={searching} />
                    </ButtonsSecion>
                </form>
            </>
            <div className="mb-2">
                {ledgerTableData?.data?.length > 0 ?
                    <form className="flex flex-col gap-y-3" onSubmit={postLedger}>
                        <>
                            <MonthPicker data={postingMonths?.months}
                                previousData={allowPost ? (ledgerTableData?.postedMonths || []) : []}
                                // A month nobody can be charged a single rupee
                                // for is not "already posted", it is spent —
                                // clicking it could only write rows that bill
                                // nothing. Those are what filled the ledgers
                                // with dated entries showing no particulars.
                                blockedData={allowPost ? closedMonths : []}
                                // A month this class already has a
                                // class-wide posting for is closed here. A
                                // second bill for that period — a missed
                                // title, a late admission — goes on from the
                                // student's profile. Enforced server-side too.
                                previousMode="block"
                                onSelect={onMonthSelect}
                                onSelectAll={onSelectAllMonths}
                                allMonths={{ pickedAllMonths, setPickedAllMonths }}
                                allowAllMonthSelectAtOnce={false}
                            />
                            {allowPost && ledgerTableData?.postedMonths?.length > 0 &&
                                <AttentionBox dismissable={false}
                                    title={"पहिले नै पोस्ट भइसकेको महिना"}
                                    description={
                                        `${ledgerTableData.postedMonths.map(m => months?.[m]).join(', ')} `
                                        + `— already posted for this class, so they can't be posted again from here. `
                                        + `To bill a student anything more for those months, post it from that student's profile (Ledger tab).`
                                    } />
                            }
                        </>
                        {allowPost && <>
                            <div className="w-max float-right mr-4">
                                <TextInput value={postingMonths?.date} onChange={onMonthSelect}
                                    input={{ name: 'date', label: 'Posting Date (BS)', placeholder: 'yyyy-mm-dd' }} />
                            </div>
                        </>}
                        <>
                            {allowPost && (() => {
                                const billed = alreadyBilledStudents();
                                if (billed.length < 1) return null;
                                const skipped = billed.filter(b => b.skipped);
                                return (
                                    <AttentionBox dismissable={false}
                                        title={"पहिले नै पोस्ट भइसकेका विद्यार्थी"}
                                        description={
                                            `${billed.length} student(s) already have some of the selected months posted `
                                            + `(from their profile). They will NOT be charged again for those months`
                                            + `${skipped.length > 0 ? `, and ${skipped.length} of them are left out of this posting entirely` : ''}.\n`
                                            + billed.map(b => `• ${b.name} — ${b.months}${b.skipped ? ' (not posted)' : ''}`).join('\n')
                                        } />
                                );
                            })()}
                            {postingMonths?.months?.length > 0 &&
                                <BasicTable print={true} name={allowPost ? "Students Ledger" : "Income plan"}
                                    onSelect={onStudentSelect}
                                    columns={[
                                        ['name'],
                                        ...(ledgerTableData?.columns || []),
                                        ['total'],
                                    ]} data={ledgerTableData?.data}
                                    showSelected={false} editable={editable}
                                    editableColumns={ledgerTableData?.columns || []}
                                    onChange={onManualLedgerUpdate}
                                    highLightLast={true}
                                    header={
                                        <div className="flex gap-x-2 mb-2">
                                            <span className="capitalize">{!allowPost && "estimated income"} for month :</span>
                                            {
                                                postingMonths.months.map((m, mi) => (
                                                    <span key={mi} className="capitalize">
                                                        {months?.[m]}
                                                        {mi < postingMonths.months.length - 1 && ', '}
                                                    </span>
                                                ))
                                            }
                                        </div>
                                    }
                                />
                            }
                        </>
                        <ButtonsSecion>
                            <Button variant="outlined" disabled={shouldDisable()} onClick={resetLedgerCalculations}>Reset</Button>
                            {allowPost && !page_disabled &&
                                <>
                                    <Button variant="outlined" disabled={shouldDisable()} onClick={() => {
                                        setEditable(state => !state);
                                    }}>{editable ? 'Lock' : 'Edit'}</Button>
                                    <FormSaveButton custom={[status, "Post", "Posting..."]} disabled={shouldDisablePost() || status} />
                                </>
                            }
                        </ButtonsSecion>
                    </form>
                    :
                    <Typography variant="h6" className="my-5">''</Typography>
                }
            </div>
        </>
    )
}

export default LedgerPosting;

/**
 * WHAT TO BE POSTED AS LEDGER
 * PostingMonths {months}
 * StudentLedger {
    * student_id
    * school_id
    * ledgers [{title_id, total}, ...]
    * total
 * }
 * ledgers->object.total is total with discount applied;
 */