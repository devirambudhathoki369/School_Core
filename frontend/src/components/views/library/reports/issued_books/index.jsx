import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, PaginationSection, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { getCursor, getURL } from "@/methods/pagination";
import { fetchIssuedBooks } from "@/services/functions/library/book";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";

const SEARCH_RESULTS = "search_results";
const searchSchema = { issue_date_start: '', issue_date_end: '' };

function BookIssueReport() {
    const { user: { user } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    const [data, setData] = useState({});
    const { fetching, searching, statusHandler } = useRequestStatus();

    // SEARCH;
    searchSchema['issue_date_start'] = user?.today;
    searchSchema['issue_date_end'] = user?.today;
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    function onSearchChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }
    function onSearchReset() {
        setSearchInput({ ...searchSchema });
        setData(state => ({ ...state, [SEARCH_RESULTS]: null }));
    }
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const res = await fetchIssuedBooks(schoolId, '', '', '', '', '', searchInput);
        setData(state => ({ ...state, [SEARCH_RESULTS]: res }));
        statusHandler.toggleSearching();
    }

    // PAGINATION;
    const [page, setPage] = useState(1);
    async function getData() {
        const nextURL = getURL(data, page - 1, 'next');
        if (!nextURL && getURL(data, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        statusHandler.toggleFetching();
        const cursor = getCursor(nextURL);
        const res = await fetchIssuedBooks(schoolId, '', '', page, cursor);
        setData(state => ({ ...state, [page]: res }));
        statusHandler.toggleFetching();
    }
    // 
    useEffect(() => {
        (async () => {
            if (!data?.[page]) await getData();
        })();
    }, [page]);

    return (
        <>
            <>
                <BasicTable name={"Book Issue Report"}
                    data={data?.[SEARCH_RESULTS] || data?.[page]?.results || []}
                    columns={IssuedBookTableColumns}
                    header={
                        <SearchForm input={searchInput} onChange={onSearchChange}
                            onSearch={onSearch} searching={searching} onReset={onSearchReset} />
                    }
                    loading={fetching} showSelected={false} print={true} />
                <>
                    {!data?.[SEARCH_RESULTS] ?
                        <PaginationSection page={page} setPage={setPage}
                            nextPage={getURL(data, page, 'next')} /> :
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={onSearchReset}>
                                Reset Search Result
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
                    <TextInput input={{ name: 'issue_date_start', label: "Issue Date (From)" }} value={input?.issue_date_start} onChange={onChange} />
                    <TextInput input={{ name: 'issue_date_end', label: "Issue Date (To)" }} value={input?.issue_date_end} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
        </>
    )
}

const IssuedBookTableColumns = [
    // ['id', ""],
    ['accession_no', "Accession No."],
    ['book_name', "Book name"],
    ['borrower', "User"],
    ['issued_date', "Issued Date"],
    ['due_date', "Due Date"],
];

export default BookIssueReport;