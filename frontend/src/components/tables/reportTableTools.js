import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import FileSaver from "file-saver";
import Papa from "papaparse";

/*
Column show/hide + Excel/CSV export for the hand-rolled report tables (balance
sheet, trial balance, profit & loss, cash flow, income plan …). Those reports
are not BasicTable — each one paints its own <table> with colSpan/rowSpan — so
instead of a column config they are driven straight off the rendered DOM:

  - columns are derived from the <thead> (a colSpan/rowSpan-aware grid walk, so
    "Opening → Debit" becomes one label),
  - hiding sets `display:none` on every cell of that column and shrinks the
    colSpan of the cells that straddle it (totals rows), re-applied after every
    render so React re-renders can't undo it,
  - print inherits it for free (react-to-print clones the live DOM),
  - export reads the same grid, so the file matches what's on screen.
*/

const COLSPAN_ATTR = "data-rtt-colspan";

/* Forget every remembered span so the next walk re-reads what the report
   actually authored. Must be called whenever the report re-renders with a
   different set of cells — otherwise a cell reused by React keeps the span it
   had under the OLD options and gets forced back to that width. */
function resetSpanCache(root) {
    root.querySelectorAll(`[${COLSPAN_ATTR}]`)
        .forEach(cell => cell.removeAttribute(COLSPAN_ATTR));
}

/* Shape of the rendered tables, derived WITHOUT the span cache: how many cells
   each row actually has. Hiding a column only sets `display:none`, so this is
   stable while the user toggles columns, and changes exactly when the report
   itself re-renders with more or fewer cells (e.g. "Show/Hide Grade"). */
function structureSignature(root) {
    return Array.from(root.querySelectorAll("table"))
        .map(table => Array.from(table.rows).map(row => row.cells.length).join(","))
        .join("|");
}

function isCell(el) {
    return el.tagName === "TH" || el.tagName === "TD";
}

function rowCells(row) {
    return Array.from(row.children).filter(isCell);
}

/* Rows of a table, tagged with the section they live in. Tolerates the
   malformed `<thead><th/><th/></thead>` a few reports render (no <tr>) by
   treating the section itself as a single row. */
function tableRows(table) {
    const out = [];
    Array.from(table.children).forEach(section => {
        const tag = section.tagName;
        if (tag === "TR") {
            out.push({ row: section, head: false });
            return;
        }
        if (tag !== "THEAD" && tag !== "TBODY" && tag !== "TFOOT") return;
        const head = tag === "THEAD";
        const rows = Array.from(section.children).filter(el => el.tagName === "TR");
        if (rows.length) rows.forEach(row => out.push({ row, head }));
        else if (rowCells(section).length) out.push({ row: section, head });
    });
    return out;
}

/* The cell's colSpan as the report authored it — remembered on the node so
   re-applying a narrower span never compounds. */
function baseColSpan(cell) {
    const saved = cell.getAttribute(COLSPAN_ATTR);
    if (saved !== null) return parseInt(saved, 10) || 1;
    const span = cell.colSpan || 1;
    cell.setAttribute(COLSPAN_ATTR, String(span));
    return span;
}

/* Walks the table into a grid: every cell paired with the column indexes it
   occupies, honouring colSpan and rowSpan. */
function mapTable(table) {
    const spanLeft = [];
    const rows = [];
    let colCount = 0;
    tableRows(table).forEach(({ row, head }) => {
        const mapped = [];
        let c = 0;
        rowCells(row).forEach(cell => {
            while (spanLeft[c] > 0) c++;
            const cs = baseColSpan(cell);
            const rs = cell.rowSpan || 1;
            const cols = [];
            for (let j = 0; j < cs; j++) {
                cols.push(c + j);
                spanLeft[c + j] = rs;
            }
            mapped.push({ cell, cols });
            c += cs;
        });
        colCount = Math.max(colCount, c);
        rows.push({ head, cells: mapped });
        for (let i = 0; i < spanLeft.length; i++) {
            if (spanLeft[i] > 0) spanLeft[i] -= 1;
        }
    });
    return { rows, colCount };
}

function cellText(cell) {
    return (cell.innerText || cell.textContent || "").replace(/\s+/g, " ").trim();
}

/* One label per column, built from the header rows covering it. */
function columnLabels(table) {
    const { rows, colCount } = mapTable(table);
    const heads = rows.filter(r => r.head);
    const labels = [];
    for (let c = 0; c < colCount; c++) {
        const parts = [];
        heads.forEach(({ cells }) => {
            const hit = cells.find(({ cols }) => cols.includes(c));
            if (!hit) return;
            const text = cellText(hit.cell);
            if (text && parts[parts.length - 1] !== text) parts.push(text);
        });
        labels.push(parts.join(" ") || `Column ${c + 1}`);
    }
    // Reports repeat header names across sides (a balance sheet has four
    // "Amount" columns) — number the repeats so the menu stays unambiguous.
    const seen = {};
    return labels.map(label => {
        seen[label] = (seen[label] || 0) + 1;
        return seen[label] > 1 ? `${label} (${seen[label]})` : label;
    });
}

function applyHidden(table, hidden) {
    const { rows } = mapTable(table);
    rows.forEach(({ cells }) => {
        cells.forEach(({ cell, cols }) => {
            const shown = cols.filter(c => !hidden.includes(c));
            if (!shown.length) {
                cell.style.display = "none";
                return;
            }
            cell.style.display = "";
            cell.colSpan = shown.length;
        });
    });
}

