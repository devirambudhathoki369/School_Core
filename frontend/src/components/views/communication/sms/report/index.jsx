import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Typography } from "@material-tailwind/react";
import { ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";

import Loader from "@/components/Loader";
import EmptyState from "@/components/EmptyState";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { OPTION_ALL, SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import TableHeaderFooter from "@/components/tables/TableHeaderFooter";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __search } from "@/services/functions";

const APIPath = "/api/sms/report";

// Must match main/models/SMSLog.py.
const SMS_TYPES = [
    OPTION_ALL,
    { value: 1, name: "Bulk SMS" },
    { value: 2, name: "Dues Reminder" },
    { value: 3, name: "Attendance" },
    { value: 4, name: "Staff SMS" },
    { value: 5, name: "Birthday" },
    { value: 6, name: "Payment" },
    { value: 7, name: "Daily Collection" },
    { value: 8, name: "OTP" },
    { value: 9, name: "Other" },
];
// The gateway's own words — the same ones the provider's panel shows.
const STATUSES = [
    OPTION_ALL,
    { value: "delivered", name: "Delivered" },
    { value: "queued", name: "Queued" },
    { value: "aborted", name: "Aborted" },
    { value: "failed", name: "Failed" },
];
const VIEWS = {
    LOGWISE: 1,
    DATEWISE: 2,
    TYPEWISE: 3,
};
const VIEW_OPTIONS = [
    { value: VIEWS.LOGWISE, name: "Logwise" },
    { value: VIEWS.DATEWISE, name: "Datewise" },
    { value: VIEWS.TYPEWISE, name: "Typewise" },
];

const COLUMNS = {
    [VIEWS.LOGWISE]: [
        ["id", "ID"],
        ["receiver", "receiver"],
        ["message", "message"],
        ["type", "type"],
        ["network", "network"],
        ["credit", "credit"],
        ["status", "status"],
        ["sent_on", "send on"],
    ],
    [VIEWS.DATEWISE]: [
        ["date", "date (BS)"],
        ["count", "sms"],
        ["credit", "credit"],
    ],
    [VIEWS.TYPEWISE]: [
        ["type", "type"],
        ["count", "sms"],
        ["credit", "credit"],
    ],
};

// Below `lg` a BasicTable shows only its first two columns unless told
// otherwise — which here would be ID and Receiver, hiding the message itself.
// These are the columns worth the width on a narrow screen; the rest stay one
// tap away behind the row's expander.
const MOBILE_COLUMNS = {
    [VIEWS.LOGWISE]: ['receiver', 'message', 'sent_on'],
    [VIEWS.DATEWISE]: ['date', 'count', 'credit'],
    [VIEWS.TYPEWISE]: ['type', 'count', 'credit'],
};

/**
 * The school's own SMS log.
 *
 * Schools could previously only see what they had texted by asking us to open
 * the SMS provider's panel, which is one shared login across every school on the
 * platform. This is the same log — receiver, message, network, credit, status,
 * time — scoped to the one school asking, and it exports to Excel from the
 * table's own toolbar rather than from a separate Download button.
 */
function SMSReport() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const school = user?.profile?.school || user?.profile?.id;
    // Nepal's own day, not the server's. The API box runs on UTC, so between
    // midnight and 05:45 in Kathmandu `user.today` is still yesterday's BS date
    // — and this log is stamped by the Nepal clock, as is the 04:00 birthday job
    // that writes into it. Opening on the server's day would have shown an empty
    // page for messages that had just gone out. `today` remains the fallback for
    // a session signed in before the field existed.
    const today = user?.today_npt || user?.today || '';
    // Today on both ends, like the provider's own panel: this is opened to check
    // what just went out, and a blank range over a year of sends is a page
    // nobody reads. Every filter starts at All.
    const searchSchema = {
        from: today,
        to: today,
        sms_type: '',
        status: '',
        mobile: '',
        view: VIEWS.LOGWISE,
    };
    const [input, setInput] = useState({ ...searchSchema });
    const [data, setData] = useState([]);
    const [info, setInfo] = useState(null);
    // What the shown rows were fetched for, so the print header keeps saying the
    // truth after the inputs are edited.
    const [shown, setShown] = useState(null);
    const { searching, statusHandler } = useRequestStatus();
    // The page opens on today's log rather than on an empty canvas with a
    // Search button — see the mount effect below.
    const autoLoaded = useRef(false);

    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }
    function onReset() {
        setInput({ ...searchSchema });
    }

    const search = useCallback(async (values, { quiet = false } = {}) => {
        const view = parseInt(values?.view) || VIEWS.LOGWISE;
        const payload = {
            school,
            view,
            sms_type: values?.sms_type || '',
            status: values?.status || '',
            mobile: (values?.mobile || '').trim(),
        };
        // Whichever bounds the user filled: one of them is a real question
        // ("everything since Baishakh 1"), and sending nothing for it used to
        // pull the school's whole history while the From box still showed a date.
        if (values?.from || values?.to)
            payload['date_range'] = [values?.from || '', values?.to || ''];
        //
        statusHandler.toggleSearching(true);
        const [status, message, _data] = await __search(APIPath, payload);
        if (status === 200) {
            const rows = _data?.data || [];
            setData(rows);
            setInfo(_data?.info || null);
            // The range the SERVER read, not what is typed in the boxes: a date
            // entered as 2083-5-8 comes back as 2083-05-08, and the printed
            // header must name the days the rows actually cover.
            setShown({
                view,
                from: _data?.info?.date_from ?? values?.from ?? '',
                to: _data?.info?.date_to ?? values?.to ?? '',
            });
            // The auto-load on open must not announce an empty day; the empty
            // state below already says it, and a toast on arrival reads as an
            // error the user did not cause.
            if (rows.length < 1 && !quiet) updateNotification('', "No SMS found for this filter!");
        } else {
            setData([]);
            setInfo(null);
            setShown(null);
            if (!quiet) updateNotification(status, message);
        }
        statusHandler.toggleSearching(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [school]);

    async function onSearch(e) {
        e.preventDefault();
        await search(input);
    }

    // Open on today's messages. `user.today` arrives a tick after the user, so
    // this waits for it — without the date the request would fall back to the
    // whole history, which is the one thing the cap exists to avoid.
    useEffect(() => {
        if (autoLoaded.current || !school || !today) return;
        autoLoaded.current = true;
        setInput(state => ({ ...state, from: state.from || today, to: state.to || today }));
        search({ ...searchSchema, from: today, to: today }, { quiet: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [school, today]);

    const view = shown?.view || VIEWS.LOGWISE;
    const totals = (
        <>
            <TableHeaderFooter label={"Total SMS"} value={info?.total_sms ?? 0} />
            <TableHeaderFooter label={"Total Credit"} value={info?.total_credit ?? 0} />
        </>
    );
    return (
        <>
            <form onSubmit={onSearch}>
                <Section title={"SMS Log"}
                    description={"Every message this school has sent, as the SMS gateway reported it."}>
                    <TextInput value={input?.from} onChange={onChange} input={{
                        name: 'from', label: 'From (BS)', mask: 'date', placeholder: 'YYYY-MM-DD'
                    }} />
                    <TextInput value={input?.to} onChange={onChange} input={{
                        name: 'to', label: 'To (BS)', mask: 'date', placeholder: 'YYYY-MM-DD'
                    }} />
                    <TextInput value={input?.mobile} onChange={onChange} input={{
                        name: 'mobile', label: 'Mobile', placeholder: 'Any part of the number'
                    }} />
                    {/* All six fields are direct children of the section's own
                        grid, so they behave like every other form in the app:
                        one column on a phone, three across from `sm` up. They
                        were in a FilterSection, whose 176px label column ate a
                        quarter of the row and left the selects reading
                        "Select SMS Ty…" on a laptop. */}
                    <SelectInput value={input?.sms_type} onChange={onChange} input={{
                        name: 'sms_type', label: 'SMS type', options: SMS_TYPES
                    }} />
                    <SelectInput value={input?.status} onChange={onChange} input={{
                        name: 'status', label: 'Status', options: STATUSES
                    }} />
                    <SelectInput value={input?.view} onChange={onChange} input={{
                        name: 'view', label: 'View', options: VIEW_OPTIONS
                    }} />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                    <FormSaveButton isUpdate={false} isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
            <div className="mt-5">
                {searching ? <Loader /> :
                    data?.length > 0 ?
                        <>
                            <BasicTable name={"SMS Report"} data={data} columns={COLUMNS[view]}
                                showSelected={false} print allowExport
                                mobileColumns={MOBILE_COLUMNS[view]}
                                header={
                                    <>
                                        {(shown?.from || shown?.to) &&
                                            <Typography variant="small" className="text-center mb-2 text-black">
                                                {shown?.from &&
                                                    <><span className="font-semibold">From</span> : {shown.from}&nbsp;&nbsp;</>}
                                                {shown?.to &&
                                                    <><span className="font-semibold">To</span> : {shown.to}</>}
                                            </Typography>
                                        }
                                        {totals}
                                    </>
                                }
                                footer={totals}
                                loading={searching} />
                            {info?.truncated &&
                                <Typography variant="small" className="mt-2 text-red-600">
                                    Showing the latest {info?.limit} messages of {info?.total_sms}.
                                    Narrow the date range to see the rest.
                                </Typography>
                            }
                        </>
                        :
                        <EmptyState icon={ChatBubbleLeftRightIcon}
                            title={"No SMS in this range"}
                            hint={(shown?.from && shown?.from === shown?.to)
                                ? `Nothing was sent on ${shown.from}. Widen the date range to see earlier messages.`
                                : "No message matches these filters. Try a wider date range, or set the filters back to All."} />
                }
            </div>
        </>
    )
}

export default SMSReport;
