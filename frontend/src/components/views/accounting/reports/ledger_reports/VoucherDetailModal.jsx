import { Button, Dialog, DialogBody } from "@material-tailwind/react";
import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import Loader from "@/components/Loader";
import BaseVoucher from "../../BaseVoucher";
import { ENTRIES } from "../../acc_constants";
import { useAppContext } from "@/contexts/AppContext";
import { __fetch } from "@/services/functions";

// entry_type on a report row -> the voucher API/name that can render it.
const ENTRY_BY_TYPE = Object.values(ENTRIES).reduce((acc, e) => {
    acc[e.ID] = e;
    return acc;
}, {});

/**
 * "Show more" for one line of the individual ledger report.
 *
 * A single line only says the ledger was debited 500 — it does not say what
 * made up that 500. This opens the whole voucher the line came from, so every
 * particular and remark behind the figure is visible (and printable).
 */
function VoucherDetailModal({ row, onClose }) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const [entry, setEntry] = useState(null);
    const [loading, setLoading] = useState(false);
    const voucherRef = useRef(null);

    const entryConfig = ENTRY_BY_TYPE[row?.entry_type];
    const printVoucher = useReactToPrint({ content: () => voucherRef.current });

    useEffect(() => {
        if (!row) {
            setEntry(null);
            return;
        }
        (async () => {
            if (!entryConfig?.apiPath || !row?.entry_id) {
                updateNotification(400, "Voucher details are not available for this row!");
                return;
            }
            setLoading(true);
            const data = await __fetch(entryConfig.apiPath, {
                school: user?.profile?.school || user?.profile?.id,
                entry: row.entry_id,
            });
            setEntry(data || null);
            if (!data) updateNotification(404, "Voucher not found!");
            setLoading(false);
        })();
    }, [row?.entry_id, row?.entry_type]);

    return (
        <Dialog open={!!row} handler={onClose} size="lg"
            className="max-h-[92vh] overflow-y-auto">
            <DialogBody className="overflow-y-auto">
                {loading ? <Loader /> :
                    entry ?
                        <div className="flex flex-col gap-y-3 items-center">
                            <div ref={voucherRef} className="w-max">
                                <BaseVoucher id={row?.entry_type} name={entryConfig?.name} entry={entry} />
                            </div>
                            <div className="flex gap-x-2 hide-from-print">
                                <Button onClick={printVoucher} variant="outlined">Print</Button>
                                <Button onClick={onClose} variant="outlined">Close</Button>
                            </div>
                        </div> :
                        <div className="flex flex-col gap-y-3 items-center py-6">
                            <span className="text-base font-semibold text-black">
                                No voucher details to show for this row.
                            </span>
                            <Button onClick={onClose} variant="outlined">Close</Button>
                        </div>
                }
            </DialogBody>
        </Dialog>
    );
}

export default VoucherDetailModal;