/* Rows of visible text, one entry per visible column — the export view. */
function tableMatrix(table, hidden) {
    const { rows, colCount } = mapTable(table);
    return rows.map(({ cells }) => {
        const line = new Array(colCount).fill("");
        cells.forEach(({ cell, cols }) => {
            // A cell straddling several columns (a totals row's label) keeps its
            // text as long as ONE of them is still shown.
            const anchor = cols.find(c => !hidden.includes(c));
            if (anchor === undefined) return;
            line[anchor] = cellText(cell);
        });
        return line.filter((_, i) => !hidden.includes(i));
    });
}

function xmlEscape(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const NUMERIC = /^-?[\d,]+(\.\d+)?$/;

function sheetCell(value, bold) {
    const style = bold ? ` ss:StyleID="sHead"` : "";
    if (value !== "" && NUMERIC.test(value)) {
        return `<Cell${style}><Data ss:Type="Number">${value.replace(/,/g, "")}</Data></Cell>`;
    }
    return `<Cell${style}><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}

function buildWorkbook(name, matrices, titles) {
    const rows = [];
    (titles || []).filter(Boolean).forEach(title => {
        rows.push(`<Row>${sheetCell(String(title), true)}</Row>`);
    });
    matrices.forEach((matrix, mi) => {
        if (mi > 0) rows.push("<Row></Row>");
        matrix.forEach((line, li) => {
            const bold = li === 0;
            rows.push(`<Row>${line.map(v => sheetCell(v, bold)).join("")}</Row>`);
        });
    });
    const sheetName = (name || "Report").toString().replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="sHead"><Font ss:Bold="1"/><Interior ss:Color="#D9EDE7" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="${xmlEscape(sheetName)}">
  <Table>${rows.join("")}</Table>
 </Worksheet>
</Workbook>`;
}

/**
 * Column show/hide + export for a report rendered inside `reportRef`.
 *
 * @param reportRef ref to the printable report container (holds the table[s]).
 * @param name      report name — export file name + first row of the sheet.
 * @param titles    extra caption lines to write above the data (e.g. date range).
 */
export default function useReportTableTools(reportRef, { name = "Report", titles = [] } = {}) {
    const [columns, setColumns] = useState([]);
    const [hidden, setHidden] = useState([]);
    const signature = useRef("");

    // Re-read the header after every render: the report re-paints on each new
    // search, and its column set can change with the on-screen options
    // (e.g. Trial Balance's "Show Detailed", a result's "Show/Hide Grade").
    //
    // Keyed on the tables' CELL COUNTS rather than on the header labels. The
    // labels are derived through the span cache, so a stale cache produced a
    // stale signature and the cache was never invalidated — a report that
    // re-rendered with narrower groups got its old, wider colSpans written back
    // over React's correct ones, tearing the header away from the body.
    // Runs BEFORE paint, and re-asserts hiding after every render so a React
    // update can't restore a column the user hid. Detection and re-application
    // have to live in the same pre-paint pass: a layout effect runs before a
    // passive one, so detecting the change afterwards would let one corrupted
    // frame be written (and then cached as if the report had authored it).
    useLayoutEffect(() => {
        const root = reportRef?.current;
        if (!root) return;
        let active = hidden;
        const next = structureSignature(root);
        if (next !== signature.current) {
            signature.current = next;
            // The authored spans have changed — drop what we remembered before
            // reading them, or the new layout is measured with the old numbers.
            resetSpanCache(root);
            const table = root.querySelector("table");
            setColumns(table ? columnLabels(table) : []);
            // A column index means nothing once the column set changes.
            setHidden([]);
            active = [];
        }
        root.querySelectorAll("table").forEach(table => applyHidden(table, active));
    });

    const toggle = useCallback((index) => {
        setHidden(state => (state.includes(index)
            ? state.filter(i => i !== index)
            : [...state, index]));
    }, []);

    const showAll = useCallback(() => setHidden([]), []);

    const matrices = useCallback(() => {
        const root = reportRef?.current;
        if (!root) return [];
        return Array.from(root.querySelectorAll("table"))
            .map(table => tableMatrix(table, hidden))
            .filter(matrix => matrix.length);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hidden]);

    const exportExcel = useCallback(() => {
        const data = matrices();
        if (!data.length) return;
        const xml = buildWorkbook(name, data, [name, ...titles]);
        FileSaver.saveAs(
            new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8;" }),
            `${name}.xls`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matrices, name, titles?.join("|")]);

    const exportCSV = useCallback(() => {
        const data = matrices();
        if (!data.length) return;
        const lines = [[name], ...(titles || []).filter(Boolean).map(t => [t])];
        data.forEach((matrix, mi) => {
            if (mi > 0) lines.push([]);
            matrix.forEach(row => lines.push(row));
        });
        const csv = Papa.unparse(lines);
        FileSaver.saveAs(
            new Blob([csv], { type: "text/csv;charset=utf-8;" }),
            `${name}.csv`);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matrices, name, titles?.join("|")]);

    return useMemo(
        () => ({ columns, hidden, toggle, showAll, exportExcel, exportCSV }),
        [columns, hidden, toggle, showAll, exportExcel, exportCSV]);
}
