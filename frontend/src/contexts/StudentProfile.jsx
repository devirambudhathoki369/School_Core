import { confirmAction } from "@/components/ConfirmDialog";
import { fillData, flattenSchema } from "@/methods/FlattenSchema";
import { deleteStudentDiscount, getStudentDetails, getStudentDiscounts, getStudentTransportations, saveStudentDiscount, saveStudentTransportation, updateStudent } from "@/services/functions/students";
import { getAllocations } from "@/services/functions/hostel";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useAppContext } from "./AppContext";
import studentSchema, { transportationSchema, discountSchema } from "@/schemas/student";
import cleanEmptyFields from "@/methods/cleanEmptyFields";
import { fetchFeeTitles } from "@/services/functions/feeTitles";
import extractDiff from "@/methods/extractDiff";
import { getLedgers, getPostedMonths, saveLedgers } from "@/services/functions/ledgers";
import { OLD_DUES, TRANSPORTATION, HOSTEL, HOSTEL_ADMISSION, HOSTEL_DEPOSIT } from "@/configs/payment";
import { OPTION_OLDDUES, OPTION_TRANSPORTATION, hostelTitleOptions } from "@/components/inputs";
import cleanClassInfo from "@/methods/cleanClassInfo";
import { months } from "@/components/inputs/options/months";
import safeDecimal from "@/methods/safeDecimal";
import { studentFeesForMonths } from "@/methods/payment/ledger";

// Marker the profile page sets while every section is mounted at once, so each
// section's loader runs on mount instead of waiting to become "the current tab".
// Lives here rather than in the page because the loaders that check it live
// here — importing it back from the page would be a cycle.
export const ALL_SECTIONS = '__all__';

const StudentProfileContext = createContext({});

export function useStudentProfile() {
    return useContext(StudentProfileContext);
}

