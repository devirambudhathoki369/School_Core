import AttentionBox from "@/components/AttentionBox";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import ClassPicker from "@/components/inputs/ClassPicker";
import STAFF_STATUS_OPTIONS from "@/components/inputs/options/staff_status";
import { ButtonsSecion, FilterSection, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { DEVICES_API_PATH, RFID_USERS_API_PATH } from "@/components/views/rfid/constants";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import cleanClassInfo from "@/methods/cleanClassInfo";
import { __fetch, __save } from "@/services/functions";
import { searchStaffs } from "@/services/functions/staffs";
import { searchStudents } from "@/services/functions/students";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";

// Students/Staffs to RFID users with rfid card numbers
const studentSearchFormState = {
    first_name: '', middle_name: '', last_name: '', status: '',
    class_info: '', // class_info_id
    education_level: null, grade: null, faculty: '', year: null, semester: null, course: null, school: '',
    academic_year: '',
}
const staffSearchFormState = {
    first_name: '', middle_name: '', last_name: '', status: '1', school: '',
};
// 
const uploadSchema = {
    school: '', device: '', users: [],
};
const Modes = { STUDENT: 1, STAFF: 2 };
const ModesOptions = Object.entries(Modes).map(([name, value]) => ({ name, value }));

function RFIDUsersSetup({ }) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    studentSearchFormState['school'] = schoolId;
    staffSearchFormState['school'] = schoolId;
    uploadSchema['school'] = schoolId;

    const [devices, setDevices] = useState([]);
    const [mode, setMode] = useState('');
    const [data, setData] = useState({ ...uploadSchema });
    const { fetching, searching, uploading, statusHandler } = useRequestStatus();

    function onModeChange({ name, value }) {
        setMode(parseInt(value));
        setData({ ...uploadSchema });
        onStudentsSearchFormReset();
        onStaffSearchFormReset();
    }

    // students search
    const [studentSearch, setStudentSearch] = useState(() => ({ ...studentSearchFormState }));
    const [studentClasses, setStudentClasses] = useState({});
    const [students, setStudents] = useState([]);
    // staffs search
    const [staffSearch, setStaffSearch] = useState(() => ({ ...staffSearchFormState }));
    const [staffs, setStaffs] = useState([]);

    function onChange({ name, value }) {
        if (name === "device") {
            setData(state => ({
                ...state, [name]: value,
                users: state.users.map(e => ({ ...e, device: value }))
            }));
            return;
        }
    }
    function onStudentSearchFormChange({ name, value }) {
        if (value === studentSearch?.[name]) value = null;
        setStudentSearch(state => ({ ...state, [name]: value }));
    }
    function onStaffSearchFormChange({ name, value }) {
        if (value === staffSearch?.[name]) value = null;
        setStaffSearch(state => ({ ...state, [name]: value }));
    }
    async function onSearchStudents() {
        if (!studentSearch?.first_name && !studentSearch?.education_level) {
            updateNotification(400, "Name or Education Level is required!");
            return;
        }
        statusHandler.toggleFetching();
        const [, , data] = await searchStudents({
            ...cleanClassInfo(studentSearch),
            detailed: false,
            // bring back any card already stored on the profile so it
            // pre-fills (and stays editable) in the table below.
            include_rfid_card: true,
        });
        if (!data?.length) {
            updateNotification(404, "No students found!")
            return;
        }
        const classes = {};
        data?.map(std => {
            classes[std['id']] = std['class_info'];
        });
        statusHandler.toggleFetching();
        setStudentClasses(classes);
        //
        setStudents(data);
        setData(state => ({
            ...state,
            users: data.map(({ id: student, class_info: class_id, name, rfid_card }) => ({ student, class_id, name, card: rfid_card || '' }))
        }));
    }
    async function onSearchStaffs() {
        statusHandler.toggleFetching();
        const [, , data] = await searchStaffs({ ...staffSearch, include_rfid_card: true });
        statusHandler.toggleFetching();
        if (!data?.length) {
            updateNotification(404, "No staffs found!")
            return;
        }
        setStaffs(data);
        setData(state => ({
            ...state,
            users: data.map(({ id: staff, name, rfid_card }) => ({ staff, name, card: rfid_card || '' }))
        }));
    }
    function onStudentsSearchFormReset() {
        setStudentSearch({ ...studentSearchFormState });
        setStudents(null);
    }
    function onStaffSearchFormReset() {
        setStaffSearch({ ...staffSearchFormState });
        setStaffs(null);
    }
    // users enrollment
    function onTableChange(index, col, value) {
        setData(state => {
            const ns = { ...state };
            ns.users = [...(ns.users || [])];

            if (ns.users[index]) {
                ns.users[index] = {
                    ...ns.users[index],
                    [col]: value,
                };
            }

            return ns;
        });
    }
    async function onEnrollUsers(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const uploadData = { ...data };
        if (mode === Modes.STUDENT) {
            uploadData.users = (uploadData.users || []).filter(e => e?.card);
        }
        const [status, msg, resData] = await __save(RFID_USERS_API_PATH, uploadData);
        updateNotification(status, msg);
        // 
        if (status === 200) resetForm();
        statusHandler.toggleUploading();
    }
    function resetForm() {
        setData({ ...uploadSchema });
    }
    // RFID readers type the card digits and end with an Enter keypress; that Enter
    // would submit the form and auto-save the scan. Block Enter-to-submit everywhere
    // in the form so a scan only FILLS the card cell — saving stays a deliberate
    // action. We block Enter even on buttons, because if focus happens to land on the
    // Save button when the reader fires its trailing Enter the scan would otherwise
    // submit. Manual entry is unaffected (typing never sends Enter), and Save still
    // works by mouse click (and by Space, the standard button-activation key).
    function blockEnterSubmit(e) {
        if (e.key === 'Enter') e.preventDefault();
    }

    useEffect(() => {
        async function searchSchoolDevices(schoolId) {
            statusHandler.toggleSearching();
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
                // Not an error — card numbers can still be saved to the
                // profiles and synced once a device is registered.
                updateNotification(200, "No devices registered yet — you can still save card numbers.");
            }
            statusHandler.toggleSearching();
        }

        if (studentSearch?.school) searchSchoolDevices(studentSearch.school);
    }, [studentSearch?.school]);

    return (
        <div>
            <AttentionBox title={"Registered devices"} description={`${devices?.length || 0} devices found!`} />
            <Section>
                <SelectInput input={{ name: 'mode', label: "Mode", options: ModesOptions }} value={mode} onChange={onModeChange} />
            </Section>
            {mode === Modes.STUDENT ?
                <>
                    {/* student search */}
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        onSearchStudents(e);
                        onStudentsSearchFormReset();
                    }}>
                        <ClassPicker data={studentSearch} onChange={onStudentSearchFormChange} classwise={true} />
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={onStudentsSearchFormReset}>Reset</Button>
                            <FormSaveButton isSearch={true} searching={fetching} />
                        </ButtonsSecion>
                    </form>
                    {/* rfid card numbers entry */}
                    {students?.length ?
                        <form onSubmit={onEnrollUsers} onKeyDown={blockEnterSubmit}>
                            <BasicTable loading={searching} name={"Students"} onSelect={() => null}
                                data={data?.users || []}
                                columns={COLS?.[Modes.STUDENT]} editable={true} editableColumns={EDITABLE_COLS} onChange={onTableChange}
                            />
                            <Section>
                                <SearchInput input={{ name: 'device', label: "Device (optional)", options: devices }} onChange={onChange} value={data?.device} />
                            </Section>
                            <ButtonsSecion>
                                <FormSaveButton saving={uploading} disabled={uploading} />
                            </ButtonsSecion>
                        </form> :
                        <></>
                    }
                </> : <></>
            }
            {mode === Modes.STAFF ?
                <>
                    {/* staffs search */}
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        onSearchStaffs(e);
                        onStaffSearchFormReset();
                    }}>
                        <Section>
                            <FilterSection title={"Staff's Info"}>
                                <div className="grid grid-cols-1 sm:grid-cols-12 w-full gap-x-1">
                                    <TextInput input={{ name: 'first_name', label: 'First Name' }} value={staffSearch?.first_name} onChange={onStaffSearchFormChange} />
                                    <TextInput input={{ name: 'middle_name', label: 'Middle Name' }} value={staffSearch?.middle_name} onChange={onStaffSearchFormChange} />
                                    <TextInput input={{ name: 'last_name', label: 'Last Name' }} value={staffSearch?.last_name} onChange={onStaffSearchFormChange} />
                                </div>
                                <div>
                                    {
                                        true ?
                                            <SelectInput input={{ name: 'status', label: 'Status', options: STAFF_STATUS_OPTIONS }}
                                                value={staffSearch?.status} onChange={onStaffSearchFormChange} /> : <></>
                                    }
                                </div>
                            </FilterSection>
                        </Section>
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={onStaffSearchFormReset}>Reset</Button>
                            <FormSaveButton isSearch={true} searching={fetching} />
                        </ButtonsSecion>
                    </form>
                    {/* staffs to rfid device */}
                    {staffs?.length ?
                        <form onSubmit={onEnrollUsers} onKeyDown={blockEnterSubmit}>
                            <BasicTable loading={searching} name={"Staffs"} onSelect={() => null}
                                data={data?.users || []}
                                columns={COLS?.[Modes.STAFF]} editable={true} editableColumns={EDITABLE_COLS} onChange={onTableChange}
                            />
                            <Section>
                                <SearchInput input={{ name: 'device', label: "Device (optional)", options: devices }} onChange={onChange} value={data?.device} />
                            </Section>
                            <ButtonsSecion>
                                <FormSaveButton saving={uploading} disabled={uploading} />
                            </ButtonsSecion>
                        </form> :
                        <></>
                    }
                </> : <></>
            }
        </div>
    )
}

const COLS = {
    [Modes.STUDENT]: [
        ['name'],
        ['card', "RFID Card No."],
    ],
    [Modes.STAFF]: [
        ['name'],
        ['card', "RFID Card No."],
    ],
};
// editable card column (students + staffs)
const EDITABLE_COLS = [
    ['card'],
];

export default RFIDUsersSetup;