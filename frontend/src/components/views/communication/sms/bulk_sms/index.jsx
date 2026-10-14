import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import ClassPicker from "@/components/inputs/ClassPicker";
import { ButtonsSecion, FilterSection } from "@/components/sections";
import SearchPanel from "@/components/searchbars/SearchPanel";
import countActiveFilters from "@/components/searchbars/countActiveFilters";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import cleanClassInfo from "@/methods/cleanClassInfo";
import classPickerSchema from "@/schemas/class-picker";
import { searchStudents } from "@/services/functions/students";
import { useState } from "react";
import SMSCreditsView from "../SMSCreditsView";
import SMSLength from "../SMSLength";
import CreditsReview, { creditsNeeded } from "../CreditsReview";
import { confirmAction } from "@/components/ConfirmDialog";
import Checkbox from "@/components/inputs/Checkbox";
import BasicTable from "@/components/tables/BasicTable";
import { Button, Textarea, Card } from "@material-tailwind/react";
import PlaceValues from "../templates/PlaceValues";
import { __save } from "@/services/functions";
import Accordion from "@/components/Accordion";
import BusStationInput from "@/components/inputs/BusStationInput";
import { TemplateTypes } from "../templates/configs";

const studentSearchSchema = {
    first_name: '', middle_name: '', last_name: '', ...classPickerSchema, station: '',
    message: '',
}
const SendBulkSMS_API = "/api/sms/send_bulk_sms";
function SendBulkSMS() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    studentSearchSchema["school"] = user?.profile?.school || user?.profile?.id;
    const [studentSearch, setStudentSearch] = useState({ ...studentSearchSchema });
    const [creditRequired, setCreditRequired] = useState(0);
    const [students, setStudents] = useState([]);
    const [showTable, setShowTable] = useState(false);
    const [focused, setFocused] = useState(false);
    const [searchOpened, setSearchOpened] = useState(true);
    const { uploading, searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        if (name === "message") setFocused(true);
        if (name === "placevalue") {
            name = "message";
            value = studentSearch.message += ` ${value} `;
        }
        setStudentSearch(state => ({ ...state, [name]: value }));
        if (name in classPickerSchema) {
            setCreditRequired(0);
        }
    }
    // Once the message box has been used the place values stay on screen.
    // They used to disappear on blur — and pressing the button below IS a blur:
    // the row vanished, everything under it moved up, and the click landed on
    // empty space instead of the button.
    function onFocus() {
        setFocused(true);
    }
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const [status, msg, data] = await searchStudents({
            ...cleanClassInfo(studentSearch),
            sms: true,
            // to filter out students when searching via station!
            include_station: !!studentSearch?.station || '',
            strict: true,
        });
        updateNotification(status, msg);
        if (data && data?.length > 0) {
            setStudents(data);
            setCreditRequired(data?.length || 0);
            // recipients are settled — give the compose box the screen
            setSearchOpened(false);
        } else {
            updateNotification(404, "Not found!");
        }
        statusHandler.toggleSearching();
    }
    async function sendBulkSMS(e) {
        e.preventDefault();
        if (uploading) return;
        if (!studentSearch.message?.trim()) {
            updateNotification("", "Write the message first!");
            return;
        }
        // what this send costs, said before it is spent: a long message is
        // several credits for every student, not one
        const { perSMS, total, about } = creditsNeeded(creditRequired, studentSearch.message);
        if (!await confirmAction({
            title: `Send this SMS to ${creditRequired} student${creditRequired === 1 ? "" : "s"}?`,
            body: `${about ? "About " : ""}${total} credit${total === 1 ? "" : "s"} will be used (${creditRequired} × ${perSMS}). Messages cannot be recalled once sent.`,
            tone: "warning",
            confirmText: "Send messages",
        })) return;
        const payload = {
            ...cleanClassInfo(studentSearch)
        };
        statusHandler.toggleUploading();
        const [status, msg,] = await __save(SendBulkSMS_API, payload);
        updateNotification(status, msg);
        if (status === 200) {
            onReset();
        }
        statusHandler.toggleUploading();
    }
    function onReset() {
        setStudentSearch({ ...studentSearchSchema });
        setShowTable(false);
        setStudents([]);
        setCreditRequired(0);
        setSearchOpened(true);
    }
    function toggleTable() {
        setShowTable(state => !state);
    }

    return (
        <>
            <SMSCreditsView />
            <SearchPanel
                title="Search Students"
                open={searchOpened}
                onToggle={() => setSearchOpened(state => !state)}
                activeCount={countActiveFilters(studentSearch, { ignore: ["message"] })}
                onReset={onReset}
                onSubmit={onSearch}
                searching={searching}>
                <div className="mygrid">
                    <FilterSection title={"Student's Info"}>
                        <div className="w-full grid grid-cols-1 sm:grid-cols-12 gap-x-1">
                            <TextInput input={{ name: 'first_name', label: 'First Name' }} value={studentSearch?.first_name} onChange={onChange} />
                            <TextInput input={{ name: 'middle_name', label: 'Middle Name' }} value={studentSearch?.middle_name} onChange={onChange} />
                            <TextInput input={{ name: 'last_name', label: 'Last Name' }} value={studentSearch?.last_name} onChange={onChange} />
                        </div>
                    </FilterSection>
                    {/* --- */}
                    <ClassPicker data={studentSearch} onChange={onChange} classwise={true} />
                    <div className="sm:col-span-12">
                        <Accordion title={"Search by Bus stations"}>
                            <BusStationInput input={{ name: 'station', label: "Bus Station" }} value={studentSearch?.station} onChange={onChange} />
                        </Accordion>
                    </div>
                </div>
            </SearchPanel>
            <>
                {
                    creditRequired > 0 &&
                    <form onSubmit={sendBulkSMS}>
                        <CreditsReview recipients={creditRequired} noun="students" text={studentSearch?.message} />
                        <Checkbox name={"Show/Hide table"} text={"Show/Hide table"} checked={showTable} onClick={toggleTable} />
                        {showTable &&
                            <BasicTable name={"Sent SMS to"} data={students} columns={[
                                ['name']
                            ]} onSelect={() => null} showSelected={false} />
                        }
                        <Card className="px-6 py-2 my-2">
                            <FilterSection title={"Message"}>
                                <div className="!w-full">
                                    {
                                        focused &&
                                        <PlaceValues onClick={onChange} template_type={TemplateTypes.BULK_SMS} />
                                    }
                                    <Textarea value={studentSearch?.message} className="!text-base !text-black"
                                        onFocus={onFocus}
                                        name="message" placeholder="Write your message here!"
                                        onChange={(e) => {
                                            const { name, value } = e.target;
                                            onChange({ name, value });
                                        }} />
                                    {/* language, total characters, credit — as the SMS provider counts them */}
                                    <SMSLength text={studentSearch?.message} placeholders={/\{\{[^{}]+\}\}/.test(studentSearch?.message || "")} />
                                </div>
                            </FilterSection>
                        </Card>
                        <ButtonsSecion>
                            <FormSaveButton custom={[uploading, "Send bulk sms", "Sending..."]} disabled={uploading} />
                        </ButtonsSecion>
                    </form>
                }
            </>
        </>
    )
}

export default SendBulkSMS;