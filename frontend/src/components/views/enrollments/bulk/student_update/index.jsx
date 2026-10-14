import ClassPicker from "@/components/inputs/ClassPicker";
import { useCallback, useEffect, useState } from "react";
import classPickerSchema from "@/schemas/class-picker";
import { ButtonsSecion, FilterSection, Section } from "@/components/sections";
import { Button } from "@material-tailwind/react";
import { SelectInput } from "@/components/inputs";
import { useAppContext } from "@/contexts/AppContext";
import { hasDifferences } from "@/methods/FlattenSchema";
import studentValidationSchema from "@/schemas/validations/student";
import { __update } from "@/services/functions";
import { searchStudents } from "@/services/functions/students";
import { fillDifferences } from "@/methods/FlattenSchema";
import { fetchBusStations } from "@/services/functions/busStations";
import { UPDATE_CONFIGS, UPDATE_OPTIONS, UPDATE_TYPES } from "./configs";
import ImagesUpdateView from "./ImagesUpdateView";
import EXTRACTORS from "./extractors";
import cleanClassInfo from "@/methods/cleanClassInfo";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import IdentityUpdatesView from "./IdentityUpdatesView";
import TransportationUpdatesView from "./TransportationUpdatesView";
import GeneralInfoUpdatesView from "./GeneralInfoUpdatesView";
import clone from "@/methods/clone";

const CSV_INDEXES = {
    ROLL_NO: 0,
    SYMBOL_NO: 1,
    REGISTRATION_NO: 2,
};

