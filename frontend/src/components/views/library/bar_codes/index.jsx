import Warning from "@/components/Warning";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { UsingSharedLibraryAlert, isUsingSharedLibrary } from "@/methods/library/isUsingSharedLibrary";
import { fetchBooks } from "@/services/functions/library/book";
import { Button } from "@material-tailwind/react";
import { Fragment, useEffect, useRef, useState } from "react";
import JsBarcode from 'jsbarcode';
import { useReactToPrint } from "react-to-print";

const searchSchema = { title: '' };
const rangeSchema = { accession_from: '', accession_to: '' };
const filtersSchema = { show_hide_table: true, select_all_books: false };
// Each barcode is a canvas rendered to a PNG data URL and held in memory, so a
// careless range ("1 to 99999") would lock the tab up rather than print.
const MAX_BAR_CODES = 2000;
function BarCodesPrintView() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    // 
    if (isUsingSharedLibrary(user)) {
        return <UsingSharedLibraryAlert />;
    }
    // 
    const schoolId = user?.profile?.school || user?.profile?.id;
    const [input, setInput] = useState({ ...searchSchema });
    const [range, setRange] = useState({ ...rangeSchema });
    const [books, setBooks] = useState([]);
    const [selectedBooks, setSelectedBooks] = useState([]);
    const [filters, setFilters] = useState({ ...filtersSchema });
    const [preparing, setPreparing] = useState(false);
    const [barCodes, setBarCodes] = useState([]);
    const { searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }
    function onFiltersChange(e) {
        const { name } = e.target;
        setFilters(state => ({ ...state, [name]: !!!filters?.[name] }));
    }
    async function onSearch(e) {
        e.preventDefault();
        setSelectedBooks([]);
        setBooks([]);
        setBarCodes([]);
        // 
        statusHandler.toggleSearching();
        const res = await fetchBooks(schoolId, '', '', input);
        if (res?.length) setBooks(res);
        else {
            updateNotification(404, "Books not found!");
        };
        statusHandler.toggleSearching();
    }
    // 
    function onSelect(bookId) {
        setSelectedBooks(prevArray => {
            if (prevArray.includes(bookId)) {
                return prevArray.filter(id => id !== bookId);
            } else {
                return [...prevArray, bookId];
            }
        });
    }
    useEffect(() => {
        let _allBooks = []
        if (filters?.select_all_books) {
            _allBooks = books.map(e => e.id);
        } else {
            _allBooks = [];
        }
        setSelectedBooks(_allBooks);
    }, [filters.select_all_books]);
    // 
    /**
     * Both routes into a barcode sheet — a hand-picked set of titles, or a run
     * of accession numbers — end up here; only the lookup differs.
     */
    async function buildBarCodes(params) {
        setPreparing(true);
        const res = await fetchBooks(schoolId, '', '', { ...params, barcode: true });
        if (!res?.length) {
            updateNotification(404, "Not found!");
        } else if (res.length > MAX_BAR_CODES) {
            updateNotification(400,
                `That covers ${res.length} copies — more than ${MAX_BAR_CODES} at once. Print it in smaller runs.`);
        } else {
            const _barCodes = res.reduce((acc, { book__title: title, id: accession_no }) => {
                const canvas = document.createElement("canvas");
                JsBarcode(canvas,
                    accession_no,
                    { format: "CODE128", width: 1.5, height: 20, displayValue: false, margin: 0 }
                );
                const url = canvas.toDataURL("image/png");
                acc.push({ title, accession_no, url });
                return acc;
            }, []);
            setBarCodes(_barCodes);
        }
        setPreparing(false);
    }

    async function prepareBarCodes(e) {
        e.preventDefault();
        if (!selectedBooks?.length) {
            updateNotification(400, "Invalid request! No books selected!");
            return;
        }
        await buildBarCodes({ selectedBooks });
    }

    function onRangeChange({ name, value }) {
        // accession numbers are plain ids — keep the boxes numeric
        setRange(state => ({ ...state, [name]: value.replace(/\D/g, '') }));
    }
    async function prepareBarCodesByRange(e) {
        e.preventDefault();
        const from = parseInt(range?.accession_from, 10);
        const to = parseInt(range?.accession_to, 10);
        if (!(from > 0) || !(to > 0)) {
            updateNotification(400, "Enter both accession numbers — from and to.");
            return;
        }
        setBarCodes([]);
        await buildBarCodes({ accession_from: Math.min(from, to), accession_to: Math.max(from, to) });
    }
    //
    function onReset() {
        setInput({ ...searchSchema });
        statusHandler.toggleSearching(false);
        setPreparing(false);
    }
    function onRangeReset() {
        setRange({ ...rangeSchema });
        setPreparing(false);
    }
    function onClose() {
        onReset();
        onRangeReset();
        setBooks([]);
        setSelectedBooks([]);
        setBarCodes([]);
    }
    // 
    const printRef = useRef(null);
    const printBarCodes = useReactToPrint({
        content: () => printRef.current
    });

    return (
        <div className="my-2">
            <SearchForm input={input} onChange={onChange} onSearch={onSearch} searching={searching} onReset={onReset} />
            <AccessionRangeForm range={range} onChange={onRangeChange}
                onSubmit={prepareBarCodesByRange} preparing={preparing} onReset={onRangeReset} />
            {books?.length ?
                <form onSubmit={prepareBarCodes}>
                    <span className="my-2 text-base font-semibold">Selected books : {selectedBooks.length}</span>
                    <>
                        <Checkbox name={"show_hide_table"} text={"Show/Hide book selection table"} checked={filters?.show_hide_table}
                            onClick={onFiltersChange} />
                        <Checkbox name={"select_all_books"} text={"Select all books"} checked={filters?.select_all_books}
                            onClick={onFiltersChange} />
                    </>
                    {filters?.show_hide_table &&
                        <BookSelectionView books={books} onSelect={onSelect} selectedBooks={selectedBooks?.length ? selectedBooks : []} />
                    }
                    <ButtonsSecion>
                        <FormSaveButton custom={[preparing, "Prepare", "Preparing..."]} disabled={preparing} />
                    </ButtonsSecion>
                </form>
                : null
            }
            {/* The sheet stands on its own: a range needs no title search behind it. */}
            {barCodes?.length ?
                <>
                    <div className="grid grid-cols-6 gap-4" ref={printRef}>
                        {
                            barCodes.map((barcode) => (
                                <span className="flex flex-col items-center justify-center" key={barcode.accession_no}>
                                    <span className="capitalize text-[0.6rem]">{barcode.title}</span>
                                    <img src={barcode.url} alt={barcode.accession_no} className="w-4/5" />
                                    <span className="text-xs">Accession No.: {barcode.accession_no}</span>
                                </span>
                            ))
                        }
                    </div>
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={onClose} disabled={searching || preparing}>Close</Button>
                        <Button variant="outlined" onClick={printBarCodes} disabled={searching || preparing}>Print</Button>
                    </ButtonsSecion>
                </>
                : books?.length
                    ? <Warning warning={"No barcode found!"} />
                    : <Warning warning={"Search books by title, or give an accession-number range above."} />
            }
        </div>
    )
}

