import { confirmAction } from "@/components/ConfirmDialog";
import { useEffect, useState } from "react";
import { Card, Textarea } from "@material-tailwind/react";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, FilterSection } from "@/components/sections";
import SearchPanel from "@/components/searchbars/SearchPanel";
import countActiveFilters from "@/components/searchbars/countActiveFilters";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { searchStaffs, fetchStaffRoles } from "@/services/functions/staffs";
import { __save } from "@/services/functions";
import Checkbox from "@/components/inputs/Checkbox";
import BasicTable from "@/components/tables/BasicTable";
import STAFF_STATUS_OPTIONS from "@/components/inputs/options/staff_status";
import SMSCreditsView from "../SMSCreditsView";
import SMSLength from "../SMSLength";
import CreditsReview, { creditsNeeded } from "../CreditsReview";
import PlaceValues from "../templates/PlaceValues";
import { TemplateTypes } from "../templates/configs";

/**
 * Send SMS to Staff.
 *
 * The mirror of "Send Bulk SMS", with the one difference that matters: bulk SMS
 * goes to the GUARDIAN's number, so it could never be used to reach a teacher.
 * This selects staff and sends to their own primary contact.
 *
 * The two-step shape is kept deliberately — search first, review the count
 * against your SMS credits, then write and send — because every recipient costs
 * a credit and there is no way to recall a message once it has left.
 */

const EMPLOYED = "1";
const staffSearchSchema = {
    first_name: "", middle_name: "", last_name: "",
    role: "", status: EMPLOYED, message: "",
};

const SEND_STAFF_SMS_API = "/api/sms/send_staff_sms";

