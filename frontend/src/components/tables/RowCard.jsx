import { Card } from "@material-tailwind/react";

// One row under a HeaderCard. Flat: a hairline and a quiet accent tint on hover
// (it was a shadowed card that grew a bigger shadow on hover, so a column of
// inputs twitched as the pointer crossed it).
function RowCard({ children, grid, className = '' }) {
    return (
        <Card className={`app-rowcard grid grid-cols-${grid} gap-x-3 justify-between items-center w-full py-2.5 my-1 px-4 sm:px-8 rounded-lg ${className}`}>
            {children}
        </Card>
    )
}

export default RowCard;
