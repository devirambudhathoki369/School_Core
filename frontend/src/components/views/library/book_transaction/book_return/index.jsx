import Warning from "@/components/Warning";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { selectAction } from "@/components/tables/actions";
import { USER_TYPES } from "@/components/views/library/book_transaction";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { fetchIssuedBooks, renewBookIssue, returnBookIssue } from "@/services/functions/library/book";
import { useEffect, useState } from "react";

const bookIssueRenewSchema = { id: '', school: '', due_date: '', action: 'renew' };
const bookIssueReturnSchema = { id: '', school: '', academic_year: '', returned_date: '', is_lost: false, is_damaged: false, damage_fine: '', action: 'return' };
function BookReturnForm({ userType, selectedUser }) {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [bookIssues, setBookIssues] = useState([]);
    const [selectedRow, setSelectedRow] = useState({});
    const { fetching, statusHandler } = useRequestStatus();

    function onRowSelect(action, id, item) {
        if (action === selectAction.action) {
            onIssueRenewChange({ name: 'id', value: item.id });
            // reset the damage/lost state when a different transaction is picked
            setIssueReturnData(state => ({
                ...state, id: item.id, is_lost: false, is_damaged: false, damage_fine: '',
            }));
            setSelectedRow(item);
        }
    }

    // A return is always dated the day it happens, so today's date — not the
    // issue/due date carried on the row, and not whatever was left in the form
    // from the previous transaction — is what these forms start from. It is
    // re-stamped below whenever the day arrives late (the profile lands after
    // the first paint) or a different transaction is picked.
    const today = user?.today || '';

    // Book Issue Renew
    // A renewal EXTENDS a loan, so it starts from the return date the book
    // already carries — not today. Today is normally earlier than the current
    // return date (a book is renewed before it falls due), so seeding the field
    // with it showed the librarian a date from the past and, on a straight
    // Renew click, moved the due date BACKWARDS.
    bookIssueRenewSchema['school'] = schoolId;
    bookIssueRenewSchema['due_date'] = '';
    const [issueRenewData, setIssueRenewData] = useState({ ...bookIssueRenewSchema });
    const [isRenewing, setIsRenewing] = useState(false);
    function onIssueRenewChange({ name, value }) {
        setIssueRenewData(state => ({ ...state, [name]: value }));
    }
    async function onBookIssueRenew(e) {
        e.preventDefault();
        // BS dates are zero-padded YYYY-MM-DD, so string order is date order
        // (the same comparison canRenew already relies on). A renewal that does
        // not move the return date forward is a shortening of the loan, which is
        // never what the button is for — and it used to be the default.
        const currentDue = selectedRow?.due_date || '';
        const newDue = issueRenewData?.due_date || '';
        if (!newDue) {
            updateNotification(400, "Enter the new return date!");
            return;
        }
        if (currentDue && newDue <= currentDue) {
            updateNotification(400,
                `New return date must be after the current return date (${currentDue})!`);
            return;
        }
        setIsRenewing(true);
        const [status, msg, data] = await renewBookIssue(issueRenewData);
        updateNotification(status, msg);
        setIsRenewing(false);
        if (status === 200) {
            // Show the date the server says it STORED, straight away. The list
            // is refetched below too, but patching the row here means the table
            // can never sit on a stale return date while the librarian is
            // looking at it — which is exactly what made a renewal that had in
            // fact been saved look like it had done nothing.
            const savedDue = data?.due_date;
            if (savedDue) {
                setBookIssues(state => state.map(row =>
                    row.id === issueRenewData.id ? { ...row, due_date: savedDue } : row));
            }
            onSubmissionComplete();
        }
    }

    // Book Issue Return
    bookIssueReturnSchema['school'] = schoolId;
    bookIssueReturnSchema['academic_year'] = year?.academic_year;
    bookIssueReturnSchema['returned_date'] = today;
    const [issueReturnData, setIssueReturnData] = useState({ ...bookIssueReturnSchema });
    const [isReturning, setIsReturning] = useState(false);

    // Keep both date fields pinned to today. `useState` only reads its argument
    // on the first render, so a profile that lands a beat later — or a form left
    // over from the transaction picked before this one — would otherwise leave
    // an old date sitting in the box.
    useEffect(() => {
        if (!today) return;
        setIssueReturnData(state => ({ ...state, returned_date: today }));
    }, [today, selectedRow?.id]);

    // The renew field is cleared for each transaction picked rather than
    // pre-filled: there is no configured loan period to add to the current due
    // date, and any date we could invent here would be wrong for some school.
    // Blank + the current date shown beside the label is honest; a stale date
    // left over from the previous row is not.
    useEffect(() => {
        setIssueRenewData(state => ({ ...state, due_date: '' }));
    }, [selectedRow?.id]);

    // Same story for the ids the return posts against: the fiscal-year context
    // can resolve after this form's first render, and a return that carries a
    // blank academic year is rejected outright.
    useEffect(() => {
        setIssueReturnData(state => ({
            ...state, school: schoolId, academic_year: year?.academic_year,
        }));
        setIssueRenewData(state => ({ ...state, school: schoolId }));
    }, [schoolId, year?.academic_year]);

    function onIssueReturnChange({ name, value }) {
        setIssueReturnData(state => ({ ...state, [name]: value }));
    }
    function onIssueReturnFormCheck(e) {
        const { name } = e.target;
        const next = !issueReturnData?.[name];
        setIssueReturnData(state => {
            const updated = { ...state, [name]: next };
            // prefill the price-based damage/lost charge (editable afterwards):
            // lost -> full price, damaged -> half price, neither -> blank.
            const isLost = name === 'is_lost' ? next : !!updated.is_lost;
            const isDamaged = name === 'is_damaged' ? next : !!updated.is_damaged;
            const price = Number(selectedRow?.price) || 0;
            if (isLost) updated.damage_fine = price;
            else if (isDamaged) updated.damage_fine = Math.floor(price / 2);
            else updated.damage_fine = '';
            return updated;
        });
    }
    async function onBookIssueReturn(e) {
        e.preventDefault();
        setIsReturning(true);
        const [status, msg,] = await returnBookIssue(issueReturnData);
        updateNotification(status, msg);
        setIsReturning(false);
        if (status === 200) onSubmissionComplete();
    }

    function onSubmissionComplete() {
        loadData();
        setSelectedRow({});
    }

    async function loadData() {
        const student_id = userType === USER_TYPES.STUDENT ? selectedUser.id : '';
        const staff_id = userType === USER_TYPES.STAFF ? selectedUser.id : '';
        statusHandler.toggleFetching();
        const data = await fetchIssuedBooks(schoolId, student_id, staff_id);
        // An empty list is an ANSWER — it means every book is back — so it has
        // to replace the rows on screen. Keeping the old ones whenever the
        // refetch came back empty left returned books listed as outstanding.
        // A failed lookup hands back the error payload (an object, not an
        // array); that is not an answer, so it leaves the table alone.
        if (Array.isArray(data)) setBookIssues(data);
        statusHandler.toggleFetching();
    }

    // 
    useEffect(() => {
        (async () => {
            await loadData();
        })();
    }, []);
    // 
    function canRenew(selectedRow) {
        let stat = false;
        if (selectedRow?.due_date && user?.today) {
            stat = user.today <= selectedRow.due_date;
        }
        return true;
        return stat;
    }

    return (
        <div className="mb-2">
            <BasicTable name={"Book Issue Transactions"} columns={IssuedBooksColumns} data={bookIssues} loading={fetching}
                actions={[selectAction]} onSelect={onRowSelect} header={
                    <span className="my-1 text-base capitalize">Borrowed by : &nbsp;
                        <span className="font-semibold underline">{selectedUser.name}</span>
                    </span>
                } />
            {selectedRow?.id ?
                <>
                    {/* ----- renew form */}
                    <form onSubmit={onBookIssueRenew}>
                        <Section title={"Renew Book Issue"}
                            description={`Accession No. ${selectedRow.accession_no}${selectedRow.due_date ? ` — current return date ${selectedRow.due_date}` : ''}`}>
                            <TextInput input={{ name: 'due_date', label: "New Return Date", readOnly: !canRenew(selectedRow) }}
                                info={selectedRow?.due_date ? `Must be after ${selectedRow.due_date}` : ''}
                                value={issueRenewData?.due_date} onChange={onIssueRenewChange} />
                        </Section>
                        <ButtonsSecion>
                            <FormSaveButton custom={[isRenewing, "Renew Book", "Renewing..."]} disabled={isRenewing || !canRenew(selectedRow)} />
                        </ButtonsSecion>
                    </form>

                    {/* ----- return form */}
                    <form onSubmit={onBookIssueReturn}>
                        <Section title={"Return Book Issue"} description={`Accession No. ${selectedRow.accession_no}`}>
                            <TextInput input={{ name: 'returned_date', label: "Return Date", readOnly: true }} value={issueReturnData?.returned_date} onChange={onIssueReturnChange} />
                            <Checkbox name={"is_damaged"} text={"Is Book Damaged?"} checked={issueReturnData?.is_damaged}
                                onClick={onIssueReturnFormCheck} />
                            <Checkbox name={"is_lost"} text={"Is Book Lost?"} checked={issueReturnData?.is_lost}
                                onClick={onIssueReturnFormCheck} />
                            {(issueReturnData?.is_lost || issueReturnData?.is_damaged) &&
                                <TextInput input={{
                                    name: 'damage_fine', type: 'number',
                                    label: `Damage/Lost Charge${selectedRow?.price ? ` (book price: ${selectedRow.price})` : ''}`,
                                }} value={issueReturnData?.damage_fine} onChange={onIssueReturnChange} />}
                        </Section>
                        <ButtonsSecion>
                            <FormSaveButton custom={[isReturning, "Return Book", "Returning..."]} disabled={false} />
                        </ButtonsSecion>
                    </form>
                </> :
                <Warning warning={"Select any book issue transaction!"} />
            }
        </div>
    )
}

const IssuedBooksColumns = [
    ['accession_no', "Accession No."],
    ['book_name', "Book Title"],
    ['issued_date', "Issued Date"],
    ['due_date', "Return Date"],
];

export default BookReturnForm;