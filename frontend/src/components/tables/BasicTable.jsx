import { Card, Checkbox, Typography, Dialog, DialogHeader, DialogBody, DialogFooter, IconButton } from "@material-tailwind/react";
import ColumnHeader from "./ColumnHeader";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import ActionButton from "@/components/buttons/ActionButton";
import Cell from "./Cell";
import { useReactToPrint } from "react-to-print";
import ReportHeader from "./ReportHeader";
import Papa from 'papaparse';
import FileSaver from "file-saver";
import Loader from "../Loader";
import { ArrowUpIcon, ArrowDownIcon, ChevronUpDownIcon, MagnifyingGlassIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon, XMarkIcon, PrinterIcon } from "@heroicons/react/24/outline";
import { ColumnsMenu, ExportMenu, ToolButton } from "./TableTools";

// A column of long text wraps past this width rather than widening the table.
const FOLD_CAP = 280;
// A value wider than this may wrap onto a second line before anything folds.
const WRAP_FROM = 200;
// The eye column a folded table gains: its padding and one 32px button.
const VIEW_W = 64;
// A column that holds only numbers lines up on the right, like a ledger -- but
// not one whose numbers are names for something: a phone, a roll number, a
// year, a code, an ID.
const NOT_A_FIGURE = /(phone|contact|mobile|roll|code|year|date|pin|number)|(^|[\s_.-])(no|id)\.?$/i;
const FIGURE = /^-?(\d{1,3}(,\d{2,3})+|\d+)(\.\d+)?$/;
// Many columns are named in lower case ("father name"); a heading starts with
// a capital. Only the first letter: "No. of days" must not become "No. Of Days".
const labelOf = (col) => { const t = String(col?.[1] || col?.[0] || ''); return t.charAt(0).toUpperCase() + t.slice(1); };
// "A, B and C." -- without a second full stop after "Call No."
const listOf = (names) => { const t = names.join(', '); return /[.]$/.test(t) ? t : `${t}.`; };
const isFigure = (v) => typeof v === 'number' || (typeof v === 'string' && FIGURE.test(v.trim()));
// The column a row is about -- a person's or a thing's own name -- reads a step
// darker than the rest. Not a parent's, a class's or a group's name.
const PRIMARY = /name|title|particular/i;
const NOT_PRIMARY = /father|mother|guardian|class|section|group|school|user|parent|spouse/i;

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
    const safeData = useMemo(() => (Array.isArray(data) ? data : []), [data]);
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
    // Responsive: a read-only table folds columns it has no room for (below).
    // Editable tables keep every column (they're forms, not read-only lists).
    const isResponsive = responsive && !editable;
    // A column that is blank on every row -- no contact numbers recorded, no
    // e-mails -- still took its heading's width, and on a wide report four of
    // them were what pushed the table past the page. On screen such a column
    // steps aside and a line under the table names it; print, the exports and
    // the column menu still have it. Only plain columns of a read-only table:
    // a custom cell may draw from other fields, a form table is there to be
    // filled in, and extra rows written by the caller assume every column.
    const isBlankValue = (v) => v === undefined || v === null || (typeof v === 'string' && /^\s*-?\s*$/.test(v));
    const blankKeys = (editable || (extendedRows || []).length > 0 || safeData.length === 0) ? [] :
        gridColumns.filter((c) => !c?.[5] && safeData.every((row) => isBlankValue(row?.[c[0]]))).map((c) => c[0]);
    const blankCls = (col) => (blankKeys.includes(col[0]) ? ' app-col-blank' : '');
    const blankNames = gridColumns.filter((c) => blankKeys.includes(c[0])).map(labelOf);

    // Figures sit on the right; the row's own name reads a step darker.
    const numKeys = editable ? [] : gridColumns.filter((c) => !c?.[5]
        && !NOT_A_FIGURE.test(String(c[0])) && !NOT_A_FIGURE.test(String(c[1] || ''))
        && safeData.some((row) => !isBlankValue(row?.[c[0]]))
        && safeData.every((row) => isBlankValue(row?.[c[0]]) || isFigure(row?.[c[0]]))).map((c) => c[0]);
    const primaryKey = editable ? null : gridColumns.find((c) => {
        const words = `${c[0]} ${c[1] || ''}`;
        return PRIMARY.test(words) && !NOT_PRIMARY.test(words);
    })?.[0];
    const cellCls = (col) => (numKeys.includes(col[0]) ? ' app-col-num' : '') + (col[0] === primaryKey ? ' app-col-primary' : '');

    // ---- fit the card instead of scrolling sideways ----------------------
    // A table wider than its card used to scroll sideways, or, below a fixed
    // breakpoint, drop to two columns however much room there was. Now the
    // table is measured against the width it actually has: when its columns
    // cannot fit, the last ones fold into each row's details (the eye), one
    // at a time, until the rest do. Widen the window and they come back. The
    // first columns (`mobileColumns`, or the first `mobilePriorityCount`)
    // never fold; `wideColumns` fold first. Print, the exports, the search and
    // the column menu still have every column. A form table and one with rows
    // written by its page (`extendedRows`, which assume every column) keep
    // the old sideways scroll.
    const tableRef = useRef(null);
    const [foldCount, setFoldCount] = useState(0);
    const foldable = isResponsive && (extendedRows || []).length === 0 && !isPrinting;
    const keepKeys = Array.isArray(mobileColumns) ? mobileColumns : gridColumns.slice(0, mobilePriorityCount).map((c) => c[0]);
    const foldOrder = (() => {
        if (!foldable) return [];
        const keys = gridColumns.map((c) => c[0]).filter((k) => !keepKeys.includes(k) && !blankKeys.includes(k));
        const wide = Array.isArray(wideColumns) ? wideColumns : [];
        return [...keys.filter((k) => wide.includes(k)).reverse(), ...keys.filter((k) => !wide.includes(k)).reverse()];
    })();
    const foldOrderKey = foldOrder.join('\u0001');
    const foldedKeys = foldOrder.slice(0, foldCount);
    const foldCls = (col) => (foldedKeys.includes(col[0]) ? ' app-col-folded' : '');
    const foldedNames = gridColumns.filter((c) => foldedKeys.includes(c[0])).map(labelOf);

    const measureFold = useCallback(() => {
        const table = tableRef.current;
        const wrap = reportRef.current;
        if (!table || !wrap || !foldOrderKey) { setFoldCount(0); return; }
        const avail = wrap.clientWidth;
        if (!avail) return;
        const cells = Array.from(table.tHead?.rows?.[0]?.cells || []);
        // Each column's width with nothing wrapped, then with everything that
        // can wrap wrapped. A column is given its unwrapped width up to
        // FOLD_CAP and never less than it can shrink to, so a table judged to
        // fit really does.
        const read = (cls) => {
            table.classList.add('app-fold-measure', cls);
            const out = cells.map((th) => th.getBoundingClientRect().width);
            table.classList.remove('app-fold-measure', cls);
            return out;
        };
        const widest = read('app-fold-max');
        const narrowest = read('app-fold-min');
        const widths = {};
        let total = 0;
        cells.forEach((th, i) => {
            if (th.classList.contains('app-col-view')) return;
            // a long value (an address, a remark) may take two lines first
            const easy = widest[i] > WRAP_FROM ? Math.max(WRAP_FROM, widest[i] * 0.6) : widest[i];
            const w = Math.max(narrowest[i], Math.min(easy, FOLD_CAP));
            if (th.dataset.col) widths[th.dataset.col] = w;
            total += w;
        });
        const eyeAlways = rowView && hasDetailColumns;
        if (eyeAlways) total += VIEW_W;
        const order = foldOrderKey.split('\u0001');
        let k = 0;
        while (k < order.length && total + (!eyeAlways && rowView && k > 0 ? VIEW_W : 0) > avail + 1) {
            total -= widths[order[k]] || 0;
            k += 1;
        }
        setFoldCount(k);
    }, [foldOrderKey, rowView, hasDetailColumns]);
    const measureRef = useRef(measureFold);
    measureRef.current = measureFold;
    const hiddenKey = Object.keys(hiddenCols).filter((k) => hiddenCols[k]).join(',');
    useLayoutEffect(() => {
        if (!loading) measureFold();
    }, [measureFold, loading, data, query, sort.col, sort.dir, safePage, hiddenKey]);
    // The card's width changes with the window and with the menu opening or
    // closing; measure again then, once per frame at most.
    useEffect(() => {
        const wrap = reportRef.current;
        if (!wrap || typeof ResizeObserver === 'undefined') return undefined;
        let frame = 0;
        let lastWidth = wrap.clientWidth;
        const observer = new ResizeObserver(() => {
            if (wrap.clientWidth === lastWidth) return;
            lastWidth = wrap.clientWidth;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => measureRef.current());
        });
        observer.observe(wrap);
        return () => { observer.disconnect(); cancelAnimationFrame(frame); };
    }, []);

    // The eye shows when some columns are never drawn, or some are folded.
    const hasHiddenColumns = rowView && (hasDetailColumns || foldedKeys.length > 0);
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
        <Card className={`app-table-card app-tbl ${scroll ? 'h-max md:max-h-screen' : ''} mb-3 bg-transparent`}>
            {hasToolbar &&
            <div className="app-tbl-bar hide-from-print">
                {/* The table's name heads its own card, beside how many rows it
                    holds. The in-table title stays for print (see below). */}
                <div className="app-tbl-heading">
                    {name && <h3 className="app-tbl-name">{name}</h3>}
                    {!editable &&
                        <span className="app-tbl-count" aria-live="polite">
                            {query ? `${totalRows} of ${safeData.length}` : totalRows} {(query ? safeData.length : totalRows) === 1 ? 'row' : 'rows'}
                        </span>}
                </div>
                <div className="app-tbl-bar-tools">
                    {useDataTable && enableSearch && (
                        <div className="app-tbl-search">
                            <MagnifyingGlassIcon className="app-tbl-search-icon" aria-hidden="true" />
                            <input
                                type="search"
                                placeholder="Search in table"
                                // A placeholder is not a name: it vanishes as
                                // soon as the field has content, and several
                                // screen readers never announce it at all. The
                                // table's own name makes it specific, which
                                // matters on the pages that stack two tables.
                                aria-label={name ? `Search in ${name}` : "Search in table"}
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setCurrentPage(1); }}
                            />
                            {query && (
                                <button type="button" aria-label="Clear search" className="app-tbl-search-clear"
                                    onClick={() => { setQuery(''); setCurrentPage(1); }}>
                                    <XMarkIcon aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    )}
                    <div className="app-tbl-bar-actions">
                        {topActions}
                        {columnToggleActive && allColumns.length > 0 &&
                            <ColumnsMenu
                                // a column the grid never draws has nothing to show or hide
                                items={allColumns.filter((col) => !detailKeys.includes(col[0]))
                                    .map((col) => ({ key: col[0], label: labelOf(col), shown: !hiddenCols[col[0]] }))}
                                onToggle={(key) => setHiddenCols((st) => ({ ...st, [key]: !st[key] }))}
                                onShowAll={() => setHiddenCols({})} />
                        }
                        {print && <ToolButton icon={PrinterIcon} onClick={printReport}>Print</ToolButton>}
                        {allowExport && !editable && <ExportMenu onExcel={exportExcel} onCsv={exportTable} />}
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
                    <table ref={tableRef} className={`report-table w-full text-left${dense ? ' report-table-dense' : ''}`}>
                        {/* `cursor-pointer` was on the whole header strip, so
                            every column advertised itself as clickable even
                            when sorting was off or the column was the checkbox.
                            It belongs on the cells that actually sort. */}
                        <thead className="bg-table-header">
                            <tr>
                                {
                                    showSelected && <ColumnHeader columnName={''} className={'app-col-select'} />
                                }
                                {
                                    includeSN && <ColumnHeader columnName={'S.N'} className={'app-col-sn'} />
                                }
                                {
                                    gridColumns?.map((col, i) => {
                                        const isSortable = useDataTable && enableSort;
                                        const isSorted = isSortable && sort.col === col[0];
                                        const colCls = `${foldCls(col)}${blankCls(col)}${cellCls(col)}`;
                                        if (!isSortable) {
                                            return <ColumnHeader key={i} dataCol={col[0]} columnName={labelOf(col)} tooltip={col?.[2]} className={colCls} />;
                                        }
                                        const label = labelOf(col);
                                        return (
                                            // `aria-sort` is what tells a screen reader that this
                                            // column is ordered and which way; without it the sort
                                            // state was carried only by a chevron glyph. The inner
                                            // <button> is what makes the control reachable at all
                                            // by keyboard — a `<th onClick>` is not focusable, so
                                            // sorting was mouse-only on all 89 tables.
                                            <th key={i} data-col={col[0]}
                                                aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                                                className={`app-th-sort${isSorted ? ' is-sorted' : ''}${colCls}`}>
                                                <button type="button" className="app-sort-btn"
                                                    onClick={() => onSortClick(col[0])}
                                                    title={`Sort by ${label}`}>
                                                    {/* No `w-max`: a heading locked on one line set its
                                                        column's width, and on a wide report sixteen such
                                                        columns pushed the table past the page. A heading
                                                        may wrap between words like a plain one. */}
                                                    <span className="app-th-label">{label}</span>
                                                    {isSorted
                                                        ? (sort.dir === 'asc'
                                                            ? <ArrowUpIcon className="app-sort-icon" aria-hidden="true" />
                                                            : <ArrowDownIcon className="app-sort-icon" aria-hidden="true" />)
                                                        : <ChevronUpDownIcon className="app-sort-icon" aria-hidden="true" />}
                                                </button>
                                            </th>
                                        );
                                    })
                                }
                                {hasHiddenColumns &&
                                    <th className="app-col-view hide-from-print"><span className="sr-only">Details</span></th>}
                                {actions && <ColumnHeader hideFromPrint={true} className={'app-col-actions text-center'} columnName={"Actions"} />}
                            </tr >
                        </thead>
                        <tbody className="m-3">
                            {pagedData?.length > 0 &&
                                pagedData.map((item, ri) => {
                                    const isLast = ri === pagedData?.length - 1;
                                    // const classes = isLast ? `py-2.5` : `py-2.5 border-b border-blue-gray-50`;
                                    return (
                                        <tr key={ri}>
                                            {
                                                showSelected &&
                                                <td className="app-col-select">
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
                                                    <td className="app-col-sn">
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
                                                        <td key={ci} className={`${foldCls(col)}${blankCls(col)}${cellCls(col)}`.trim() || undefined}>
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
                                            {/* the row's every column, folded ones included */}
                                            {hasHiddenColumns &&
                                                <td className="app-col-view hide-from-print">
                                                    <button type="button" className="app-row-action app-row-view"
                                                        aria-label={`Details of row ${includeSN ? (paginationActive ? (startIndex + ri + 1) : (useDataTable ? (ri + 1) : ((page - 1) * itemsPerPage + (ri + 1)))) : ri + 1}`}
                                                        title="All details"
                                                        onClick={() => setModalRow({ item, sn: (includeSN ? (paginationActive ? (startIndex + ri + 1) : (useDataTable ? (ri + 1) : ((page - 1) * itemsPerPage + (ri + 1)))) : null) })}>
                                                        <EyeIcon aria-hidden="true" />
                                                    </button>
                                                </td>
                                            }
                                            {/* action-buttons */}
                                            {actions &&
                                                <td className="app-col-actions hide-from-print">
                                                    <div className="app-row-actions">
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
                                    <td colSpan={emptyColSpan}>
                                        {query
                                            ? <>
                                                <p className="app-empty-title">No rows match “{query}”</p>
                                                <p className="app-empty-line">
                                                    {safeData.length} row{safeData.length === 1 ? '' : 's'} in this table, none matching your search.
                                                </p>
                                                <button type="button" onClick={() => setQuery('')} className="app-tbl-btn app-empty-action">
                                                    Clear search
                                                </button>
                                            </>
                                            : <>
                                                <p className="app-empty-title">Nothing here yet</p>
                                                <p className="app-empty-line">
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
                {!loading && (foldedNames.length > 0 || blankNames.length > 0) &&
                    <div className="app-table-note hide-from-print">
                        {foldedNames.length > 0 &&
                            <p>
                                {hasHiddenColumns
                                    ? <>To fit this width, {foldedNames.length === 1 ? 'one column is' : `${foldedNames.length} columns are`} in each row’s details (<EyeIcon className="app-note-icon" aria-label="the eye" />): </>
                                    : <>Hidden to fit this width: </>}
                                <span className="app-note-names">{listOf(foldedNames)}</span>
                            </p>}
                        {blankNames.length > 0 &&
                            <p>Empty on every row, so not shown: <span className="app-note-names">{listOf(blankNames)}</span></p>}
                    </div>}
                <>
                    {footer}
                </>
                {paginationActive && totalRows > pageSize && (
                    <div className="app-table-pager hide-from-print">
                        <span>
                            Showing {totalRows === 0 ? 0 : (startIndex + 1)}–{Math.min(startIndex + pageSize, totalRows)} of {totalRows}
                        </span>
                        <div className="app-table-pager-nav">
                            <button type="button" className="app-tbl-btn app-tbl-btn-icon-only" aria-label="Previous page" disabled={safePage <= 1}
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>
                                <ChevronLeftIcon aria-hidden="true" />
                            </button>
                            <span>Page {safePage} of {totalPages}</span>
                            <button type="button" className="app-tbl-btn app-tbl-btn-icon-only" aria-label="Next page" disabled={safePage >= totalPages}
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>
                                <ChevronRightIcon aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
            {/* Mobile "view all columns" modal. `handler` closes it on an
                outside click / Escape (Material Tailwind fires the backdrop
                click through here). */}
            <Dialog open={!!modalRow} handler={() => setModalRow(null)} size="xs" className="app-detail-dialog">
                <DialogHeader className="app-detail-head">
                    <div className="min-w-0">
                        <p className="app-detail-kicker">{name || 'Details'}{includeSN && modalRow?.sn != null ? ` · row ${modalRow.sn}` : ''}</p>
                        <h2 className="app-detail-title">
                            {(primaryKey && modalRow?.item?.[primaryKey] && typeof modalRow.item[primaryKey] !== 'object')
                                ? modalRow.item[primaryKey] : 'All details'}
                        </h2>
                    </div>
                    <IconButton variant="text" size="sm" aria-label="Close" onClick={() => setModalRow(null)}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>
                <DialogBody className="app-detail-body">
                    <dl className="app-detail-list">
                        {visibleColumns?.map((col, ci) => {
                            const Comp = col?.[5] || Cell;
                            return (
                                <div key={ci} className={`app-detail-row${foldedKeys.includes(col[0]) || detailKeys.includes(col[0]) ? ' is-folded' : ''}`}>
                                    <dt>{labelOf(col)}</dt>
                                    <dd>
                                        {(!col?.[5] && isBlankValue(modalRow?.item?.[col[0]]))
                                            ? <span className="app-detail-empty" aria-label="empty">–</span> :
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
                                        />}
                                    </dd>
                                </div>
                            );
                        })}
                    </dl>
                </DialogBody>
                {actions && modalRow?.item &&
                    <DialogFooter className="app-detail-foot">
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