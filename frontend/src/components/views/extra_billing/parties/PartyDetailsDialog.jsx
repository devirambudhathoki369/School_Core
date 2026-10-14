import { useId } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { BanknotesIcon, PencilIcon, UserGroupIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { PARTY_TYPES, nameOf } from "@/configs/extra_billing";
import useLastValue from "@/hooks/lastValue";
import { StatusPill, rs } from "../common";

function Item({ label, value, wide = false }) {
    const empty = value === undefined || value === null || `${value}`.trim() === "";
    return (
        <div className={`app-record-item ${wide ? "app-record-wide" : ""}`}>
            <dt className="app-record-label">{label}</dt>
            <dd className={`app-record-value ${empty ? "is-empty" : ""}`}>{empty ? "—" : value}</dd>
        </div>
    );
}

function Group({ title, children }) {
    return (
        <section className="min-w-0">
            <h3 className="app-dialog-group">{title}</h3>
            <dl className="app-record-grid">{children}</dl>
        </section>
    );
}

/**
 * Everything the list knows about one party, opened from a row's View.
 *
 * The table draws the columns that find a party and say what they owe; the
 * address, the agreement and the remarks are read here instead of in a table
 * that scrolls sideways. From here the office goes on to what it came to do:
 * correct the record, or set what the party pays every month.
 */
function PartyDetailsDialog({ party: opened, onClose, onEdit, onCharges }) {
    const party = useLastValue(opened);
    const titleId = useId();
    const owes = Number(party?.balance) > 0;

    return (
        <Dialog open={!!opened} handler={onClose} size="lg" aria-labelledby={titleId}
            className="app-dialog app-dialog-wide">
            <DialogHeader className="app-dialog-head">
                <span className="app-dialog-chip" aria-hidden="true">
                    <UserGroupIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 flex flex-col">
                    <span id={titleId} className="app-dialog-title break-words">{party?.name || "Party"}</span>
                    <span className="app-dialog-sub truncate">
                        {[party?.party_type_name || nameOf(PARTY_TYPES, party?.party_type, ""), party?.property_name]
                            .filter(Boolean).join(" · ")}
                    </span>
                </span>
                <span className="shrink-0">
                    <StatusPill tone={owes ? "amber" : "green"} text={`Balance Rs. ${rs(party?.balance)}`} />
                </span>
                <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full" onClick={onClose}>
                    <XMarkIcon className="h-5 w-5" />
                </IconButton>
            </DialogHeader>

            <DialogBody className="app-dialog-body flex flex-col gap-y-5">
                <Group title="Party">
                    <Item label="Type" value={party?.party_type_name || nameOf(PARTY_TYPES, party?.party_type, "")} />
                    <Item label="Contact" value={party?.contact} />
                    <Item label="Property / unit" value={party?.property_name} />
                    <Item label="Address" value={party?.address} wide />
                </Group>

                <Group title="Agreement and remarks">
                    <Item label="Agreement from (BS)" value={party?.agreement_start} />
                    <Item label="Agreement to (BS)" value={party?.agreement_end} />
                    <Item label="Remarks" value={party?.remarks} wide />
                </Group>

                <Group title="Money">
                    <Item label="Old dues" value={`Rs. ${rs(party?.opening_due)}`} />
                    <Item label="Per month" value={`Rs. ${rs(party?.monthly)}`} />
                    <Item label="Charged" value={`Rs. ${rs(party?.charged)}`} />
                    <Item label="Paid" value={`Rs. ${rs(party?.paid)}`} />
                    <Item label="Balance" value={`Rs. ${rs(party?.balance)}`} />
                </Group>
            </DialogBody>

            <DialogFooter className="app-dialog-foot">
                <div className="app-actions app-dialog-actions">
                    <Button variant="text" type="button" onClick={onClose}>Close</Button>
                    {onCharges &&
                        <Button variant="outlined" type="button" className="flex items-center justify-center gap-1.5"
                            onClick={() => onCharges(party)}>
                            <BanknotesIcon className="h-4 w-4" aria-hidden="true" /> Monthly charges
                        </Button>}
                    <Button type="button" color="teal" className="flex items-center justify-center gap-1.5"
                        onClick={() => onEdit(party)}>
                        <PencilIcon className="h-4 w-4" aria-hidden="true" /> Edit
                    </Button>
                </div>
            </DialogFooter>
        </Dialog>
    );
}

export default PartyDetailsDialog;
