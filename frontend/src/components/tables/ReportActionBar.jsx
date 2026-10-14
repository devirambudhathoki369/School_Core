import { useState } from "react";
import { Button } from "@material-tailwind/react";
import { PrinterIcon, ViewColumnsIcon } from "@heroicons/react/24/outline";
import useReportTableTools from "./reportTableTools";

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
    const [colMenuOpen, setColMenuOpen] = useState(false);
    const { columns, hidden, toggle, showAll, exportExcel, exportCSV } =
        useReportTableTools(reportRef, { name: exportName, titles: exportTitles });
    const hasTools = !!reportRef && columns.length > 0;

    return (
        <div
            className={`hide-from-print sticky top-0 z-20 flex flex-wrap items-center justify-end gap-2 py-2 mb-2
                bg-white/70 backdrop-blur-sm rounded-md ${className}`}
        >
            {children}
            {hasTools && (
                <div className="relative">
                    <Button
                        size="sm"
                        variant="outlined"
                        onClick={() => setColMenuOpen(open => !open)}
                        className="flex items-center gap-2 py-2 px-4 border-teal-400 text-gray-900 normal-case"
                    >
                        <ViewColumnsIcon className="h-4 w-4" />
                        Columns
                    </Button>
                    {colMenuOpen && (
                        <>
                            {/* click-away backdrop */}
                            <div className="fixed inset-0 z-40" onClick={() => setColMenuOpen(false)} />
                            <div className="absolute right-0 z-50 mt-1 w-60 max-h-72 overflow-auto rounded-lg border border-blue-gray-100 bg-white shadow-lg p-2">
                                <div className="flex items-center justify-between px-1 pb-1 mb-1 border-b border-blue-gray-50">
                                    <span className="text-xs font-semibold text-blue-gray-600">Show columns</span>
                                    <button type="button"
                                        className="text-xs text-teal-700 font-semibold hover:underline"
                                        onClick={showAll}>Show all</button>
                                </div>
                                {columns.map((label, index) => (
                                    <label key={index}
                                        className="flex items-center gap-2 px-1 py-1 rounded hover:bg-teal-50 cursor-pointer">
                                        <input type="checkbox"
                                            checked={!hidden.includes(index)}
                                            onChange={() => toggle(index)} />
                                        <span className="text-sm text-blue-gray-800 capitalize">{label}</span>
                                    </label>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
            {hasTools && (
                <>
                    <Button
                        size="sm"
                        onClick={exportExcel}
                        className="py-2 px-5 bg-teal-300 text-gray-900 normal-case shadow-sm hover:shadow-md"
                    >
                        Export Excel
                    </Button>
                    <Button
                        size="sm"
                        onClick={exportCSV}
                        className="py-2 px-5 bg-teal-300 text-gray-900 normal-case shadow-sm hover:shadow-md"
                    >
                        Export CSV
                    </Button>
                </>
            )}
            {onPrint && (
                <Button
                    size="sm"
                    onClick={onPrint}
                    className="flex items-center gap-2 py-2 px-5 bg-teal-400 text-gray-900 normal-case shadow-sm hover:shadow-md"
                >
                    <PrinterIcon className="h-4 w-4" />
                    {printLabel}
                </Button>
            )}
        </div>
    );
}
