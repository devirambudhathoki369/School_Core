import { useEffect, useRef, useState } from "react";
import { ArrowDownTrayIcon, ChevronDownIcon, ViewColumnsIcon } from "@heroicons/react/24/outline";

/**
 * The tools above a table: Columns, Print and Export. One look for every
 * table, whether it is a BasicTable or a report drawn by hand
 * (ReportActionBar), so a school meets the same three buttons everywhere.
 *
 * They were four solid accent blocks (Columns, Print, Export Excel, Export
 * CSV) that outweighed the table's own name. They are quiet now, and the two
 * exports sit under one Export button.
 */

/** A quiet 40px button: an icon, then its words. */
export function ToolButton({ icon: Icon, children, className = "", ...rest }) {
    return (
        <button type="button" className={`app-tbl-btn ${className}`} {...rest}>
            {Icon && <Icon className="app-tbl-btn-icon" aria-hidden="true" />}
            {children}
        </button>
    );
}

/**
 * A button with a small menu under it. Closes on Escape, on a click outside
 * it, and after a choice that says so.
 */
function MenuButton({ icon, label, width = 240, children }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
        const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("keydown", onKey);
        document.addEventListener("mousedown", onDown);
        return () => {
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onDown);
        };
    }, [open]);
    return (
        <div className="app-tbl-pop" ref={ref}>
            <ToolButton icon={icon} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                {label}
                <ChevronDownIcon className="app-tbl-caret" aria-hidden="true" />
            </ToolButton>
            {open && (
                <div className="app-tbl-menu" style={{ width }}>
                    {typeof children === "function" ? children(() => setOpen(false)) : children}
                </div>
            )}
        </div>
    );
}

/**
 * Show or hide columns.
 * `items` is [{ key, label, shown }]; `onToggle(key)` flips one.
 */
export function ColumnsMenu({ items, onToggle, onShowAll }) {
    const hiddenCount = items.filter((i) => !i.shown).length;
    return (
        <MenuButton icon={ViewColumnsIcon} label={hiddenCount ? `Columns · ${items.length - hiddenCount}/${items.length}` : "Columns"} width={256}>
            <div className="app-tbl-menu-head">
                <span>Show columns</span>
                {hiddenCount > 0 && <button type="button" onClick={onShowAll}>Show all</button>}
            </div>
            <div className="app-tbl-menu-list">
                {items.map((item) => (
                    <label key={item.key} className="app-tbl-menu-check">
                        <input type="checkbox" checked={item.shown} onChange={() => onToggle(item.key)} />
                        <span>{item.label}</span>
                    </label>
                ))}
            </div>
        </MenuButton>
    );
}

/** Excel and CSV, under one button. */
export function ExportMenu({ onExcel, onCsv }) {
    return (
        <MenuButton icon={ArrowDownTrayIcon} label="Export" width={232}>
            {(close) => (
                <div className="app-tbl-menu-list" role="menu">
                    <button type="button" role="menuitem" className="app-tbl-menu-item" onClick={() => { close(); onExcel(); }}>
                        <span>Excel workbook</span><span className="app-tbl-menu-hint">.xls</span>
                    </button>
                    <button type="button" role="menuitem" className="app-tbl-menu-item" onClick={() => { close(); onCsv(); }}>
                        <span>CSV file</span><span className="app-tbl-menu-hint">.csv</span>
                    </button>
                </div>
            )}
        </MenuButton>
    );
}