function BulkStudentUpdate() {
    const { user: { user },
        fiscalYear: { year },
        notification: { updateNotification },
        prompt: { toggleConfirmationPrompt } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    // 
    classPickerSchema['school'] = schoolId;
    classPickerSchema['academic_year'] = year?.academic_year;
    const [searchInput, setSearchInput] = useState(() => ({ ...classPickerSchema }));
    const [students, setStudents] = useState([]);
    const [studentsBackup, setStudentsBackup] = useState([]);
    const [updateForm, setUpdateForm] = useState({});
    const [updateFormBackup, setUpdateFormBackup] = useState({});
    const [updates, setUpdates] = useState([]);
    const [errors, setErrors] = useState({});
    const [updateType, setUpdateType] = useState('');
    const { searching, uploading, statusHandler } = useRequestStatus();
    // 
    function updateSearchInput({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }
    // 
    function extract(data, method) {
        if (method === undefined) return {};
        return data.reduce((acc, std) => {
            acc[std.id] = method(std);
            return acc;
        }, {});
    }
    function extractStudentDetails(data) {
        // data for updateForm, {[student.id]: {column: value, ...}}
        return extract(data, EXTRACTORS?.[updateType]);
    }
    function prepareStudentsForUpdate(students, backup = false) {
        const updateForm = extractStudentDetails([...students]);
        setUpdates(students.reduce((acc, val) => {
            if ((updateType === UPDATE_TYPES.transportation_info && val?.bus_station) ||
                (updateType === UPDATE_TYPES.image && val?.image) ||
                (updateType === UPDATE_TYPES.identity && (val?.roll_no || val?.symbol_no || val?.regd_no))) {
                acc.push(val.id);
            }
            return acc;
        }, []));
        setUpdateForm({ ...updateForm });
        if (backup) setUpdateFormBackup(clone(updateForm));
    }
    async function handleSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const include_station = true,
            include_images = false,
            include_identities = true,
            detailed = true;
        const [, , data] = await searchStudents({
            ...cleanClassInfo(searchInput),
            include_station,
            include_images,
            include_identities,
            detailed,
        });
        // 
        if (data?.length > 0) {
            prepareStudentsForUpdate(data, true);
            setStudents(data);
            setStudentsBackup(data);
        } else {
            setUpdateForm({});
            setUpdateFormBackup({});
            setStudents([]);
            setStudentsBackup([]);
        }
        statusHandler.toggleSearching();
    }
    function resetSearch() {
        setSearchInput({ ...classPickerSchema });
    }
    function reset() {
        setUpdateForm({ ...updateFormBackup });
        if (uploading === true) statusHandler.toggleUploading();
    }
    function cleanTable() {
        prepareStudentsForUpdate(studentsBackup);
    }
    function resetTable() {
        setStudents([]);
        reset();
    }
    //
    const onInputChange = useCallback((studentId, name, value, parent = null) => {
        // console.log("student", studentId, name, value, typeof value, "parent", parent);
        setUpdateForm(state => {
            const s = { ...state };
            const update = parent ? {
                [parent]: {
                    ...s[studentId][parent],
                    [name]: value
                }
            } : {
                [name]: value
            };
            s[studentId] = { ...s[studentId], ...update };
            return s;
        });
    }, []);
    async function onBlur({ name, value }) {
        try {
            await studentValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }
    function onBulkIdentityEntry(data) {
        const _updateForm = { ...updateForm };
        students.forEach((std, index) => {
            _updateForm[std.id]["roll_no"] = data?.[index]?.[CSV_INDEXES.ROLL_NO] || index + 1;
            _updateForm[std.id]["symbol_no"] = data?.[index]?.[CSV_INDEXES.SYMBOL_NO] || '';
            _updateForm[std.id]["regd_no"] = data?.[index]?.[CSV_INDEXES.REGISTRATION_NO] || '';
        });
        setUpdateForm({ ..._updateForm });
    }
    function hasInvalidInput(data) {
        let stat = false;
        for (const entry of Object.entries(data)) {
            if (entry[1]?.transportation_info?.bus_station === undefined) {
                stat = true;
                break;
            }
        }
        return stat;
    }
    /**
     * Split the photo payload into chunks that fit under the proxy's body limit.
     *
     * The previous version DROPPED a photo every time it started a new chunk:
     * the file that overflowed opened the next chunk but was never written into
     * it, so it was silently left out of the upload. With ~600KB photos and a
     * 1MB chunk that is roughly every third student — matched on screen, saved
     * with a success message, and still without a picture afterwards.
     *
     * Each file now always lands in a chunk; a new one is opened first when it
     * would not fit, and a single file larger than the limit gets a chunk of its
     * own rather than being discarded for being too big.
     */
    function splitData(data, CHUNK_SIZE_IN_MB) {
        // data => {stdId: {image: File}, ...};
        const LIMIT = CHUNK_SIZE_IN_MB * 1024 * 1024;
        const chunks = [{}];
        let size = 0;
        for (const stdId of Object.keys(data)) {
            const imageSize = data[stdId]?.image?.size || 0;
            if (size > 0 && (size + imageSize) > LIMIT) {
                chunks.push({});
                size = 0;
            }
            chunks[chunks.length - 1][stdId] = data[stdId];
            size += imageSize;
        }
        return chunks;
    }
    function autoFillRollNos() {
        const _updateForm = { ...updateForm };
        students.forEach((std, index) => {
            _updateForm[std.id]["roll_no"] = index + 1;
        });
        setUpdateForm({ ..._updateForm });
    }
    async function handleUpdateSave(e) {
        const promptData = { ask_reason: false, header: "Are you sure to update?" };
        e.preventDefault();
        promptData['onConfirm'] = async () => {
            statusHandler.toggleUploading();
            const updateURL = UPDATE_CONFIGS?.[updateType]?.URL;
            if (!updateURL) {
                updateNotification('', "Empty update type!");
                statusHandler.toggleUploading();
                return;
            }
            // console.log({ data: updateForm, school: schoolId, updates });
            // return;
            // check if there are no errors
            if (!hasDifferences(updateFormBackup, updateForm)) {
                updateNotification('', "Nothing is changed!");
                statusHandler.toggleUploading();
                return null;
            }
            let data = fillDifferences(updateFormBackup, updateForm);
            //_updates = updating student ids;
            let _updates = Object.keys(data)
                .map(id => parseInt(id)).filter(id => updates.includes(id));
            let status, message = '';
            if (updateType === UPDATE_TYPES.transportation_info) {
                if (hasInvalidInput(data)) {
                    updateNotification('', "Bus station missing? or change date from student profile only!");
                    statusHandler.toggleUploading();
                    return;
                }
                // 
                [status, message,] = await __update(updateURL, {
                    data,
                    school: schoolId,
                    updates: _updates
                });
            } else if (updateType === UPDATE_TYPES.image) {
                // 3MB per request. The origin accepts 7MB
                // (`client_max_body_size 7m` on backend.nirsabi.com), so the
                // old 1MB split was cutting a 50-photo class into five times
                // more requests than it needed — each one another chance for a
                // flaky office connection to drop half a batch. 3MB keeps a
                // wide margin for multipart overhead and still leaves the
                // biggest realistic chunk well inside the limit.
                const chunks = splitData(data, 3);
                const results = await Promise.all(
                    chunks.map(update => {
                        const _updates = Object.keys(update)
                            .map(id => parseInt(id)).filter(id => updates.includes(id));
                        return __update(updateURL, {
                            data: update,
                            school: schoolId,
                            updates: _updates,
                            images: true
                        });
                    })
                );
                // The photos go up in several requests, and only the LAST one's
                // result used to be read — so a batch where an earlier chunk
                // failed reported success and the operator moved on. Any failure
                // is now the answer for the whole save.
                const failure = results.find(([s]) => s !== 200);
                [status, message] = failure || results[results.length - 1] || ['', 'Nothing to upload!'];
            } else if (updateType === UPDATE_TYPES.identity) {
                [status, message] = await __update(updateURL, {
                    data,
                    updates: _updates,
                    school: schoolId,
                    update: UPDATE_IDENTITY,
                });
            } else if (updateType === UPDATE_TYPES.general) {
                [status, message,] = await __update(updateURL, {
                    data,
                    school: schoolId,
                    updates: _updates,
                });
            }
            // console.log(data, _updates);
            // return;
            updateNotification('', message);
            if (status === 200) {
                resetTable();
                resetSearch();
            }
            statusHandler.toggleUploading();
        }
        toggleConfirmationPrompt(promptData);
    }
    // The initial state is snapshotted from classPickerSchema on the FIRST render,
    // when the fiscal-year context may not have resolved yet — leaving
    // academic_year undefined for the whole session. Re-sync once it lands.
    useEffect(() => {
        if (!year?.academic_year) return;
        setSearchInput(state => (state.academic_year ? state
            : { ...state, academic_year: year.academic_year }));
    }, [year?.academic_year]);
    //
    const [stations, setStations] = useState([]);
    useEffect(() => {
        if (studentsBackup?.length > 0) {
            prepareStudentsForUpdate(studentsBackup);
        } else {
            setUpdateForm({});
        }
        setErrors({});
        // 
        (async () => {
            if (user?.profile && updateType === UPDATE_TYPES.transportation_info && stations?.length < 1) {
                const data = await fetchBusStations(schoolId, true);
                setStations(data);
            }
        })();
    }, [updateType, user]);
    // 
    return (
        <>
            <>
                <form onSubmit={handleSearch}>
                    <Section>
                        <FilterSection title={"Update type"}>
                            <SelectInput input={{ name: 'update_type', label: "Update Type", options: UPDATE_OPTIONS }}
                                value={updateType} onChange={({ name, value }) => {
                                    setUpdateType(value);
                                }} />
                        </FilterSection>
                        {updateType &&
                            <ClassPicker data={searchInput} onChange={updateSearchInput} classwise={true} />
                        }
                    </Section>
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={resetSearch}>Reset</Button>
                        <FormSaveButton isSearch={true} searching={searching} disabled={searching} />
                    </ButtonsSecion>
                </form>
            </>
            {searching ? <Loader /> : <>
                {
                    students?.length > 0 ?
                        <>
                            <form onSubmit={handleUpdateSave}>
                                <>
                                    {
                                        (updateType === UPDATE_TYPES.transportation_info && stations?.length > 0) &&
                                        <>
                                            <TransportationUpdatesView headers={["student's name", "bus station", "start date"]}
                                                data={{ students, errors, updateForm, stations }} onChange={onInputChange} onBlur={onBlur} />
                                        </>
                                    }
                                    {
                                        updateType === UPDATE_TYPES.image &&
                                        <>
                                            <ImagesUpdateView data={{ students, updateForm }} onChange={onInputChange} />
                                        </>
                                    }
                                    {
                                        updateType === UPDATE_TYPES.identity &&
                                        <>
                                            <IdentityUpdatesView headers={["student's name", "roll no", "symbol no", "registration no"]}
                                                data={{ students, errors, updateForm }} onChange={onInputChange} onBulkEntry={onBulkIdentityEntry}
                                                onBlur={() => null} autoFillRollNos={autoFillRollNos} />
                                        </>
                                    }
                                    {
                                        updateType === UPDATE_TYPES.general &&
                                        <>
                                            <GeneralInfoUpdatesView headers={["student's name", "emis", "guardian name", "guardian contact", "guardian location", "contact", "location", "dob (bs)", "blood group"]}
                                                data={{ students, errors, updateForm }} onChange={onInputChange} onBlur={() => null} />
                                        </>
                                    }
                                </>
                                <ButtonsSecion>
                                    <Button variant="outlined" onClick={cleanTable} disabled={uploading || studentsBackup?.length < 1}>Clean</Button>
                                    <Button variant="outlined" onClick={resetTable} disabled={uploading}>Reset</Button>
                                    <FormSaveButton isUpdate={true} saving={uploading} disabled={uploading} />
                                </ButtonsSecion>
                            </form>
                        </>
                        : <NotFound error="No students!" />
                }
            </>
            }
        </>
    )
}

const UPDATE_IDENTITY = "identity";

export default BulkStudentUpdate;