import {
    CreditCardIcon, IdentificationIcon, PencilIcon, TrashIcon,
    CursorArrowRippleIcon, CheckCircleIcon, PrinterIcon, LockClosedIcon,
    EyeIcon, KeyIcon,
} from "@heroicons/react/24/outline"

export const payAction = { text: 'Pay', icon: <CreditCardIcon className="icon" />, action: 'pay', tooltip: 'Make payment' };
export const detailAction = { text: 'Profile', icon: <IdentificationIcon className="icon" />, action: 'profile', tooltip: 'Open profile' };
export const editAction = { text: 'Edit', icon: <PencilIcon className="icon" />, action: 'edit' };
export const deleteAction = { text: 'Delete', icon: <TrashIcon className="icon" />, action: 'delete' };
export const stopAction = { text: "Stop", icon: null, action: 'stop', tooltip: 'Stop' };
export const selectAction = { text: "Select", icon: <CursorArrowRippleIcon className="icon" />, action: 'select', tooltip: "Select" };
export const toggleAction = (text, tooltip, action = 'toggle') => ({ text, icon: null, action, tooltip });
export const applyAction = (text = "Apply", tooltip) => ({ text: text, icon: <CheckCircleIcon className="icon" />, action: 'apply', tooltip });
export const customAction = ({ text = "Custom", action = 'click', icon = null, tooltip }) => ({ text, action, icon, tooltip });
export const passwordAction = { text: 'Password', icon: <KeyIcon className="icon" />, action: 'change_password', tooltip: 'Change password' };
export const reprintAction = { text: "Reprint", icon: <PrinterIcon className="icon" />, action: 'reprint' };
export const closeAction = { text: "Close", icon: <LockClosedIcon className="icon" />, action: 'close', tooltip: "Close" };
export const viewAction = { text: "View", icon: <EyeIcon className="icon" />, action: 'view', tooltip: "View" };
// library
export const issueBookAction = customAction({ text: "Issue", action: "issue_book" });
export const returnBookAction = customAction({ text: "Renew/Return", action: "return_book" });