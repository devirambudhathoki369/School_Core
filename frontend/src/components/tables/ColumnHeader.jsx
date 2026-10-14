import { Tooltip, Typography } from "@material-tailwind/react";

function ColumnHeader({ columnName, tooltip, className, classNameTypo, hideFromPrint, rowSpan = 1, colSpan = 1 }) {
    return (
        <th className={`py-3 !p-4 ${className} ${hideFromPrint ? 'hide-from-print' : ''}`} rowSpan={rowSpan} colSpan={colSpan}>
            <Tooltip className={`${!tooltip ? 'hidden' : 'block'}`} content={tooltip || ''}>
                <Typography
                    color="blue-gray"
                    // No `w-max`: it stopped a heading ever wrapping, so a long
                    // one set the column's width and pushed the table past the
                    // width of the page.
                    className={`font-semibold text-sm leading-none opacity-80 break-words ${classNameTypo}`}>
                    {columnName}
                </Typography>
            </Tooltip>
        </th>
    );
}
export default ColumnHeader;
