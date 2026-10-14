import AttentionBox from "@/components/AttentionBox";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import ClassPicker from "@/components/inputs/ClassPicker";
import { ButtonsSecion, FilterSection } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import cleanClassInfo from "@/methods/cleanClassInfo";
import classPickerSchema from "@/schemas/class-picker";
import { searchStudents } from "@/services/functions/students";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import SMSCreditsView from "../SMSCreditsView";
import SMSLength from "../SMSLength";
import CreditsReview, { creditsNeeded } from "../CreditsReview";
import { TEMPLATES_API_PATH, TemplateTypes } from "../templates/configs";
import { __fetch, __save } from "@/services/functions";
import Checkbox from "@/components/inputs/Checkbox";
import { confirmAction } from "@/components/ConfirmDialog";

const searchSchema = { ...classPickerSchema, balance_gt: '', student: '' };
const SendDuesSMS_API = "/api/sms/send_dues_sms";
function SMSDuesReminder() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    searchSchema["school"] = user?.profile?.school || user?.profile?.id;
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [students, setStudents] = useState([]);
    const [creditRequired, setCreditRequired] = useState(0);
    const [showTable, setShowTable] = useState(false);
    const { searching, uploading, statusHandler } = useRequestStatus();
    // The reminder that goes out is the school's saved dues template — the
    // newest one, as the server picks it. Its length is what each SMS costs:
    // undefined while loading, "" when the school has not written one.
    const [template, setTemplate] = useState(undefined);
    useEffect(() => {
        const school = user?.profile?.school || user?.profile?.id;
        if (!school) return;
        let active = true;
        (async () => {
            const list = await __fetch(TEMPLATES_API_PATH, { school });
            if (!active) return;
            const dues = (Array.isArray(list) ? list : [])
                .filter((t) => Number(t.type) === TemplateTypes.DUES)
                .sort((a, b) => (b.id || 0) - (a.id || 0))[0];
            setTemplate(dues?.template || "");
        })();
        return () => { active = false; };
    }, [user?.profile?.school, user?.profile?.id]);

    function onChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
        if (name in classPickerSchema) {
            setCreditRequired(0);
        }
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const [status, msg, data] = await searchStudents({
            ...cleanClassInfo(searchInput),
            // No academic_year — deliberately. /api/sms/send_dues_sms works off
            // each student's CURRENT class (and its academic year), so the
            // preview has to be asked the same question or the count shown and
            // the number of SMS actually sent disagree. Passing a year here
            // also puts the search on the closed-year (historical roster) path
            // whenever the device's stored year is last year's — which is how
            // a phone came to preview 76 students for a school of 638.
            academic_year: '',
            sms: true,
            include_balance: searchInput?.balance_gt > 0 ? true : '',
        });
        updateNotification(status, msg);
        if (data && data?.length > 0) {
            setStudents(data);
            setCreditRequired(data?.length || 0);
        } else {
            updateNotification(404, "Not found!");
        }
        statusHandler.toggleSearching();
    }

    async function sendDuesSMS(e) {
        e.preventDefault();
        if (uploading) return;
        // what this send costs, said before it is spent: a long reminder is
        // several credits for every student, not one
        const { perSMS, total } = creditsNeeded(creditRequired, template);
        if (!await confirmAction({
            title: `Send the dues reminder to ${creditRequired} student${creditRequired === 1 ? "" : "s"}?`,
            body: perSMS
                ? `About ${total} credit${total === 1 ? "" : "s"} will be used (${creditRequired} × ${perSMS}). Messages cannot be recalled once sent.`
                : `At least ${creditRequired} credit${creditRequired === 1 ? "" : "s"} will be used. Messages cannot be recalled once sent.`,
            tone: "warning",
            confirmText: "Send reminders",
        })) return;
        const payload = {
            ...cleanClassInfo(searchInput),
            academic_year: '',
            template_type: TemplateTypes.DUES,
        };
        statusHandler.toggleUploading();
        const [status, msg,] = await __save(SendDuesSMS_API, payload);
        updateNotification(status, msg);
        if (status === 200) {
            onReset();
        }
        statusHandler.toggleUploading();
    }
    function onReset() {
        setSearchInput({ ...searchSchema });
        setShowTable(false);
        setStudents([]);
        setCreditRequired(0);
    }
    function toggleTable() {
        setShowTable(state => !state);
    }

    return (
        <>
            <SMSCreditsView />
            <div className="border-b border-black mb-2 pb-2">
                <h2 className="text-xl font-semibold leading-7 text-gray-900">Send dues reminder bulk sms</h2>
                <p className="mt-1 text-[0.99rem] leading-5 text-gray-600">
                    Choose school or class or section according to your need!
                </p>
            </div>
            <form onSubmit={onSearch}>
                <>
                    <ClassPicker data={searchInput} onChange={onChange} classwise={true} />
                    <FilterSection title={"Filters"}>
                        <TextInput input={{ name: "balance_gt", label: "Balance greater than", type: "number" }}
                            value={searchInput?.balance_gt} onChange={onChange} />
                    </FilterSection>
                </>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} disabled={searching || !searchInput?.education_level} />
                </ButtonsSecion>
            </form>
            <>
                {
                    creditRequired > 0 &&
                    <>
                        {template === ""
                            ? <AttentionBox title={"No dues reminder template yet"} dismissable={false}
                                description={`No. of students : ${creditRequired}\nWrite the reminder under SMS and Communication ▸ SMS ▸ SMS Templates ▸ Fee Remainder SMS Template first — nothing can be sent without it.`} />
                            : (
                                <>
                                    <CreditsReview recipients={creditRequired} noun="students" text={template} />
                                    {/* the reminder that will be sent, and what one SMS of it costs */}
                                    {template &&
                                        <div className="mb-3">
                                            <div className="text-xs font-semibold uppercase tracking-wide text-gray-600">The reminder that will be sent</div>
                                            <p className="mt-1 whitespace-pre-wrap rounded-lg border border-gray-300 bg-white px-3 py-2 text-[0.9rem] leading-6 text-gray-900">{template}</p>
                                            <SMSLength text={template} placeholders={/\{\{[^{}]+\}\}/.test(template)} />
                                        </div>}
                                </>
                            )}
                        <Checkbox name={"Show/Hide table"} text={"Show/Hide table"} checked={showTable} onClick={toggleTable} />
                        {showTable &&
                            <BasicTable name={"Send SMS to"} data={students} columns={[
                                ['name'],
                                ...(searchInput?.balance_gt ? [["balance"]] : [])
                            ]} onSelect={() => null} showSelected={false} />
                        }
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={sendDuesSMS} disabled={uploading || !creditRequired || template === ""}>
                                Send dues sms
                            </Button>
                        </ButtonsSecion>
                    </>
                }
            </>
        </>
    )
}

export default SMSDuesReminder;