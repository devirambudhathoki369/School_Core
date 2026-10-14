import { Card, Checkbox, Typography, Button, Dialog, DialogHeader, DialogBody, DialogFooter, IconButton } from "@material-tailwind/react";
import ColumnHeader from "./ColumnHeader";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import ActionButton from "@/components/buttons/ActionButton";
import Cell from "./Cell";
import { useReactToPrint } from "react-to-print";
import ReportHeader from "./ReportHeader";
import Papa from 'papaparse';
import FileSaver from "file-saver";
import Loader from "../Loader";
import { ChevronUpIcon, ChevronDownIcon, MagnifyingGlassIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon, XMarkIcon, ViewColumnsIcon, PrinterIcon, ArrowDownTrayIcon } from "@heroicons/react/24/outline";

// DataTable-style helpers — added so every BasicTable inherits search,
// column sort, and pagination without each call site having to opt in.
function rowMatchesQuery(row, columns, query) {
    if (!query) return true;
    const needle = query.toString().toLowerCase();
    for (const col of columns) {
        const raw = row?.[col[0]];
        if (raw === undefined || raw === null) continue;
        // Render value can be a primitive, an array, or an object (e.g. a
        // {value, ...} cell descriptor). Flatten to a search-friendly string.
        let hay;
        if (Array.isArray(raw)) hay = raw.join(' ');
        else if (typeof raw === 'object') hay = JSON.stringify(raw);
        else hay = String(raw);
        if (hay.toLowerCase().includes(needle)) return true;
    }
    return false;
}

