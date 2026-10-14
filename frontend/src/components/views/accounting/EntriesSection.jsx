import { ButtonsSecion } from "@/components/sections";
import { Button } from "@material-tailwind/react";
import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import BaseVoucher from "./BaseVoucher";

function EntriesSection({ id, name, entry, onClose }) {
    const billRef = useRef(null);
    // 
    const printBill = useReactToPrint({
        content: () => billRef.current,
    });
    return (
        <>
            {
                entry &&
                <div className="flex flex-col gap-y-2 w-full">
                    <div ref={billRef} className="w-max flex justify-around items-start gap-2 p-1">
                        <BaseVoucher id={id} name={name} entry={entry} />
                        {/* <BaseVoucher id={id} name={name} entry={entry} /> */}
                    </div>
                    <ButtonsSecion>
                        <Button onClick={printBill} variant="outlined">Print</Button>
                        <Button onClick={onClose} variant="outlined">Close</Button>
                    </ButtonsSecion>
                </div>
            }
        </>
    )
}

export default EntriesSection;