import { PrinterIcon } from "@heroicons/react/24/outline";
import useReportTableTools from "./reportTableTools";
import { ColumnsMenu, ExportMenu, ToolButton } from "./TableTools";

/**
 * Consistent, responsive actions bar for report / results views.
 *
 * Pins Print (and any extra actions) to the TOP-RIGHT of the results — never at
 * the bottom — stays reachable while scrolling long reports (sticky), wraps on
 * small screens, and is hidden from the printout. Pass `onPrint` and/or extra
 * buttons as `children`.
 *
 * Pass `reportRef` (the same ref the report is printed from) to also get the
 * column show/hide menu and Excel/CSV export that BasicTable has — driven off
 * the rendered table, so hand-rolled report tables need no column config.
 * `exportName` names the file and the sheet; `exportTitles` are caption lines
 * (date range, fiscal year …) written above the data.
 */
export default function ReportActionBar({
    onPrint,
    printLabel = "Print",
    reportRef = null,
    exportName = "Report",
    exportTitles = [],
    children,
    className = "",
}) {
    const { columns, hidden, toggle, showAll, exportExcel, exportCSV } =
        useReportTableTools(reportRef, { name: exportName, titles: exportTitles });
    const hasTools = !!reportRef && columns.length > 0;

    // The same Columns / Print / Export as every BasicTable (TableTools.jsx).
    return (
        <div className={`app-report-bar hide-from-print ${className}`}>
            {children}
            {hasTools && (
                <ColumnsMenu
                    items={columns.map((label, index) => ({ key: index, label, shown: !hidden.includes(index) }))}
                    onToggle={toggle}
                    onShowAll={showAll} />
            )}
            {hasTools && <ExportMenu onExcel={exportExcel} onCsv={exportCSV} />}
            {onPrint && <ToolButton icon={PrinterIcon} onClick={onPrint}>{printLabel}</ToolButton>}
        </div>
    );
}