function SendStaffSMS() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const school = user?.profile?.school || user?.profile?.id;

    const [form, setForm] = useState({ ...staffSearchSchema });
    const [roles, setRoles] = useState([]);
    const [staffs, setStaffs] = useState([]);
    const [creditRequired, setCreditRequired] = useState(0);
    const [showTable, setShowTable] = useState(false);
    const [focused, setFocused] = useState(false);
    const [searchOpened, setSearchOpened] = useState(true);
    const { uploading, searching, statusHandler } = useRequestStatus();

    useEffect(() => {
        (async () => {
            const options = await fetchStaffRoles(true);
            setRoles(options || []);
        })();
    }, []);

    function onChange({ name, value }) {
        if (name === "message") setFocused(true);
        if (name === "placevalue") {
            name = "message";
            value = form.message += ` ${value} `;
        }
        setForm(state => ({ ...state, [name]: value }));
        // Any change to WHO receives it invalidates the reviewed count, so the
        // compose step folds away rather than sending to a stale selection.
        if (name !== "message") {
            setCreditRequired(0);
            setStaffs([]);
        }
    }

    // Once the message box has been used the place values stay on screen.
    // They used to disappear on blur — and pressing the button below IS a blur:
    // the row vanished, everything under it moved up, and the click landed on
    // empty space instead of the button.
    function onFocus() {
        setFocused(true);
    }

    function onReset() {
        setForm({ ...staffSearchSchema });
        setStaffs([]);
        setCreditRequired(0);
        setShowTable(false);
        setSearchOpened(true);
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const { message, ...filters } = form;
        const [status, msg, data] = await searchStaffs({
            ...filters,
            school,
            // the contact is what decides whether a staff member is reachable
            contact: true,
            designation: true,
        });
        statusHandler.toggleSearching();

        const list = data || [];
        // Anyone without a primary contact cannot be sent to; showing them in
        // the count would promise a message that never arrives.
        const reachable = list.filter(s => s?.primary_contact);
        if (reachable.length === 0) {
            setStaffs([]);
            setCreditRequired(0);
            updateNotification(404, list.length
                ? "Matched staff have no contact number saved!"
                : (msg || "No staff found!"));
            return;
        }
        setStaffs(reachable);
        setCreditRequired(reachable.length);
        // recipients are settled — give the compose box the screen
        setSearchOpened(false);
        updateNotification(status, `${reachable.length} staff found.`);
    }

    async function sendStaffSMS(e) {
        e.preventDefault();
        if (!form.message?.trim()) {
            updateNotification("", "Write the message first!");
            return;
        }
        // a long message is several credits for every recipient, not one
        const { perSMS, total, about } = creditsNeeded(creditRequired, form.message);
        if (!await confirmAction({
            title: `Send this SMS to ${creditRequired} staff?`,
            body: `${about ? "About " : ""}${total} credit${total === 1 ? "" : "s"} will be used (${creditRequired} × ${perSMS}). Messages cannot be recalled once sent.`,
            tone: "warning",
            confirmText: "Send messages",
        })) return;

        const { ...payload } = form;
        statusHandler.toggleUploading();
        const [status, msg] = await __save(SEND_STAFF_SMS_API, { ...payload, school });
        updateNotification(status, msg);
        if (status === 200) onReset();
        statusHandler.toggleUploading();
    }

    return (
        <>
            <SMSCreditsView />
            <SearchPanel
                title="Search Staff"
                open={searchOpened}
                onToggle={() => setSearchOpened(state => !state)}
                activeCount={countActiveFilters(form, { ignore: ["message"], defaults: { status: EMPLOYED } })}
                onReset={onReset}
                onSubmit={onSearch}
                searching={searching}>
                <div className="mygrid">
                    <FilterSection title={"Staff's Info"}>
                        <div className="w-full grid grid-cols-1 sm:grid-cols-12 gap-x-1">
                            <TextInput input={{ name: "first_name", label: "First Name" }}
                                value={form?.first_name} onChange={onChange} />
                            <TextInput input={{ name: "middle_name", label: "Middle Name" }}
                                value={form?.middle_name} onChange={onChange} />
                            <TextInput input={{ name: "last_name", label: "Last Name" }}
                                value={form?.last_name} onChange={onChange} />
                        </div>
                    </FilterSection>
                    <FilterSection title={"Filter"}>
                        <div className="w-full grid grid-cols-1 sm:grid-cols-12 gap-x-1">
                            <SelectInput input={{ name: "role", label: "Designation", options: roles }}
                                value={form?.role} onChange={onChange} />
                            <SelectInput input={{ name: "status", label: "Status", options: STAFF_STATUS_OPTIONS }}
                                value={form?.status} onChange={onChange} />
                        </div>
                    </FilterSection>
                </div>
            </SearchPanel>

            {creditRequired > 0 &&
                <form onSubmit={sendStaffSMS}>
                    <CreditsReview recipients={creditRequired} noun="staff" text={form?.message} />
                    <Checkbox name={"Show/Hide table"} text={"Show/Hide table"}
                        checked={showTable} onClick={() => setShowTable(state => !state)} />
                    {showTable &&
                        <BasicTable name={"Sending SMS to"} data={staffs} columns={[
                            ["name"], ["designation"], ["primary_contact", "Contact"],
                        ]} onSelect={() => null} showSelected={false} />
                    }
                    <Card className="px-6 py-2 my-2">
                        <FilterSection title={"Message"}>
                            <div className="!w-full">
                                {focused &&
                                    <PlaceValues onClick={onChange} template_type={TemplateTypes.STAFF_SMS} />
                                }
                                <Textarea value={form?.message} className="!text-base !text-black"
                                    onFocus={onFocus}
                                    name="message" placeholder="Write your message here!"
                                    onChange={(e) => {
                                        const { name, value } = e.target;
                                        onChange({ name, value });
                                    }} />
                                {/* language, total characters, credit — as the SMS provider counts them */}
                                <SMSLength text={form?.message} placeholders={/\{\{[^{}]+\}\}/.test(form?.message || "")} />
                            </div>
                        </FilterSection>
                    </Card>
                    <ButtonsSecion>
                        <FormSaveButton custom={[uploading, "Send SMS to staff", "Sending..."]}
                            disabled={uploading} />
                    </ButtonsSecion>
                </form>
            }
        </>
    );
}

export default SendStaffSMS;
