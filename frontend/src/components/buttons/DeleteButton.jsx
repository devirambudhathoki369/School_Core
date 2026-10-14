import { Tooltip, Button } from "@material-tailwind/react";
import { TrashIcon } from "@heroicons/react/24/outline";

function DeleteButton({ onClick }) {
    return (
        <Tooltip content="Delete">
            <Button variant="text" onClick={onClick}
                className="p-2 rounded-lg !bg-red-500 hover:!bg-red-600 text-white shadow-sm">
                <TrashIcon className="icon" />
            </Button>
        </Tooltip>
    )
}

export default DeleteButton;