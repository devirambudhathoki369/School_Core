import { Button } from "@material-tailwind/react";
import { useRef } from "react";
import { useReactToPrint } from "react-to-print";
import { ButtonsSecion } from "@/components/sections";
import TaxInvoiceBill from "./TaxInvoiceBill";

// Mirrors BillsSection (two copies side by side — office + guardian).
function TaxInvoiceSection({ invoice, onClose }) {
    const billRef = useRef(null);
    const printTaxInvoice = useReactToPrint({
        content: () => billRef.current,
    });
    if (!invoice) return null;
    return (
        <div className="flex flex-col gap-y-2 w-full">
            <div ref={billRef} className="w-max flex justify-around items-start gap-2 p-1">
                <TaxInvoiceBill invoice={invoice} />
                <TaxInvoiceBill invoice={invoice} />
            </div>
            <ButtonsSecion>
                <Button onClick={printTaxInvoice} variant="outlined">Print Tax Invoice!</Button>
                <Button onClick={onClose} variant="outlined">Close</Button>
            </ButtonsSecion>
        </div>
    );
}

export default TaxInvoiceSection;
