import AttentionBox from "@/components/AttentionBox";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import Loader from "@/components/Loader";
import { SelectInput } from "@/components/inputs";
import { PaginationSection, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { DEVICES_API_PATH, RFID_USERS_API_PATH, RFID_USERS_SYNC_PATH } from "@/components/views/rfid/constants";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { getCursor, getURL } from "@/methods/pagination";
import { __fetch, __save } from "@/services/functions";
import { Button } from "@material-tailwind/react";
import { ArrowUpOnSquareIcon, IdentificationIcon, CpuChipIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";

const Roles = { STUDENT: "student", STAFF: "staff" };
const RolesOptions = Object.entries(Roles).map(([name, value]) => ({ name, value }));

const searchSchema = { school: '', role: '', device: '' };
function RFIDAttdUsersSearchView() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    searchSchema['school'] = schoolId;

    const [devices, setDevices] = useState([]);
    const [form, setForm] = useState({ ...searchSchema });
    const [data, setData] = useState([]); // table-data
    const [pushing, setPushing] = useState(false);
    const { fetching, searching, statusHandler } = useRequestStatus();

    // The list below is what the WEB holds. Getting it onto the device is a
    // separate step that normally happens once, at enrolment — so when a
    // device is reset, swapped, or refuses an enrolment, this list and the
    // device drift apart with nothing to say so. This pushes them back
    // together. Repeating it is harmless: the device upserts on the PIN.
    async function onPushToDevice() {
        if (!form?.device || pushing) return;
        setPushing(true);
        const [status, msg] = await __save(RFID_USERS_SYNC_PATH,
            { school: schoolId, device: form.device });
        updateNotification(status, msg);
        setPushing(false);
    }

    function onChange({ name, value }) {
        setData([]); // reset if role or device changes;
        resetPage();
        setForm(state => {
            const ns = { ...state };
            ns[name] = value;
            if (name === "role") ns["device"] = '';
            return ns;
        });
    }

    useEffect(() => {
        async function searchSchoolDevices(schoolId) {
            statusHandler.toggleFetching();
            const _devices = await __fetch(DEVICES_API_PATH, { school: schoolId, as_options: true });
            if (_devices?.length > 0) {
                setDevices(
                    _devices
                        .map(({ id: value, alias, serial_number }) => ({
                            name: `${serial_number} (${alias})`,
                            value
                        }))
                );
            }
            else {
                setDevices([]);
                updateNotification(404, "No devices registered yet!");
            }
            statusHandler.toggleFetching();
        }

        if (schoolId) searchSchoolDevices(schoolId);
    }, []);

    // pagination
    const [page, setPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    async function getData() {
        const nextURL = getURL(data, page - 1, 'next');
        if (!nextURL && getURL(data, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        const cursor = getCursor(nextURL);
        statusHandler.toggleSearching();
        const res = await __fetch(RFID_USERS_API_PATH, { ...form, page, cursor });
        setData(state => ({ ...state, [page]: res }));
        statusHandler.toggleSearching();
    }
    function resetPage() {
        setPage(1);
    }

    useEffect(() => {
        (async () => {
            if (form?.device && !data?.[page]) await getData();
        })();
    }, [page, form.device]);

    const deviceCount = devices?.length || 0;
    const rows = data?.[page]?.['results'];

    return (
        <>
            <PageHeader
                icon={IdentificationIcon}
                title="Registered Users"
                subtitle="People enrolled on an attendance reader"
                meta={[{ value: deviceCount, label: deviceCount === 1 ? 'device' : 'devices' }]}
                actions={form?.device && (
                    <Button variant="text" size="sm" onClick={onPushToDevice} disabled={pushing}
                        className="flex items-center gap-x-1.5 normal-case bg-white/70 shadow-sm
                            text-gray-800 hover:bg-white">
                        <ArrowUpOnSquareIcon className="w-4 h-4" />
                        {pushing ? "Pushing…" : "Push users to device"}
                    </Button>
                )}
            />

            {fetching ? <Loader /> :
                <>
                    {!deviceCount && (
                        <AttentionBox title={"No readers registered"}
                            description={"This school has no attendance device set up yet."} />
                    )}
                    <Section title={"Choose a reader"}
                        description={"Pick the role first — the device list is filtered to it."}>
                        <SelectInput input={{ name: 'role', label: "Role", options: RolesOptions }}
                            value={form?.role} onChange={onChange} />
                        <SelectInput input={{ name: 'device', label: "Device", options: devices, readOnly: !form?.role }}
                            value={form?.device} onChange={onChange} />
                    </Section>
                </>
            }

            {!form?.device ? (
                <EmptyState tone="info" icon={CpuChipIcon}
                    title="No device selected"
                    hint="Choose a role and a device above to see everyone enrolled on it." />
            ) : searching ? (
                <Loader />
            ) : rows?.length ? (
                <>
                    <BasicTable name={''}
                        columns={COLS}
                        data={rows}
                        onSelect={() => null} showSelected={false} page={page} itemsPerPage={ITEMS_PER_PAGE} />
                    <PaginationSection page={page} setPage={setPage}
                        nextPage={getURL(data, page, 'next')} />
                </>
            ) : (
                <EmptyState icon={UserGroupIcon}
                    title="Nobody enrolled on this reader yet"
                    hint="Add people in Users Setup — search them, give each a card number, and save against this device." />
            )}
        </>
    )
}

const COLS = [
    ['pin'],
    ['user_name', "Name"],
    ['card', "Card No."],
];

export default RFIDAttdUsersSearchView;