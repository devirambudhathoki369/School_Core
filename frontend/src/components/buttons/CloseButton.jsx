import { Tooltip, Button } from "@material-tailwind/react";
import { XMarkIcon } from "@heroicons/react/24/outline";

function CloseButton({ onClick }) {
    return (
        <Tooltip content="Close">
            <Button variant="text" onClick={onClick} className="p-1">
                <XMarkIcon className="icon text-black" />
            </Button>
        </Tooltip>
    )
}

export default CloseButton;