// `discounted` and `waived` describe the entry on screen — how much discount a
// filled amount already has taken off, and which titles a discount covered
// outright. They are never posted (see validateStudentLedger).
const studentLedgerSchema = { date: '', months: '', student: '', school: '', details: {}, discounted: {}, waived: [], total: '', title: '', amount: '', remarks: '', economic_year: '', academic_year: '' }
export default function StudentProfileProvider({ children, studentId }) {
    const { user: { user },
        fiscalYear: { year },
        notification: { updateNotification } } = useAppContext();
    const [student, setStudent] = useState(null);
    const [studentBackup, setStudentBackup] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [currentTab, setCurrentTab] = useState('');
    const [editingTab, setEditingTab] = useState('');
    // ---
    // discount
    discountSchema['school'] = user?.profile?.school || user?.profile?.id;
    discountSchema['student'] = studentId;
    const [transportationForm, setTransportationForm] = useState({ ...transportationSchema });
    const [transportationServices, setTransportationServices] = useState([]);
    const [discountForm, setDiscountForm] = useState({ ...discountSchema });
    const [discounts, setDiscounts] = useState([]);
    const [titles, setTitles] = useState([]); // fee-titles;
    const [titleRates, setTitleRates] = useState({});
    const [titleMappings, setTitleMappings] = useState({});
    // Which months each fee title is billable in. Needed to reproduce a class
    // posting for a student who joined after it: a title charged for a month it
    // is not payable in is simply a wrong bill.
    const [titleMonths, setTitleMonths] = useState({});
    // ledger
    studentLedgerSchema['school'] = user?.profile?.school || user?.profile?.id;
    studentLedgerSchema['student'] = studentId;
    studentLedgerSchema['date'] = user?.today;
    studentLedgerSchema['academic_year'] = year.academic_year;
    studentLedgerSchema['economic_year'] = year.economic_year;
    const [postedLedgers, setPostedLedgers] = useState([]);
    const [classHasPostings, setClassHasPostings] = useState(false);
    const [savingLedger, setSavingLedger] = useState(false);
    const [fillingLedger, setFillingLedger] = useState(false);
    // The student's discounts and per-student services, as a PROMISE: asked for
    // when the Ledger tab opens and awaited by "Fill this class's fees", so a
    // click that lands before the answer waits for it instead of billing the
    // full rate.
    const billingInputs = useRef(null);
    // The provider outlives a student — the page swaps `studentId` under it —
    // so an answer that arrives late must be able to tell it is for the last one.
    const currentStudent = useRef(studentId);
    currentStudent.current = studentId;
    // Nothing has been ASKED yet is a third state, distinct from "asked, and the
    // class has no posted month". Without it the tab spent every load — and the
    // whole of any slow or failed request — telling the cashier the class had
    // never been posted, which for most classes is simply untrue.
    const [postedMonthsLoading, setPostedMonthsLoading] = useState(true);
    const [studentLedger, setStudentLedger] = useState({ ...studentLedgerSchema });
    // -- DISCOUNT
    const [savingDiscount, setSavingDiscount] = useState(false);
    function onDiscountInfoChange({ name, value }) {
        setDiscountForm(state => {
            const ns = { ...state };
            if (name === "title") {
                ns[name] = value;
                ns["discount"] = "";
                ns["percentage"] = "";
                return ns;
            }
            if (name === "remarks") {
                ns[name] = value;
                return ns;
            }
            const rate = titleRates?.[ns?.title] || 0;
            value = parseFloat(value) || parseInt(value) || 0;
            if (name === "percentage") {
                ns['discount'] = discountCalculations.amount(value, rate);
            } else if (name === "discount") {
                ns["percentage"] = discountCalculations.percentage(value, rate);
            }
            ns[name] = value; // stores parsed values!
            return ns;
        });
    }
    async function onDiscountEdit(id) {
        const item = discounts.reduce((acc, _discount) => {
            if (_discount.id === id) {
                const { discount, percentage, title } = _discount;
                acc = { discount, percentage, title: title.toString(), id };
            }
            return acc;
        }, {});
        setDiscountForm({ ...discountSchema, ...item });
    }
    async function onDiscountDelete(id) {
        const [status, message, _] = await deleteStudentDiscount(id, studentId, user?.profile?.school || user?.profile?.id);
        updateNotification(status, message);
        if (status === 200) {
            setDiscounts(state => [...state.filter(item => item.id != id)]);
        }
    }
    function isDiscountValid(data) {
        const rate = titleRates?.[data?.title];
        return (
            data?.title &&
            (data?.discount && data?.percentage)
            && (
                discountCalculations.percentage(data?.discount, rate) === data?.percentage
            )
        )
    }
    async function onDiscountSave(e) {
        e.preventDefault();
        // console.log(discountForm);
        if (!isDiscountValid(discountForm)) {
            updateNotification(500, "Invalid discount inputs!");
            return;
        }
        setSavingDiscount(true);
        const [status, message, data] = await saveStudentDiscount(discountForm);
        // console.log(data);
        updateNotification(status, message);
        if (status === 200) {
            // after new entry;
            if (data?.discount) {
                // console.log(titleMappings, data.discount);
                data.discount['title_name'] = titleMappings[data.discount['title']];
                setDiscounts(state => [data.discount, ...state])
            }
            // after update;
            if (discountForm?.id) {
                const { discount, title } = discountForm;
                setDiscounts(state =>
                    [...state
                        .map(item =>
                            item.id === discountForm.id ?
                                { ...item, discount, title, title_name: titleMappings[title] } :
                                item)
                    ]);
            }
            resetDiscountForm();
        }
        setSavingDiscount(false);
    }
    function resetDiscountForm() {
        setDiscountForm({ ...discountSchema });
    }
    // -- ledger
    /**
     * What this student's bill depends on besides the class's fee table: their
     * own discounts, and the per-student services (bus, hostel) with the date
     * each one began.
     *
     * The Ledger tab used to know these only if the Discount tab had been
     * opened first — that tab's loader was the only thing that fetched them.
     * Opened directly, "Fill this class's fees" billed the full rate, and
     * "transportation" picked by hand came with no rate at all.
     *
     * Resolves to null when a lookup failed: "could not ask" must never be
     * read as "has no discount".
     */
    async function loadBillingInputs() {
        const school = user?.profile?.school || user?.profile?.id;
        try {
            // The bus fee and the day the service began come from two shapes of
            // the same endpoint; the row's id joins them.
            const [tspFees, tspServices, discountRows, hostel] = await Promise.all([
                getStudentTransportations(studentId, school, true, true),
                getStudentTransportations(studentId, school, true),
                getStudentDiscounts(studentId, school),
                fetchStudentHostelAsTitle(),
            ]);
            if (![tspFees, tspServices, discountRows].every(Array.isArray)) return null;
            if (currentStudent.current !== studentId) return null;
            const services = {};
            const tsp = tspFees[0];
            if (tsp) {
                services[TRANSPORTATION] = {
                    rate: tsp.bus_station__fee,
                    since: tspServices.find(service => service.id === tsp.id)?.start_date,
                };
            }
            if (hostel) {
                services[HOSTEL] = { rate: hostel.monthly_fee, since: hostel.check_in_date };
            }
            // Set when the student rides the bus, and CLEARED when they do not:
            // a service stopped on the Transportation tab a minute ago must not
            // go on offering its fare here.
            setTitleRates(state => {
                const { [TRANSPORTATION]: _stale, ...rates } = state;
                return tsp ? { ...rates, [TRANSPORTATION]: tsp.bus_station__fee } : rates;
            });
            return { studentId, discounts: discountRows, services };
        } catch (e) {
            return null;
        }
    }
    async function getLedgerTabData(tab, classId) {
        // The profile mounts every section at once and reports ALL_SECTIONS, never
        // this tab's own key, so this guard never passed and the posted-month list
        // was permanently empty. That is what the "fall back to all twelve months"
        // hack in the Ledger tab was really working around — it let a student be
        // billed for a month the class had never been posted for. The other tabs
        // (transportation, discount, medical) already accept both; this one was
        // missed.
        if (currentTab === tab.key || currentTab === ALL_SECTIONS) {
            setPostedMonthsLoading(true);
            // Alongside the posted months rather than after them — neither
            // answer needs the other, and the picker should not wait on this.
            billingInputs.current = loadBillingInputs();
            // __fetch hands back the error payload (an object) on failure, so
            // this is guarded rather than trusted — a failed lookup must leave
            // the picker empty, not throw and take the whole Ledger tab down.
            const res = await getPostedMonths(
                user?.profile?.school || user?.profile?.id, classId,
                year?.academic_year, studentId);
            const rows = Array.isArray(res) ? res : [];
            // A failed lookup is not evidence about the class either way, so it
            // must not turn into "this class has never been posted".
            if (!Array.isArray(res)) {
                setPostedLedgers([]);
                setClassHasPostings(true);
                setPostedMonthsLoading(false);
                return;
            }
            // Months the student already holds. These used to be REMOVED from the
            // picker; now they stay and are only labelled, because a month can
            // legitimately need a second entry (a fee title missed the first time,
            // a correction). The cashier is told which ones are already billed and
            // decides — hiding them forced the same work through a workaround.
            // The check is per MONTH, not per posted group, because groups overlap:
            // a class can hold both "Baisakh, Jestha, Ashad" and a later "Ashad".
            const billedMonths = new Set(
                rows.filter(led => led?.taken).flatMap(led => led?.months || [])
            );
            // Same months written in a different order are the same period.
            const keyOf = (m) => [...m].sort((a, b) => a - b).join(',');
            const groups = rows.reduce((acc, led) => {
                const ms = led?.months || [];
                if (ms.length === 0) return acc;
                const key = keyOf(ms);
                if (acc[key]) return acc;
                const billed = ms.some(m => billedMonths.has(m));
                // The class has no class-wide posting at all, so what is on offer
                // is another student's individual catch-up, not a period this
                // class was billed for. Saying so is the whole point: unmarked,
                // these read as real postings and the tab looks like it is
                // inventing months nobody posted.
                const notClassWide = Boolean(led?.not_class_wide);
                // Posted while the class sat on a different class row — a
                // mid-year section split. Same period, same class, recorded
                // elsewhere; saying so stops it reading as a stray entry.
                const carriedOver = Boolean(led?.carried_over);
                acc[key] = {
                    // Month names rather than raw numbers, and the posting's own
                    // date, so two groups that share a month can be told apart.
                    name: `${ms.map(m => months?.[m] || m).join(', ')}${led?.date ? ` — posted ${led.date}` : ''}${carriedOver ? ' [posted before section change]' : ''}${notClassWide ? ' [not posted class-wide]' : ''}${billed ? ' [already billed]' : ''}`,
                    value: ms.toString(),
                    billed,
                    notClassWide,
                    carriedOver,
                    // The list is a dozen near-identical lines and the tag that
                    // distinguishes them sits at the far right of each one, past
                    // the month names and the posting date — read last, if at
                    // all. A light fill puts the same fact where the eye lands
                    // first: amber for a period this student already holds
                    // (posting it again bills a second time), grey for one that
                    // came from another student's individual entry rather than
                    // from a class-wide posting. Plain months stay untinted, so
                    // the ordinary choice is the unmarked one.
                    tone: billed ? 'warn' : notClassWide ? 'muted' : undefined,
                };
                return acc;
            }, {});
            setPostedLedgers(Object.values(groups));
            // An empty picker has two very different causes and the tab used to
            // blame the wrong one: "post it from Payment > Ledger posting first"
            // is useless advice to a cashier looking at a student who is simply
            // paid up. Remember whether the class had any posted period at all.
            setClassHasPostings(rows.some(led => (led?.months || []).length > 0));
            setPostedMonthsLoading(false);
        }
    }
    function onStudentLedgerChange({ name, value }) {
        setStudentLedger(state => {
            // `details` was mutated in place, which edits the previous state
            // object React still holds. Cloned so each change is its own value.
            const newState = { ...state, details: { ...(state.details || {}) } };
            // An amount picked or typed by hand is the cashier's figure, not
            // "the rate less the discount" — the note saying so goes with it.
            if (name === 'title' || name === 'amount') {
                const edited = name === 'title' ? value : newState.title;
                const { [edited]: _note, ...discounted } = state.discounted || {};
                newState['discounted'] = discounted;
                newState['waived'] = (state.waived || []).filter(title => title !== edited);
            }
            if (name === 'title') {
                // Picking a fee title fills its rate straight into Amount rather
                // than only showing it as a hint beside the field. The rate is
                // what gets billed nine times out of ten, and it stays editable
                // for the tenth — retyping a number the system already knows was
                // the slowest part of posting a single student's ledger.
                const rate = parseFloat(titleRates?.[value]) || 0;
                newState['details'][value] = rate;
                newState['amount'] = rate ? `${rate}` : '';
                newState['total'] = sumLedgerDetails(newState['details']);
            } else if (name === 'amount') {
                newState['details'][newState.title] = parseFloat(value) || 0;
                newState['total'] = sumLedgerDetails(newState['details']);
            } else if (name === "months") {
                value = value === "" ? [] : value.split(",").map(Number)
            }
            newState[name] = value;
            return newState;
        });
    }
    /**
     * Fill the entry with what this class was billed for the selected period.
     *
     * This tab exists to catch up a student who enrolled after the class was
     * posted. Doing that by hand meant picking every fee title and retyping
     * every amount — for a 6-title school that is 12 fields per student, each
     * one a chance to bill the wrong figure, and it had to match a class
     * posting nobody could see from here. So it is built by the same
     * calculation the class-wide posting uses (`studentFeesForMonths`): each
     * title's rate for the months it is payable in, the student's bus and
     * hostel from the month each began, and their discount taken off.
     *
     * Everything stays editable afterwards — this is a starting point, not a
     * decision. Titles not payable in the chosen months are left out entirely
     * rather than added as zero, because a zero row still reads as a charge.
     */
    async function fillClassFeesForMonths(monthsValue) {
        const selected = (monthsValue || '')
            .toString().split(',').map(Number).filter(Boolean);
        if (selected.length < 1) {
            updateNotification('', 'Choose the month(s) first!');
            return;
        }
        if (fillingLedger) return;
        setFillingLedger(true);
        // Normally already answered by the time anyone can click. Asked again
        // only when the first attempt failed or was for another student.
        let inputs = await billingInputs.current;
        if (inputs?.studentId !== studentId) {
            billingInputs.current = loadBillingInputs();
            inputs = await billingInputs.current;
        }
        setFillingLedger(false);
        if (currentStudent.current !== studentId) return;
        if (!inputs) {
            updateNotification('', "Couldn't read this student's discount and transportation. Please try again!");
            return;
        }
        const { details, discounted, waived } = studentFeesForMonths({
            months: selected,
            rates: titleRates,
            titleMonths,
            services: inputs.services,
            discounts: inputs.discounts,
            today: user?.today,
        });
        if (Object.keys(details).length < 1) {
            updateNotification('', waived.length > 0
                ? "This student's discount covers every fee payable in the selected month(s)!"
                : 'No fee title of this class is payable in the selected month(s)!');
            return;
        }
        setStudentLedger(state => ({
            ...state,
            details,
            discounted,
            waived,
            total: sumLedgerDetails(details),
            title: '',
            amount: '',
        }));
    }
    function deleteTitleFromLedger(title) {
        setStudentLedger(state => {
            const s = {
                ...state,
                details: { ...(state.details || {}) },
                discounted: { ...(state.discounted || {}) },
            };
            delete s['details'][title];
            delete s['discounted'][title];
            // With the last title gone the fill it came from is gone too, and
            // so is what that fill left out.
            if (Object.keys(s['details']).length < 1) s['waived'] = [];
            s['total'] = sumLedgerDetails(s['details']);
            return s;
        })
    }
    function resetStudentLedger() {
        setStudentLedger(() => ({ ...studentLedgerSchema, 'details': {}, 'discounted': {}, 'waived': [] })); // for some reason, have to delete forcefully!
        setPostedLedgers([]);
    }
    function validateStudentLedger(stdLedger) {
        /** clean and validate student ledger; */
        if (stdLedger?.['details']) {
            stdLedger['details'] = cleanEmptyFields(stdLedger?.details || {}, ['months']);
            if (Object.keys(stdLedger?.details || {}).length < 1) {
                updateNotification('', 'Please choose titles!');
                return false;
            } else if (!(Object.entries(stdLedger?.details || {}).every(([title, amount]) => title && amount))) {
                updateNotification('', 'Invalid data!');
                return false;
            }
            // The month is OPTIONAL here. A monthly fee should carry the period it
            // bills, but this same entry is also how a school charges a one-off
            // item — a tie, a belt, a lost book, old dues — which belongs to no
            // billing period at all. Requiring a month forced those onto an
            // arbitrary one; the picker asks, it does not insist.
        }
        // MUST: remove title and amount from studentLedger as it's already in studentLedger.details;
        delete stdLedger['title'];
        delete stdLedger['amount'];
        // on-screen notes about the discount; the amounts in `details` are already net of it.
        delete stdLedger['discounted'];
        delete stdLedger['waived'];
        // empty remarks -> null so it's stored clean;
        stdLedger['remarks'] = (stdLedger['remarks'] || '').toString().trim() || null;
        return stdLedger;
    }
    async function saveStudentLedger(e) {
        e.preventDefault();
        // A ledger posting is money. Without a pending flag a second click on a
        // slow connection posts the whole bill twice, and there is nothing in
        // the result to say which of the two was the accident.
        if (savingLedger) return;
        const ledger = validateStudentLedger({ ...studentLedger });
        if (!ledger) return;
        setSavingLedger(true);
        const [status, message,] = await saveLedgers({ ...ledger, class_info: studentBackup?.ids?.cid }, false);
        updateNotification(status, message);
        if (status === 200) {
            resetStudentLedger();
            // The month just posted is now one this student holds, so re-ask:
            // otherwise the picker keeps offering it without the "already
            // billed" tag and invites the same posting a second time.
            await getLedgerTabData({ key: currentTab }, studentBackup?.ids?.cid);
        }
        setSavingLedger(false);
    }
    // -- student
    function onChange({ name, value }) {
        setStudent(state => ({ ...state, [name]: value }));
    }
    /**
     * A picture was saved or removed on its own (the photo, a document).
     *
     * Both copies take the new value: the form, which the profile card reads
     * its photo from, and the backup the next Update is diffed against — left
     * behind, the backup would make that Update send the picture's PATH back
     * as if it were a changed field.
     */
    function onImageSaved(name, path) {
        setStudent(state => (state ? { ...state, [name]: path } : state));
        setStudentBackup(state => (state ? { ...state, data: { ...state.data, [name]: path } } : state));
    }
    // -- transportation
    function onTransportationEdit(id) {
        const item = transportationServices.reduce((acc, _service) => {
            if (_service.id === id) {
                const { bus_station, start_date, is_active } = _service;
                acc = { bus_station, start_date, is_active, id };
            }
            return acc;
        }, {});
        setTransportationForm({ ...item });
    }
    function onTransportationInfoChange({ name, value }) {
        setTransportationForm(state => ({ ...state, [name]: value }));
    }
    function resetTransportationForm() {
        setTransportationForm({ ...transportationSchema });
    }
    async function onTransportationServiceEnroll(e) {
        e.preventDefault();
        // Enrolling with the station left empty used to go through: the running
        // service was stopped, a service to nowhere was saved, and the server
        // then failed. Stopped here, before "replace the current service?" is
        // even asked. (Updating a service that has one already is untouched.)
        if (!transportationForm?.id && !transportationForm?.bus_station) {
            updateNotification(400, "Choose a bus station first.");
            return;
        }
        if (!transportationForm?.id) {
            if (!await confirmAction({
                title: "Replace the current transportation service?",
                body: "The student's existing route and stop are stopped, and billing moves to the new service from this point on.",
                tone: "warning",
                confirmText: "Replace service",
            })) {
                return;
            }
        }
        const [status, message, data] = await saveStudentTransportation({
            ...transportationForm,
            student: studentId,
            school: user?.profile?.school || user?.profile?.id,
            strict: transportationForm?.id ? false : true
        });
        updateNotification(status, message);
        if (status === 200) {
            if (transportationForm?.id) {
                setTransportationServices(transportationServices.reduce((acc, _service) => {
                    if (_service.id === transportationForm?.id) {
                        const { is_active, bus_station, start_date } = transportationForm;
                        _service = { ..._service, is_active, bus_station, start_date };
                        _service["active"] = is_active ? "yes" : "no";
                    }
                    acc.push(_service);
                    return acc;
                }, []));
            }
            resetTransportationForm();
            if (data?.service) {
                setTransportationServices(state => ([data.service, ...state]));
            }
        }
    }
    /**
     * parent is foreign key i.e. guardian_info to access guardian details in context of student object;
    */
    function onReset(parent = null) {
        const _student = { ...student };
        Object.entries(parent ? studentBackup.data[parent] || {} : studentBackup.data || {})
            ?.map(([key, prevVal]) => {
                if (_student?.[key] && _student[key] != prevVal) {
                    // console.log(key);
                    // if value is changed, reset current/changed value to previous-value;
                    _student[key] = prevVal;
                }
            });
        setStudent(_student);
    }
    async function onUpdate() {
        let data = extractDiff(flattenSchema(studentBackup.data), student);
        const hasSection = data?.section || data?.section === ''; // HAVE TO MANUALLY HANDLE SECTION when it's "";
        // console.log({ ...data });
        // ---
        // extract keys so that empty fields won't be cleared
        const keys = Object.keys(data);
        // console.log(keys);
        // ---
        // merge this data to main student-schema, because student-schema has null values by default;
        // this is to format data in proper schema which is must!;
        data = fillData(studentSchema, data);
        // console.log({ ...data });
        // ---
        // clean empty fields to reduce payload size;
        data = cleanEmptyFields(data, keys);
        // console.log({ ...data });
        // ---
        // add ids to make update possible;
        if (Object.keys(data).length > 0 || hasSection) {
            data['id'] = studentBackup.ids.sid;
        } else {
            updateNotification(400, "Nothing changed!");
            return null;
        }
        data?.other_info && (data['other_info']['id'] = studentBackup.ids.oid);
        data?.guardian_info && (data['guardian_info']['id'] = studentBackup.ids.gid);
        // console.log({ ...data });
        // ---
        // upload it to server;
        data = { ...data, 'school': user?.profile?.school || user?.profile?.id };
        if (data?.class_info || hasSection) {
            const cinfo = data?.class_info || {};
            // hasSection either contains section or if section is "", it contains true
            cinfo['section'] = typeof hasSection === "boolean" ? null : hasSection;
            data['class_info'] = cleanClassInfo({ ...studentBackup.data.class_info, ...cinfo });
            data['class_info']['academic_year'] = year?.academic_year;
            // Whether exam results follow the student. Ticked by default; the
            // operator can clear it on the Grade Info tab. Sent only alongside a
            // class/section change since it is not part of the student schema
            // and would otherwise be dropped by the diff. The backend still
            // auto-detects when this is absent.
            data["section_change_only"] = student?.section_change_only !== false;
            data["academic_year"] = year?.academic_year;
        }
        const [status, message, _] = await updateStudent(data);
        if (status === 200) {
            // update local backup;
            const bkpData = fillData(studentBackup.data, student);
            setStudentBackup(state => ({ ...state, 'data': bkpData }));
        }
        // notify to the user;
        updateNotification(status, message);
        // finally, make current tab uneditable;
        setEditingTab('');
        setEditMode(state => !state);
    }
    function handleViewMode(section) {
        setEditingTab(section);
        setEditMode(state => !state);
    }
    function isReadOnly(section) {
        return !(editingTab === section);
    }
    // 
    async function fetchStudentDetails() {
        let data = await getStudentDetails(studentId, user?.profile?.school || user?.profile?.id);
        // console.log(data);
        const { id: sid, guardian_info: { id: gid }, class_info: { id: cid } } = data; // extracting ids for later use;
        const ids = { sid, gid, cid }; // sid, gid, cid, oid, tid;
        if (data?.other_info?.id) {
            ids['oid'] = data.other_info.id; // other_info_id;
        }
        setStudentBackup({ ids, data }); // backing up data for resets and more.
        data = flattenSchema(data);
        data['id'] = sid;
        setStudent(data); // form data
        return { class_id: cid };
    }
    // 
    async function fetchStudentTransportationAsTitle() {
        let tspRates = await getStudentTransportations(studentId, user?.profile?.school || user?.profile?.id, true, true);
        if (tspRates?.length > 0) {
            let tspFee = tspRates[0];
            tspFee = { fee: tspFee.bus_station__fee, title_id: TRANSPORTATION, title: "transportation" };
            // no need to update title but
            // no need to update title-mappings;
            // update title-rate;
            setTitleRates(state => ({ ...state, [TRANSPORTATION]: tspFee.fee }));
        }
    }
    /**
     * This student's monthly hostel rate, as a postable title.
     *
     * Mirrors `fetchStudentTransportationAsTitle`. The rate is the one on their
     * CURRENT allocation (snapshot at check-in), which is the same number the
     * backend bills as title "hs" — read twice, never computed twice.
     *
     * A school without the hostel module gets a 403 here, which
     * `getAllocations` turns into an empty list, so nothing is set and the
     * hostel row simply never appears. That is the correct outcome, not an
     * error to show.
     */
    async function fetchStudentHostelAsTitle() {
        // Never called for a school without the hostel module — see the effect
        // below. A school that has no hostel must not make a hostel request on
        // every student profile it opens.
        if (!user?.profile?.uses_hostel) return null;
        const allocations = await getAllocations(
            user?.profile?.school || user?.profile?.id,
            { student: studentId }
        );
        const current = allocations?.[0];
        if (current) {
            // All three, so a cashier posting the check-in charges gets the
            // agreed figures pre-filled instead of copying them off the
            // allocation screen.
            setTitleRates(state => ({
                ...state,
                [HOSTEL]: current.monthly_fee,
                [HOSTEL_ADMISSION]: current.admission_fee,
                [HOSTEL_DEPOSIT]: current.security_deposit,
            }));
        }
        return current || null;
    }

    useEffect(() => {
        // this updates : student-details, student-backup, titles, titleMappings, student-discounts
        // everything except above should be cleared!
        (async () => {
            const { class_id } = await fetchStudentDetails();
            const _titles = await fetchFeeTitles(user?.profile?.school || user?.profile?.id, false, class_id);
            // console.log(_titles);
            const titles_and_rates = _titles.reduce((acc, _title) => {
                const key = _title.title__id.toString();
                acc.titles.push({ name: _title.title__title, value: key });
                acc.rates[key] = _title.fee;
                acc.mappings[key] = _title.title__title;
                acc.months[key] = _title.title__months || [];
                return acc;
            }, { titles: [], rates: {}, mappings: {}, months: {} });
            // `hostelTitleOptions` is empty for every school without the
            // module, so their title list is exactly as long as it has always
            // been.
            setTitles([
                ...titles_and_rates.titles,
                OPTION_TRANSPORTATION,
                ...hostelTitleOptions(user?.profile),
                OPTION_OLDDUES,
            ]);
            setTitleRates(titles_and_rates.rates);
            setTitleMonths(titles_and_rates.months);
            // include the special (non fee-title) titles so a discount posted
            // against transportation or OLD DUES still resolves a name in the
            // list, instead of showing a blank Title cell.
            setTitleMappings({
                ...titles_and_rates.mappings,
                [TRANSPORTATION]: "transportation",
                // The hostel LABELS stay in the map unconditionally: a school
                // that had the module and lost it must still be able to read
                // its own historical receipts, and a name map costs nothing —
                // only the OPTIONS above put a row in front of anyone.
                [HOSTEL]: "hostel",
                [HOSTEL_ADMISSION]: "hostel admission",
                [HOSTEL_DEPOSIT]: "hostel deposit",
                [OLD_DUES]: "old dues",
            });
            // Per-student rates, so fetched here rather than arriving with the
            // class's fee titles. No-ops for a school without the module.
            await fetchStudentHostelAsTitle();
            // console.log(tms);
        })();
        (() => {
            // cleaning these everytime new student is selected;
            resetDiscountForm();
            setEditMode(false);
            setEditingTab('');
            resetStudentLedger();
            billingInputs.current = null;
        })();
    }, [studentId]);
    // 
    return (
        <StudentProfileContext.Provider value={{
            data: {
                studentId, student, studentBackup, titles, titleMappings, titleRates,
            },
            methods: { onChange, onReset, onUpdate },
            images: { onImageSaved },
            view: { currentTab, setCurrentTab, editMode, editingTab, handleViewMode, isReadOnly },
            transportation: {
                transportationForm, onTransportationInfoChange,
                transportationServices, setTransportationServices,
                onTransportationEdit, onTransportationServiceEnroll
            },
            discount: {
                discountForm, discounts, onDiscountInfoChange, setDiscounts,
                onDiscountEdit, onDiscountDelete, onDiscountSave, resetDiscountForm, savingDiscount,
                fetchStudentTransportationAsTitle,
                fetchStudentHostelAsTitle
            },
            ledger: {
                studentLedger, onStudentLedgerChange, deleteTitleFromLedger,
                postedLedgers, setPostedLedgers, classHasPostings,
                postedMonthsLoading, getLedgerTabData,
                fillClassFeesForMonths, fillingLedger, savingLedger,
                saveStudentLedger
            }
        }}>
            {children}
        </StudentProfileContext.Provider>
    )
}

function sumLedgerDetails(details) {
    return Object.values(details || {}).reduce((acc, amount) => acc + (amount || 0), 0);
}

const discountCalculations = {
    percentage: (amount, rate) => {
        if (amount && rate) {
            const discountPercentage = (amount / (rate || 1)) * 100;
            return safeDecimal(discountPercentage);
        }
        return '';
    },
    amount: (percentage, rate) => {
        if (percentage && rate) {
            const discountAmount = (percentage / 100 * rate);
            return safeDecimal(discountAmount);
        }
        return ''
    },
}