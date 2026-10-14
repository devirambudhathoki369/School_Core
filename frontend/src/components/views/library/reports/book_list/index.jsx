import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, PaginationSection, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { UsingSharedLibraryAlert, isUsingSharedLibrary } from "@/methods/library/isUsingSharedLibrary";
import { getCursor, getURL } from "@/methods/pagination";
import { fetchBooks } from "@/services/functions/library/book";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";

const SEARCH_RESULTS = "search_results";
const searchSchema = { title: '' };

function BookList() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    // 
    if (isUsingSharedLibrary(user)) {
        return <UsingSharedLibraryAlert />
    }
    // 
    const schoolId = user?.profile?.school || user?.profile?.id;
    const [books, setBooks] = useState({});
    const { fetching, searching, statusHandler } = useRequestStatus();

    // SEARCH;
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

    // PAGINATION;
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
        else updateNotification(404, "Books Not Found!");
        statusHandler.toggleFetching();
    }
    // 
    useEffect(() => {
        (async () => {
            if (!books?.[page]) await getData();
        })();
    }, [page]);

    return (
        <>
            <>
                <BasicTable name={"Books"}
                    data={books?.[SEARCH_RESULTS] || books?.[page]?.results || []} columns={BookListTableColumns}
                    header={
                        <SearchForm input={searchInput} onChange={onSearchChange}
                            onSearch={onSearch} searching={searching} onReset={onSearchReset} />
                    }
                    loading={fetching} />
                <>
                    {!books?.[SEARCH_RESULTS] ?
                        <PaginationSection page={page} setPage={setPage}
                            nextPage={getURL(books, page, 'next')} /> :
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={onSearchReset}>
                                Reset Search Results
                            </Button>
                        </ButtonsSecion>
                    }
                </>
            </>
        </>
    )
}

function SearchForm({ input, onChange, onSearch, searching, onReset }) {
    return (
        <>
            <span></span>
            <form className="hide-from-print my-2" onSubmit={onSearch}>
                <Section>
                    <TextInput input={{ name: 'title', label: "Book Title" }} value={input?.title} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
        </>
    )
}

const BookListTableColumns = [
    // ['id', "Accession No."],
    ['title', "Book name"],
    ['personal_author', "Personal Author"],
    ['place_and_publisher', "Place and Publisher"],
    ['isbn_no', "ISBN"],
    ['edition'],
    ['quantity'],
    ['call_no', "Call No."],
];

export default BookList;