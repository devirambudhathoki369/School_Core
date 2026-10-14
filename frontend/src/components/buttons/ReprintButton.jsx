import { PrinterIcon } from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@material-tailwind/react";

function ReprintButton({ onClick }) {
    return (
        <Tooltip content="Reprint invoice">
            <Button variant="text" onClick={onClick} className="p-1">
                <PrinterIcon className="icon" />
            </Button>
        </Tooltip>
    )
}

export default ReprintButton;