function SearchForm({ input, onChange, onSearch, searching, onReset }) {
    return (
        <>
            <span></span>
            <form className="hide-from-print my-2" onSubmit={onSearch}>
                <Section title={"Search"} description={"Search books by title or just click search button!"}>
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

/**
 * Barcodes for a straight run of accession numbers. Copies are labelled in the
 * order they were accessioned, so a new consignment is almost always one
 * unbroken run — reaching it by title, then by title's copies, is busywork.
 * Numbers outside this library are simply skipped.
 */
function AccessionRangeForm({ range, onChange, onSubmit, preparing, onReset }) {
    return (
        <form className="hide-from-print my-2" onSubmit={onSubmit}>
            <Section title={"Accession No. range"}
                description={"Print every copy between two accession numbers — no title search needed."}>
                <TextInput input={{ name: 'accession_from', label: "Accession No. From" }}
                    value={range?.accession_from} onChange={onChange} />
                <TextInput input={{ name: 'accession_to', label: "Accession No. To" }}
                    value={range?.accession_to} onChange={onChange} />
            </Section>
            <ButtonsSecion>
                <Button variant="outlined" onClick={onReset} disabled={preparing}>Reset</Button>
                <FormSaveButton custom={[preparing, "Prepare", "Preparing..."]} disabled={preparing} />
            </ButtonsSecion>
        </form>
    )
}

function BookSelectionView({ books, onSelect, selectedBooks = [] }) {
    const classes = {
        grid: 'grid grid-cols-8 gap-x-5 justify-between items-start border-b text-center border-blue-gray-100'
    }
    return (
        <>
            <div className={`${classes.grid} font-semibold pb-2 bg-table-header`}>
                <span className="col-span-2">Book Name</span>
                <span>Personal Author</span>
                <span className="w-max">Place and Publisher</span>
                <span>ISBN</span>
                <span>Edition</span>
                <span>Quantity</span>
                <span>Call No.</span>
            </div>
            <div className={`grid grid-cols-8 justify-between w-full items-center`}>
                {books.map(book => (
                    <Fragment key={book.id}>
                        <span className="w-full col-span-2 uppercase flex items-center justify-start">
                            <Checkbox name={"on_select"}
                                checked={selectedBooks.includes(book.id)}
                                onClick={() => {
                                    onSelect(book.id);
                                }}
                            />
                            <span className="w-full">{book.title}</span>
                        </span>
                        <span>{book.personal_author || ''}</span>
                        <span>{book.place_and_publisher || ''}</span>
                        <span>{book.isbn || ''}</span>
                        <span>{book.edition || ''}</span>
                        <span>{book.quantity || ''}</span>
                        <span>{book.call_no || ''}</span>
                    </Fragment>
                ))}
            </div>
        </>
    )
}

export default BarCodesPrintView;