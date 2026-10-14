import { useEffect, useState } from "react";
import { Button, Dialog, DialogBody } from "@material-tailwind/react";
import { PlusIcon, XMarkIcon, BookOpenIcon } from "@heroicons/react/24/outline";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, PaginationSection, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { editAction } from "@/components/tables/actions";
import Loader from "@/components/Loader";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { UsingSharedLibraryAlert, isUsingSharedLibrary } from "@/methods/library/isUsingSharedLibrary";
import { getCursor, getURL } from "@/methods/pagination";
import { fetchBooks, fetchBook } from "@/services/functions/library/book";
import { fetchLibraries } from "@/services/functions/library";
import BookForm from "./BookForm";

const SEARCH_RESULTS = "search_results";
// one box, matched against the title OR an accession number
const searchSchema = { search: '' };

/**
 * Accession numbers read as ranges, not as a wall of numbers: a title with 40
 * copies is "1-40", and gaps stay visible ("1-5, 12, 20-22") because a missing
 * number means a copy that is gone.
 */
function formatAccessionNos(nos) {
    const list = (nos || []).filter(n => n !== null && n !== undefined)
        .map(Number).sort((a, b) => a - b);
    if (!list.length) return '';
    const parts = [];
    let start = list[0], prev = list[0];
    for (let i = 1; i <= list.length; i++) {
        const n = list[i];
        if (n === prev + 1) { prev = n; continue; }
        parts.push(start === prev ? `${start}` : `${start}-${prev}`);
        start = prev = n;
    }
    return parts.join(', ');
}

function BooksView() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    if (isUsingSharedLibrary(user)) {
        return <UsingSharedLibraryAlert />;
    }
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [books, setBooks] = useState({});
    const [libraries, setLibraries] = useState([]);
    const { fetching, searching, statusHandler } = useRequestStatus();

    // modal state — null = closed; { book } = editing/adding
    const [modal, setModal] = useState(null);
    const [loadingBook, setLoadingBook] = useState(false);

    // SEARCH
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    function onSearchChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }
    function onSearchReset() {
        setSearchInput({ ...searchSchema });
        setBooks(state => ({ ...state, [SEARCH_RESULTS]: null }));
    }
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const res = await fetchBooks(schoolId, '', '', searchInput);
        setBooks(state => ({ ...state, [SEARCH_RESULTS]: res }));
        statusHandler.toggleSearching();
    }

    // PAGINATION
    const [page, setPage] = useState(1);
    async function getData() {
        const nextURL = getURL(books, page - 1, 'next');
        if (!nextURL && getURL(books, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        statusHandler.toggleFetching();
        const cursor = getCursor(nextURL);
        const res = await fetchBooks(schoolId, page, cursor);
        if (res?.results?.length) setBooks(state => ({ ...state, [page]: res }));
        statusHandler.toggleFetching();
    }

    useEffect(() => {
        (async () => {
            const _libs = await fetchLibraries(schoolId, '', true);
            if (_libs?.length) setLibraries(_libs);
        })();
    }, []);
    useEffect(() => {
        (async () => {
            if (!books?.[page]) await getData();
        })();
    }, [page]);

    // reload the list after an add/edit (drops cached pages + search results)
    async function refresh() {
        setBooks({});
        if (page !== 1) setPage(1);
        else await getData();
    }

    function onAdd() {
        setModal({ book: null });
    }
    async function onEdit(item) {
        setLoadingBook(true);
        setModal({ book: null });
        const full = await fetchBook(schoolId, item.id);
        setLoadingBook(false);
        setModal({ book: full && full.id ? full : { ...item } });
    }
    function closeModal() {
        setModal(null);
    }
    function onSaved(status, msg) {
        updateNotification(status, msg);
        if (status === 200) {
            closeModal();
            refresh();
        }
    }

    const rows = books?.[SEARCH_RESULTS] || books?.[page]?.results || [];
    // Accession numbers arrive as an array of copy ids; the table renders plain
    // values, so collapse them to a readable string up front.
    const tableRows = rows.map(b => ({
        ...b,
        accession_str: formatAccessionNos(b?.accession_nos),
    }));
    const isSearch = !!books?.[SEARCH_RESULTS];

    return (
        <>
            <BooksHeader count={tableRows.length} isSearch={isSearch} onAdd={onAdd} />
            <BasicTable name={"Books"}
                data={tableRows}
                columns={BookListTableColumns}
                mobileColumns={['title', 'accession_str']}
                actions={[editAction]}
                onSelect={(action, _id, item) => { if (action === editAction.action) onEdit(item); }}
                header={
                    <SearchForm input={searchInput} onChange={onSearchChange}
                        onSearch={onSearch} searching={searching} onReset={onSearchReset} />
                }
                loading={fetching} showSelected={false} />

            {!books?.[SEARCH_RESULTS] ?
                <PaginationSection page={page} setPage={setPage}
                    nextPage={getURL(books, page, 'next')} /> :
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onSearchReset}>Reset Search Results</Button>
                </ButtonsSecion>
            }

            <Dialog open={!!modal} handler={closeModal} size="xl"
                className="z-[9999] w-[min(96vw,1200px)] relative max-h-[92vh] overflow-y-auto"
                overlayProps={{ className: "bg-black/50" }} dismiss={{ outsidePress: false }}>
                <Button aria-label="Close" onClick={closeModal} color="gray"
                    className="absolute top-2 right-2 rounded-full p-1 z-20">
                    <XMarkIcon className="h-5 w-5" />
                </Button>
                <DialogBody className="overflow-y-auto">
                    {loadingBook ? <Loader /> : (
                        modal && (
                            <BookForm
                                schoolId={schoolId}
                                today={user?.today}
                                libraries={libraries}
                                initialBook={modal.book}
                                onSaved={onSaved}
                                onCancel={closeModal}
                            />
                        )
                    )}
                </DialogBody>
            </Dialog>
        </>
    );
}

function BooksHeader({ count, isSearch, onAdd }) {
    return (
        <div className="app-pagehead hide-from-print mb-3 rounded-xl bg-white
            border border-[var(--line)] px-4 py-3
            flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0 rounded-lg bg-white/70 p-2 shadow-sm">
                    <BookOpenIcon className="h-6 w-6 text-teal-600" />
                </span>
                <div className="min-w-0">
                    <h2 className="text-lg font-bold text-gray-900 leading-tight truncate">Books</h2>
                    <p className="text-xs text-gray-600">
                        {isSearch
                            ? `${count} matching ${count === 1 ? 'title' : 'titles'}`
                            : `${count} ${count === 1 ? 'title' : 'titles'} on this page`}
                    </p>
                </div>
            </div>
            <Button onClick={onAdd}
                className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-x-1
                    py-2.5 px-5 bg-teal-500 text-white normal-case shadow-sm hover:shadow-md">
                <PlusIcon className="w-4 h-4" /> Add Book
            </Button>
        </div>
    );
}

function SearchForm({ input, onChange, onSearch, searching, onReset }) {
    return (
        <>
            <span></span>
            <form className="hide-from-print my-2" onSubmit={onSearch}>
                <Section>
                    <TextInput input={{ name: 'search', label: "Book Title or Accession No." }}
                        value={input?.search} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
        </>
    );
}

const BookListTableColumns = [
    ['title', "Book name"],
    ['accession_str', "Accession No."],
    ['quantity', "Copies"],
    ['personal_author', "Personal Author"],
    ['place_and_publisher', "Place and Publisher"],
    ['isbn_no', "ISBN"],
    ['edition'],
    ['price', "Price"],
    ['call_no', "Call No."],
];

export default BooksView;
