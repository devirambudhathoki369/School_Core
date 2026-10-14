import { Button } from "@material-tailwind/react";
import BillSample from "./BillSample";
import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import { ButtonsSecion } from "@/components/sections";

function BillsSection({ invoice, onClose }) {
    const billRef = useRef(null);
    // 
    const printBill = useReactToPrint({
        content: () => billRef.current,
    });
    return (
        <>
            {
                invoice &&
                <div className="flex flex-col gap-y-2 w-full">
                    <div ref={billRef} className="w-max flex justify-around items-start gap-2 p-1">
                        <BillSample invoice={invoice} />
                        <BillSample invoice={invoice} />
                    </div>
                    <ButtonsSecion>
                        <Button onClick={printBill} variant="outlined">Print Bill!</Button>
                        <Button onClick={onClose} variant="outlined">Close</Button>
                    </ButtonsSecion>
                </div>
            }
        </>
    )
}

export default BillsSection;