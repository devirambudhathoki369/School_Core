import { Card } from "@material-tailwind/react";

// The column-heading row above a list of RowCards (payment forms, bulk
// updates, dues posting). Drawn like a table's header row — a tint of the
// accent with small tracked labels — rather than a solid brand bar, so a form
// reads as one list with a heading instead of a coloured block stacked on it.
function HeaderCard({ children, grid, className = '' }) {
    return (
        <Card
            className={`app-rowhead grid grid-cols-${grid} gap-x-3 items-center justify-between w-full py-2.5 px-4 sm:px-8 rounded-lg ${className}`}>
            {children}
        </Card>
    )
}

export default HeaderCard;