function compareValues(a, b) {
    const aNil = a === undefined || a === null || a === '';
    const bNil = b === undefined || b === null || b === '';
    if (aNil && bNil) return 0;
    if (aNil) return 1;       // nulls last
    if (bNil) return -1;
    const an = Number(a);
    const bn = Number(b);
    if (!Number.isNaN(an) && !Number.isNaN(bn) && a !== '' && b !== '') {
        return an - bn;
    }
    return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

/* 
columns must be a list of 
[
    - name to get value from each item in data, 
    - column/display name,
    - tooltip text
    - highlight column? [bool]
    - layout: Any("horizontal" | "vertical") [ONLY, if value is an array!]
]
*/
function BasicTable({ name, columns, hideHeader = true, editable = false, editableColumns, onChange, onBlur = () => null,
    loading = false, data, actions, onSelect = () => null, header, footer, highLightLast = false,
    includeSN = true, page = 1, scroll = true, itemsPerPage = 10,
    // Export is ON by default for read-only tables — every listing/report can be
    // pulled into Excel/CSV. Editable (form) tables never export; pass
    // allowExport={false} to opt a read-only table out.
    showSelected = true, print = false, allowExport = true, onShortcut = () => null, extendedRows = [], disabled = false,
    // arbitrary node(s) rendered at the top-right of the table toolbar (e.g. an
    // "Add" button). Sits alongside Print/Export and is hidden from print.
    topActions = null,
    // DataTable-style extras. Search + sort default ON so every existing
    // call site inherits them; pass false to opt out (e.g. editable forms
    // where sort would scramble row order). Pagination is OFF by default
    // per user request — tables show every (filtered) row at once.
    dataTable = true, enableSearch = true, enableSort = true, enablePagination = false,
    pageSize = 25,
    // Built-in column show/hide. A "Columns" menu lets the user pick which
    // columns to display; the choice applies to the on-screen table, PRINT, and
    // EXPORT (only shown data is printed/exported). Default ON for read-only
    // tables; automatically skipped for editable (form) tables. Pass
    // columnToggle={false} to opt out (e.g. a table that manages its own toggle).
    columnToggle = true,
    // Responsive behaviour. On large screens (lg+) the full table is shown.
    // On tablets/phones the low-priority columns collapse away and each row
    // gets a "view" (eye) button that opens a modal with every column's value.
    // `mobileColumns` (list of column keys) overrides which columns stay
    // visible on small screens; otherwise the first `mobilePriorityCount`
    // columns are kept. Pass `responsive={false}` to opt out entirely.
    responsive = true, mobileColumns = null, mobilePriorityCount = 2,
    // A record wider than its card. `detailColumns` (list of column keys) are
    // never drawn in the grid, at ANY width: they stay in the search and in the
    // exports, and are read in the row's view instead, so the table fits its
    // card rather than scrolling sideways. The built-in view (the eye column
    // and its modal) then shows on every screen, not just below lg. Pass
    // `rowView={false}` when the table's own actions already open the whole
    // record, so a row does not carry two eyes.
    // `wideColumns` (list of column keys) are drawn from xl up rather than
    // from lg: a small laptop with the menu open has room for fewer columns
    // than a desktop does.
    detailColumns = null, rowView = true, wideColumns = null,
    // A register with more columns than its card is wide at the usual cell
    // padding. `dense` tightens the cells and lets a two-word heading take two
    // lines, so the whole sheet stays in view instead of its last columns
    // sitting off the side. Screen only; paper already lays out to the sheet.
    dense = false }) {
    const [selected, setSelected] = useState('');
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState({ col: null, dir: 'asc' });
    const [currentPage, setCurrentPage] = useState(1);
    // Row currently expanded in the mobile "view all" modal (null = closed).
    const [modalRow, setModalRow] = useState(null);
    // Temporarily disables pagination during a Print invocation so the
    // printout includes every (filtered) row, not just the visible page.
    const [isPrinting, setIsPrinting] = useState(false);
    const reportRef = useRef(null);
    // Column show/hide. `hiddenCols` = { colKey: true } for columns the user
    // has hidden. Active only for read-only tables (never editable forms) when
    // the consumer hasn't opted out. Reset whenever the column SET changes so a
    // new search/report starts with everything visible.
    const [hiddenCols, setHiddenCols] = useState({});
    const [colMenuOpen, setColMenuOpen] = useState(false);
    const columnToggleActive = columnToggle && !editable && (columns?.length > 0);
    const allColumns = Array.isArray(columns) ? columns : [];
    const visibleColumns = columnToggleActive
        ? allColumns.filter((c) => !hiddenCols[c[0]])
        : allColumns;
    const detailKeys = (!editable && Array.isArray(detailColumns)) ? detailColumns : [];
    // What the grid draws. Search, the exports and the view modal keep reading
    // `visibleColumns`, so nothing is lost by a column not being drawn.
    const gridColumns = detailKeys.length > 0
        ? visibleColumns.filter((c) => !detailKeys.includes(c[0]))
        : visibleColumns;
    const hasDetailColumns = gridColumns.length !== visibleColumns.length;
    const columnSetKey = allColumns.map((c) => c[0]).join(',');
    useEffect(() => {
        setHiddenCols({});
    }, [columnSetKey]);

    // If the consumer disables DataTable behaviour or the table is
    // intrinsically index-sensitive (editable rows), skip filtering,
    // sorting, and pagination so the table behaves exactly like before.
    const useDataTable = dataTable && !editable;
    const safeData = Array.isArray(data) ? data : [];
    const filteredData = useMemo(() => {
        if (!useDataTable || !enableSearch || !query) return safeData;
        return safeData.filter(row => rowMatchesQuery(row, columns || [], query));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [safeData, columns, query, useDataTable, enableSearch]);
    const sortedData = useMemo(() => {
        if (!useDataTable || !enableSort || !sort.col) return filteredData;
        const out = [...filteredData];
        out.sort((a, b) => {
            const cmp = compareValues(a?.[sort.col], b?.[sort.col]);
            return sort.dir === 'asc' ? cmp : -cmp;
        });
        return out;
    }, [filteredData, sort, useDataTable, enableSort]);
    const totalRows = sortedData.length;
    const paginationActive = useDataTable && enablePagination && !isPrinting;
    const totalPages = paginationActive
        ? Math.max(1, Math.ceil(totalRows / pageSize))
        : 1;
    const safePage = Math.min(currentPage, totalPages);
    const pagedData = paginationActive
        ? sortedData.slice((safePage - 1) * pageSize, safePage * pageSize)
        : sortedData;
    const startIndex = paginationActive ? (safePage - 1) * pageSize : 0;

    function onSortClick(colKey) {
        if (!useDataTable || !enableSort) return;
        setSort(state => {
            if (state.col !== colKey) return { col: colKey, dir: 'asc' };
            if (state.dir === 'asc') return { col: colKey, dir: 'desc' };
            return { col: null, dir: 'asc' };
        });
        setCurrentPage(1);
    }
    // 
    const printReport = useReactToPrint({
        content: () => reportRef.current,
        onBeforeGetContent: () => new Promise((resolve) => {
            setIsPrinting(true);
            // wait a tick so React can render the un-paginated view
            setTimeout(resolve, 50);
        }),
        onAfterPrint: () => setIsPrinting(false),
    });
    // Export reflects the filtered + sorted view (what's on screen),
    // not the raw `data` prop — that way the user gets exactly the rows
    // they searched/sorted to.
    function exportDataSource() {
        return (useDataTable ? sortedData : (Array.isArray(data) ? data : []));
    }
    // A cell's render value can be a primitive, an array (multi-line cell), or a
    // {value, ...} descriptor. Flatten to something readable — a bare
    // toString() turns descriptors into "[object Object]" in the file.
    function exportValue(raw) {
        if (raw === undefined || raw === null) return '';
        if (Array.isArray(raw)) return raw.filter(v => v !== null && v !== undefined).join(', ');
        if (typeof raw === 'object') {
            const val = raw.value ?? raw.name ?? raw.title ?? raw.text;
            return val !== undefined && val !== null ? val : JSON.stringify(raw);
        }
        return raw;
    }
    function exportTable() {
        const src = exportDataSource();
        const displayCols = visibleColumns.map(col => col[0]);
        const csvHeaders = visibleColumns.map(col => col?.[1] || col[0]);
        const csvRows = src.map(row =>
            displayCols.map(col => exportValue(row?.[col]).toString().replace(/"/g, '""'))
        );
        const csvData = Papa.unparse({ data: csvRows, fields: csvHeaders });
        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        FileSaver.saveAs(blob, `${name}.csv`);
    }
    function exportExcel() {
        const src = exportDataSource();
        const displayCols = visibleColumns.map(col => col[0]);
        const headers = visibleColumns.map(col => col?.[1] || col[0]);
        const xmlEscape = (val) => {
            if (val === undefined || val === null) return '';
            return String(val)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        };
        const cell = (val) => {
            const isNumeric = typeof val === 'number' && !Number.isNaN(val);
            return isNumeric
                ? `<Cell><Data ss:Type="Number">${val}</Data></Cell>`
                : `<Cell><Data ss:Type="String">${xmlEscape(val)}</Data></Cell>`;
        };
        const headerRow = `<Row>${headers.map(h => `<Cell ss:StyleID="sHead"><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`).join('')}</Row>`;
        const bodyRows = src.map(row =>
            `<Row>${displayCols.map(c => cell(exportValue(row?.[c]))).join('')}</Row>`
        ).join('');
        const sheetName = (name || 'Sheet1').toString().replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31);
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="sHead"><Font ss:Bold="1"/><Interior ss:Color="#D9EDE7" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="${xmlEscape(sheetName)}">
  <Table>${headerRow}${bodyRows}</Table>
 </Worksheet>
</Workbook>`;
        const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        FileSaver.saveAs(blob, `${name}.xls`);
    }
    // 
    function isColumnEditable(col) {
        return editableColumns?.some(val => val[0] === col[0]) ?? false;
    }
    // Responsive: decide which columns stay visible on small screens. Editable
    // tables keep every column (they're forms, not read-only lists).
    const isResponsive = responsive && !editable;
    function isPrimaryColumn(col, index) {
        if (!isResponsive) return true;
        if (Array.isArray(mobileColumns)) return mobileColumns.includes(col[0]);
        return index < mobilePriorityCount;
    }
    const hasWideColumns = isResponsive && Array.isArray(wideColumns)
        && gridColumns.some((col, i) => wideColumns.includes(col[0]) && !isPrimaryColumn(col, i));
    // Only bother with the eye/modal column when something is actually hidden.
    const hasHiddenColumns = rowView && (hasDetailColumns
        || (isResponsive && gridColumns.some((col, i) => !isPrimaryColumn(col, i))));
    // The eye is a phone/tablet affordance — unless some columns are never
    // drawn (it stays), or some wait for xl (it stays until then).
    const viewOnlyBelowLg = hasDetailColumns ? '' : (hasWideColumns ? 'xl:hidden' : 'lg:hidden');
    // Utility classes to collapse a low-priority column below the lg breakpoint
    // (below xl for a column that needs a wide screen).
    const collapseCls = (col, i) => {
        if (!isResponsive || isPrimaryColumn(col, i)) return '';
        return (hasWideColumns && wideColumns.includes(col[0])) ? 'hidden xl:table-cell' : 'hidden lg:table-cell';
    };
    // Every column the header actually emits, so the empty-state row spans the
    // full table instead of stopping under the first few columns.
    const emptyColSpan = (showSelected ? 1 : 0) + (includeSN ? 1 : 0)
        + (gridColumns?.length || 0) + (hasHiddenColumns ? 1 : 0) + (actions ? 1 : 0);
    // An editable form table has no search, no column menu and no exports, so
    // its toolbar rendered as an empty strip — a bare band of padding and a
    // border above the title, which read as a rendering fault. Skip the row
    // entirely when nothing would go in it.
    const hasToolbar = !!(
        (useDataTable && enableSearch) || topActions || print ||
        (columnToggleActive && allColumns.length > 0) ||
        (allowExport && !editable)
    );
    //
    // `max-h-screen` is a DESKTOP affordance and must stay one. On a phone the
    // card was capped at 100vh while `.viewc` — the page's scroller — is only
    // 100dvh MINUS the header, so the card was ALWAYS taller than the visible
    // area and its inner `report-table-wrap` swallowed every swipe. Whatever
    // follows the table (the Save tray on the attendance register, Print on the
    // reports) sat below a box the finger could never scroll past, so on a
    // 35-row class the button was effectively gone. Below `md` (720px under
    // withMT) the table takes its natural height and the PAGE scrolls, which
    // puts the actions right after the last row. Horizontal scrolling for wide
    // tables is unaffected — that lives on the wrap, not here.
    return (
        <Card className={`app-table-card ${scroll ? 'h-max md:max-h-screen md:overflow-hidden' : ''} mb-3 bg-transparent`}>
            {hasToolbar &&
            <div className="app-toolbar flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 hide-from-print">
                {/* The table's name heads its own card, beside how many rows it
                    holds. It used to sit BELOW the search box and the export
                    buttons, centred, so every listing opened on a toolbar and
                    the thing you were looking at was the third line down. The
                    in-table title stays for print (see below). */}
                <div className="app-table-heading flex items-center gap-2 min-w-0">
                    {name && <h3 className="app-table-name truncate">{name}</h3>}
                    {!editable &&
                        <span className="app-table-count shrink-0" aria-live="polite">
                            {query ? `${totalRows} of ${safeData.length}` : totalRows} {(query ? safeData.length : totalRows) === 1 ? 'row' : 'rows'}
                        </span>}
                </div>
                <div className="app-toolbar-tools flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                    {useDataTable && enableSearch && (
                        <div className="app-table-search group flex items-center gap-2 w-full sm:w-64 xl:w-72 transition">
                            <MagnifyingGlassIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <input
                                type="search"
                                placeholder="Search in table…"
                                // A placeholder is not a name: it vanishes as
                                // soon as the field has content, and several
                                // screen readers never announce it at all. The
                                // table's own name makes it specific, which
                                // matters on the pages that stack two tables.
                                aria-label={name ? `Search in ${name}` : "Search in table"}
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setCurrentPage(1); }}
                                className="bg-transparent focus:outline-none text-sm w-full placeholder:text-gray-500 placeholder:font-normal text-gray-900"
                            />
                            {query && (
                                <button
                                    type="button"
                                    aria-label="clear search"
                                    onClick={() => { setQuery(''); setCurrentPage(1); }}
                                    className="text-gray-500 hover:text-gray-800 shrink-0 leading-none text-base"
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    )}
                <div className="flex flex-wrap gap-1.5">
                    {topActions}
                    {columnToggleActive && allColumns.length > 0 &&
                        <div className="relative">
                            <Button variant="outlined"
                                aria-expanded={colMenuOpen}
                                className="py-2 px-4 flex items-center gap-1 border-teal-400 text-gray-900"
                                onClick={() => setColMenuOpen(o => !o)}>
                                <ViewColumnsIcon className="h-4 w-4" aria-hidden="true" /> Columns
                            </Button>
                            {colMenuOpen &&
                                <>
                                    {/* click-away backdrop */}
                                    <div className="fixed inset-0 z-40" onClick={() => setColMenuOpen(false)} />
                                    <div className="absolute right-0 z-50 mt-1 w-56 max-h-72 overflow-auto rounded-lg border border-blue-gray-100 bg-white shadow-lg p-2">
                                        <div className="flex items-center justify-between px-1 pb-1 mb-1 border-b border-blue-gray-50">
                                            <span className="text-xs font-semibold text-blue-gray-600">Show columns</span>
                                            <button type="button"
                                                className="text-xs text-teal-700 font-semibold hover:underline"
                                                onClick={() => setHiddenCols({})}>Show all</button>
                                        </div>
                                        {/* a column the grid never draws has nothing to show or hide */}
                                        {allColumns.filter((col) => !detailKeys.includes(col[0])).map((col) => {
                                            const key = col[0];
                                            const checked = !hiddenCols[key];
                                            return (
                                                <label key={key}
                                                    className="flex items-center gap-2 px-1 py-1 rounded hover:bg-teal-50 cursor-pointer">
                                                    <input type="checkbox" checked={checked}
                                                        onChange={() => setHiddenCols(s => ({ ...s, [key]: !s[key] }))} />
                                                    <span className="text-sm text-blue-gray-800 capitalize">{col[1] || col[0]}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </>
                            }
                        </div>
                    }
                    {print &&
                        <Button className="py-3 px-7 bg-teal-300 text-gray-900" onClick={printReport}>
                            <PrinterIcon className="h-4 w-4" aria-hidden="true" /> Print
                        </Button>
                    }
                    {allowExport && !editable &&
                        <>
                            <Button className="py-2 px-7 bg-teal-300 text-gray-900" onClick={exportExcel}>
                                <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" /> Export Excel
                            </Button>
                            <Button className="py-2 px-7 bg-teal-300 text-gray-900" onClick={exportTable}>
                                <ArrowDownTrayIcon className="h-4 w-4" aria-hidden="true" /> Export CSV
                            </Button>
                        </>
                    }
                </div>
                </div>
            </div>
            }
            <div className={`report-table-wrap flex overflow-auto scroll-smooth flex-col`} ref={reportRef}>
                <ReportHeader hidden={hideHeader} />
                <>
                    {/* On screen the toolbar above now carries the name, so
                        this copy is for PAPER — it is inside the printed ref,
                        where it heads the report under the school masthead.
                        A table with no toolbar (an editable form table) has
                        nowhere else to show its name and keeps it on screen. */}
                    {name &&
                        <Typography variant="h5" className={`app-table-title my-2 text-center ${hasToolbar ? 'hidden print:block' : ''}`}>
                            {name}
                        </Typography>
                    }
                    {header}
                </>
                {/* The skeleton is told the real shape of this table, so the
                    silhouette that shows while it loads has the same number of
                    columns as the rows that replace it and the layout does not
                    jump. On Classic `Loader` ignores both and renders the
                    spinner it always did. */}
                {loading ? <Loader variant="table" cols={Math.max(2, (gridColumns?.length || 4) + (includeSN ? 1 : 0))} /> :
                    <table className={`report-table w-full text-left rounded-lg${dense ? ' report-table-dense' : ''}`}>
                        {/* `cursor-pointer` was on the whole header strip, so
                            every column advertised itself as clickable even
                            when sorting was off or the column was the checkbox.
                            It belongs on the cells that actually sort. */}
                        <thead className="uppercase bg-table-header">
                            <tr>
                                {
                                    showSelected && <ColumnHeader columnName={''} className={''} />
                                }
                                {
                                    includeSN && <ColumnHeader columnName={'S.N'} />
                                }
                                {
                                    gridColumns?.map((col, i) => {
                                        const isSortable = useDataTable && enableSort;
                                        const isSorted = isSortable && sort.col === col[0];
                                        const hideCls = collapseCls(col, i);
                                        if (!isSortable) {
                                            return <ColumnHeader key={i} columnName={col[1] || col[0]} tooltip={col?.[2]} className={hideCls} />;
                                        }
                                        const label = col[1] || col[0];
                                        return (
                                            // `aria-sort` is what tells a screen reader that this
                                            // column is ordered and which way; without it the sort
                                            // state was carried only by a chevron glyph. The inner
                                            // <button> is what makes the control reachable at all
                                            // by keyboard — a `<th onClick>` is not focusable, so
                                            // sorting was mouse-only on all 89 tables.
                                            <th key={i}
                                                aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                                className={`py-3 !p-4 select-none ${hideCls}`}>
                                                <button type="button"
                                                    onClick={() => onSortClick(col[0])}
                                                    title={`Sort by ${label}`}
                                                    className="inline-flex items-center gap-1 text-blue-gray-800 font-semibold text-sm opacity-80
                                                        cursor-pointer bg-transparent border-0 p-0 uppercase text-left
                                                        hover:opacity-100 focus-visible:outline-none focus-visible:ring-2
                                                        focus-visible:ring-offset-1 focus-visible:ring-teal-500 rounded">
                                                    <span className="w-max">{label}</span>
                                                    {isSorted ? (
                                                        sort.dir === 'asc'
                                                            ? <ChevronUpIcon className="h-3 w-3" aria-hidden="true" />
                                                            : <ChevronDownIcon className="h-3 w-3" aria-hidden="true" />
                                                    ) : <span className="h-3 w-3 inline-block opacity-30" aria-hidden="true">↕</span>}
                                                </button>
                                            </th>
                                        );
                                    })
                                }
                                {hasHiddenColumns && <ColumnHeader hideFromPrint={true} className={`text-center ${viewOnlyBelowLg}`} columnName={"View"} />}
                                {actions && <ColumnHeader hideFromPrint={true} className={'text-center'} columnName={"Actions"} />}
                            </tr >
                        </thead>
                        <tbody className="m-3">
                            {pagedData?.length > 0 &&
                                pagedData.map((item, ri) => {
                                    const isLast = ri === pagedData?.length - 1;
                                    // const classes = isLast ? `py-2.5` : `py-2.5 border-b border-blue-gray-50`;
                                    return (
                                        <tr key={ri} className={`hover:bg-teal-200 border-b border-sky-300`}>
                                            {
                                                showSelected &&
                                                <td>
                                                    {/* Was announced as a bare
                                                        "checkbox" on every row,
                                                        with nothing to say which
                                                        row it belonged to. */}
                                                    <Checkbox
                                                        aria-label={`Select row ${(includeSN ? (startIndex + ri + 1) : ri + 1)}`}
                                                        onChange={() => {
                                                        setSelected(state => {
                                                            // if has value ? reset : do nothing;
                                                            if (state) return '';
                                                        });
                                                    }} checked={selected === item?.id} />
                                                </td>
                                            }
                                            {/* Serial Number */}
                                            {
                                                (includeSN && !(isLast && highLightLast)) ?
                                                    <td className="text-base">
                                                        {paginationActive
                                                            ? (startIndex + ri + 1)
                                                            : (useDataTable ? (ri + 1) : ((page - 1) * itemsPerPage + (ri + 1)))}
                                                    </td> :
                                                    <>
                                                        {(highLightLast && isLast) && <td></td>}
                                                    </>
                                            }
                                            {/* data */}
                                            {
                                                gridColumns?.map((col, ci) => {
                                                    // const [key:str|int, display-name:str, tooltip:str, highlightCol:bool, layout: (vertical | horizontal), custom-component]=col;
                                                    const Comp = col?.[5] || Cell;
                                                    return (
                                                        <td key={ci} className={`py-2.5 ${collapseCls(col, ci)}`}>
                                                            {
                                                                col ?
                                                                    <Comp
                                                                        index={ri}
                                                                        col={col[0]} // key
                                                                        highLighted={col[3] || (highLightLast && isLast) || item?.highlight}
                                                                        color={item?.color || null}
                                                                        editable={editable && isColumnEditable(col)}
                                                                        data={item?.[col[0]]}
                                                                        item={item}
                                                                        onChange={onChange} onBlur={onBlur}
                                                                        onShortcut={onShortcut}
                                                                        layout={col?.[4] || "horizontal"}
                                                                    /> :
                                                                    <>-</>
                                                            }
                                                        </td>
                                                    )
                                                })
                                            }
                                            {/* view-all (mobile only) */}
                                            {hasHiddenColumns &&
                                                <td className={`${viewOnlyBelowLg} hide-from-print text-center`}>
                                                    <IconButton
                                                        variant="text"
                                                        size="sm"
                                                        aria-label="view all details"
                                                        className="rounded-full text-teal-700 hover:bg-teal-100"
                                                        onClick={() => setModalRow({ item, sn: (includeSN ? (paginationActive ? (startIndex + ri + 1) : (useDataTable ? (ri + 1) : ((page - 1) * itemsPerPage + (ri + 1)))) : null) })}
                                                    >
                                                        <EyeIcon className="h-5 w-5" />
                                                    </IconButton>
                                                </td>
                                            }
                                            {/* action-buttons */}
                                            {actions &&
                                                <td className="hide-from-print">
                                                    <div className="flex justify-center items-start gap-x-1">
                                                        {actions?.map((action, i) => (
                                                            <ActionButton key={i} action={action} item={item} setSelected={setSelected} onSelect={onSelect} disabled={disabled} />
                                                        ))}
                                                    </div>
                                                </td>
                                            }
                                        </tr>
                                    );
                                })
                            }
                            {/* A table with no rows used to render its header and
                                then stop, leaving a heading strip floating over
                                blank canvas. That is worst directly after a
                                search: with no message, a query that matches
                                nothing is indistinguishable from a table that
                                broke. The two cases are told apart here, and the
                                search case offers the way out.

                                This was themed-only. A header strip floating
                                over nothing looks equally broken on Classic,
                                and a search that silently returns nothing is
                                the moment a user most needs to be told which
                                of the two happened. */}
                            {pagedData?.length === 0 && (extendedRows || []).length === 0 && !editable &&
                                <tr className="app-table-empty">
                                    <td colSpan={emptyColSpan} className="px-4 py-10 sm:py-14 text-center">
                                        {query
                                            ? <>
                                                <p className="text-[0.95rem] font-semibold text-blue-gray-800">
                                                    No rows match “{query}”
                                                </p>
                                                <p className="mt-1 text-[0.85rem] text-blue-gray-500">
                                                    {safeData.length} row{safeData.length === 1 ? '' : 's'} in this table, none matching your search.
                                                </p>
                                                <button type="button" onClick={() => setQuery('')}
                                                    className="app-retry-btn mt-3 inline-flex items-center rounded-lg px-3 py-1.5
                                                        text-[0.8rem] font-semibold transition">
                                                    Clear search
                                                </button>
                                            </>
                                            : <>
                                                <p className="text-[0.95rem] font-semibold text-blue-gray-800">
                                                    Nothing here yet
                                                </p>
                                                <p className="mt-1 text-[0.85rem] text-blue-gray-500">
                                                    {name ? `No ${String(name).toLowerCase()} have been recorded for the current selection.`
                                                        : 'No records have been added for the current selection.'}
                                                </p>
                                            </>}
                                    </td>
                                </tr>
                            }
                            {
                                (extendedRows || []).map((e, ei) => (
                                    <Fragment key={ei}>{e}</Fragment>
                                ))
                            }
                        </tbody>
                    </table>
                }
                <>
                    {footer}
                </>
                {paginationActive && totalRows > pageSize && (
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 mt-2 p-2 text-sm hide-from-print">
                        <span className="text-gray-700">
                            Showing {totalRows === 0 ? 0 : (startIndex + 1)}–{Math.min(startIndex + pageSize, totalRows)} of {totalRows}
                        </span>
                        <div className="flex items-center gap-1">
                            <Button size="sm" variant="text" disabled={safePage <= 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
                                <ChevronLeftIcon className="h-4 w-4" />
                            </Button>
                            <span className="px-2">Page {safePage} / {totalPages}</span>
                            <Button size="sm" variant="text" disabled={safePage >= totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
                                <ChevronRightIcon className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
            {/* Mobile "view all columns" modal. `handler` closes it on an
                outside click / Escape (Material Tailwind fires the backdrop
                click through here). */}
            <Dialog open={!!modalRow} handler={() => setModalRow(null)} size="xs" className={viewOnlyBelowLg}>
                <DialogHeader className="flex items-center justify-between pb-2">
                    <Typography variant="h6" color="blue-gray">
                        {name ? `${name} — details` : 'Details'}
                    </Typography>
                    <IconButton variant="text" size="sm" aria-label="close" onClick={() => setModalRow(null)}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>
                <DialogBody className="max-h-[70vh] overflow-y-auto pt-0">
                    <div className="divide-y divide-blue-gray-50">
                        {includeSN && modalRow?.sn != null &&
                            <div className="flex items-start justify-between gap-4 py-2">
                                <span className="text-sm font-semibold text-blue-gray-500 shrink-0">S.N</span>
                                <span className="text-sm text-blue-gray-900 text-right break-words">{modalRow.sn}</span>
                            </div>
                        }
                        {visibleColumns?.map((col, ci) => {
                            const Comp = col?.[5] || Cell;
                            return (
                                <div key={ci} className="flex items-start justify-between gap-4 py-2">
                                    <span className="text-sm font-semibold text-blue-gray-500 shrink-0">{col[1] || col[0]}</span>
                                    <div className="text-sm text-blue-gray-900 text-right break-words min-w-0">
                                        <Comp
                                            index={0}
                                            col={col[0]}
                                            highLighted={col[3] || modalRow?.item?.highlight}
                                            color={modalRow?.item?.color || null}
                                            editable={false}
                                            data={modalRow?.item?.[col[0]]}
                                            item={modalRow?.item}
                                            onChange={() => null} onBlur={() => null}
                                            onShortcut={() => null}
                                            layout={col?.[4] || "horizontal"}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </DialogBody>
                {actions && modalRow?.item &&
                    <DialogFooter className="justify-center gap-x-1 pt-2 border-t border-blue-gray-50">
                        {actions.map((action, i) => (
                            <ActionButton key={i} action={action} item={modalRow.item} setSelected={setSelected} onSelect={onSelect} disabled={disabled} />
                        ))}
                    </DialogFooter>
                }
            </Dialog>
        </Card>
    )
}

BasicTable.propTypes = {
    onSelect: PropTypes.func.isRequired,
    actions: (props, propName, componentName) => {
        if (props['actions'] && !props['onSelect']) {
            return new Error(`prop "onSelect" must be provided before passing prop "${propName}" in "${componentName}"!`);
        }
    },
}

export default BasicTable;