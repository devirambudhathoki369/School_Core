import { Button } from "@material-tailwind/react";

// Neutral secondary button — Reset / Cancel. Gray outline, fills light-gray on
// hover. Part of the system-wide button language (primary=teal, danger=red).
function ResetButton({ onClick, disabled = false, type = "button", children = "Reset" }) {
    return (
        <Button
            type={type}
            variant="outlined"
            color="blue-gray"
            disabled={disabled}
            onClick={onClick}
            className="rounded-lg normal-case text-sm font-semibold border-gray-300 text-gray-700 hover:bg-gray-100"
        >
            {children}
        </Button>
    );
}

export default ResetButton;
