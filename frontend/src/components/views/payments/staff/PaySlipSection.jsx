import { ButtonsSecion } from "@/components/sections";
import { Button } from "@material-tailwind/react";
import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import PaySlip from "./PaySlip";

// `reprint`: the slip was opened again from a list, not shown on payment.
function PaySlipSection({ invoice, user, onClose, reprint = false }) {
    const paySlipRef = useRef(null);
    // 
    const printPaySlip = useReactToPrint({
        content: () => paySlipRef.current,
    });

    return (
        <>
            <div ref={paySlipRef} className="w-max flex justify-around items-start gap-2 p-1">
                <PaySlip invoice={invoice} user={user} reprint={reprint}
                    cashier={user?.profile?.role === "staff" ? user?.profile?.name : null} designation={user?.profile?.designation || null} />
                <PaySlip invoice={invoice} user={user} reprint={reprint}
                    cashier={user?.profile?.role === "staff" ? user?.profile?.name : null} designation={user?.profile?.designation || null} />
            </div>
            <ButtonsSecion>
                <Button variant="outlined" onClick={onClose}>Close</Button>
                <Button variant="outlined" onClick={printPaySlip}>Print</Button>
            </ButtonsSecion>
        </>
    )
}

export default PaySlipSection;