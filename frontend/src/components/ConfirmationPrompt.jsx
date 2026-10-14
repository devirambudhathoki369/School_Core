import { useAppContext } from "@/contexts/AppContext";
import {
    Button, Dialog, DialogHeader, DialogBody, DialogFooter, Typography, Textarea
} from "@material-tailwind/react";
import { useState } from "react";

function ConfirmationPrompt() {
    const { prompt: { promptSchema, promptData, showConfirmationPrompt, toggleConfirmationPrompt, resetPrompt } } = useAppContext();
    const [reason, setReason] = useState('')
    function onChange(value) {
        setReason(value);
    }
    function canConfirm() {
        if (promptData?.reason_required) {
            return reason ? true : false;
        }
        return true;
    }
    // 
    return (
        <>
            {/* No `handler` meant Escape and backdrop clicks did nothing, so
                this dialog could only be left through its own two buttons.
                Dismissing is CANCEL, never confirm — the same path the Cancel
                button takes, so an Escape can never be read as approval of
                whatever is being confirmed. */}
            <Dialog className="z-50" open={showConfirmationPrompt}
                handler={() => {
                    toggleConfirmationPrompt({ ...promptSchema });
                    resetPrompt();
                }}>
                <DialogHeader className="flex flex-col items-start">
                    {promptData?.header || "Confirmation Dialog"}
                    <Typography variant="paragraph">
                        {promptData?.sub_header}
                    </Typography>
                    {promptData?.reason_required &&
                        <Typography variant="paragraph">
                            "Reason Required"
                        </Typography>
                    }
                </DialogHeader>
                <DialogBody>
                    {promptData?.body}
                    {
                        promptData?.ask_reason &&
                        <Textarea value={reason} className="!text-base" name="remarks" label="Reason"
                            onChange={(e) => {
                                const { value } = e.target;
                                onChange(value);
                            }} onBlur={(e) => {
                                return null;
                            }} />
                    }
                </DialogBody>
                <DialogFooter>
                    <Button
                        variant="text"
                        color="red"
                        onClick={() => {
                            toggleConfirmationPrompt({ ...promptSchema });
                            resetPrompt();
                        }}
                        className="mr-1"
                    >
                        <span>Cancel</span>
                    </Button>
                    <Button
                        variant="gradient"
                        color="green"
                        onClick={() => {
                            try {
                                promptData?.onConfirm(reason);
                                toggleConfirmationPrompt({ ...promptSchema });
                                setReason('');
                            } catch (e) {
                                () => null;
                            }
                        }}
                        disabled={!canConfirm()}
                    >
                        <span>Confirm</span>
                    </Button>
                </DialogFooter>
            </Dialog>
        </>
    )
}

export default ConfirmationPrompt;