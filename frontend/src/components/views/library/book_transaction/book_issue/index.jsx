import Warning from "@/components/Warning";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { selectAction } from "@/components/tables/actions";
import { USER_TYPES } from "@/components/views/library/book_transaction";
import BookSearchForm from "@/components/views/library/book_transaction/BookSearchForm";
import Users from "@/configs/Users";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { bookIssueSchema } from "@/schemas/library/book";
import { issueBook, searchBook } from "@/services/functions/library/book";
import { Button, Textarea } from "@material-tailwind/react";
import { useState } from "react";

function BookIssueForm({ userType, selectedUser }) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    bookIssueSchema['school'] = schoolId;
    bookIssueSchema['issued_date'] = user?.today;
    bookIssueSchema['due_date'] = user?.today;
    const [books, setBooks] = useState([]);
    const [bookIssueData, setBookIssueData] = useState({ ...bookIssueSchema });
    const [extraInfo, setExtraInfo] = useState({});
    const { searching, uploading, statusHandler } = useRequestStatus();

    async function onBookSearch(e, searchInput) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const [status, msg, data] = await searchBook(searchInput);
        if (data?.length) setBooks(data);
        else updateNotification(status, msg);
        statusHandler.toggleSearching();
    }

    function onChange({ name, value }) {
        setBookIssueData(state => ({ ...state, [name]: value }));
    }

    function prepareBookIssueData(book) {
        const data = {
            ...bookIssueSchema,
            ...(userType === USER_TYPES.STUDENT ? { student: selectedUser.id } : { staff: selectedUser.id }),
            // name: selectedUser.name,
            book: book.id,
        }
        setBookIssueData(data);
        setExtraInfo({
            username: selectedUser.name,
            booktitle: book.title,
        });
    }

    async function onBookIssue(e) {
        e.preventDefault();
        if (!(bookIssueData?.student || bookIssueData?.staff)) {
            updateNotification(400, "Invalid Data!");
            return;
        }
        statusHandler.toggleUploading();
        const [status, msg,] = await issueBook(bookIssueData);
        updateNotification(status, msg);
        if (status === 200) onReset();
        statusHandler.toggleUploading();
    }

    function onReset() {
        setBookIssueData(null);
        setExtraInfo({});
    }

    return (
        <div className="flex flex-col">
            <BookSearchForm user={user} onSearch={onBookSearch} />
            <BasicTable name={"Issue Book"} data={books} columns={BookTableColumns} loading={searching}
                actions={[selectAction]} onSelect={(action, id, item) => {
                    prepareBookIssueData(item);
                }} includeSN={false} />
            <>
                {
                    bookIssueData?.book ?
                        <>
                            <form onSubmit={onBookIssue}>
                                <Section title={`Borrower: ${extraInfo?.username} (Book: ${extraInfo?.booktitle})`}>
                                    <TextInput input={{ name: 'issued_date', label: "Date of Issue", readOnly: true }} value={bookIssueData?.issued_date} onChange={onChange} />
                                    <TextInput input={{ name: 'due_date', label: "Return Date" }} value={bookIssueData?.due_date} onChange={onChange} />
                                    <div className="sm:col-span-4">
                                        <Textarea value={bookIssueData?.remarks || ''} name="remarks" label="Remarks"
                                            onChange={(e) => {
                                                const { name, value } = e.target;
                                                onChange({ name, value });
                                            }} />
                                    </div>
                                </Section>
                                <ButtonsSecion>
                                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                                    <Button variant="text" type="submit" className="px-3 !bg-teal-300">{uploading ? "Issuing" : "Issue Book"}</Button>
                                </ButtonsSecion>
                            </form>
                        </> :
                        <Warning warning={"Book not selected yet!"} />
                }
            </>
        </div>
    )
}

const BookTableColumns = [
    ['id', "Accession No."],
    ['b_title', "Book Title"],
    ['b_isbn', "ISBN"],
    ['b_edition', "Edition"],
];

export default BookIssueForm;