/* 
Superadmin:
Clean Ledger posting per class;
*/

import Loader from "@/components/Loader";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SearchInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import LedgerView from "@/components/views/reports/recent_postings/LedgerView";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __fetch, __search, __update } from "@/services/functions";
import { fetchClasses } from "@/services/functions/classes";
import { getAcademicYears } from "@/services/functions/fiscalYear";
import { getLedgers } from "@/services/functions/ledgers";
import { fetchSchools } from "@/services/functions/schools";
import { useEffect, useState } from "react";

const LedgersManageAPI = "/api/ledgers/manage";
const schema = { school: '', class_info: '', classname: '', academic_year: '', ledger_posting: '' };
function CleanStudentLedgerPosting() {
    const { notification: { updateNotification }, prompt: { toggleConfirmationPrompt } } = useAppContext();
    const [data, setData] = useState({ ...schema });
    const [schools, setSchools] = useState([]);
    const [classes, setClasses] = useState({});
    const [classMap, setClassMap] = useState({});
    const [academicYears, setAcademicYears] = useState({});
    const [ledgerPostings, setLedgerPostings] = useState([]);
    const [selectedPostings, setSelectedPostings] = useState([]);
    const { fetching, searching, deleting, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setData(state => ({ ...state, [name]: value }));
        if (name === "class_info") {
            const cls = classMap?.[data.school]?.[value];
            if (cls) {
                const academic_year = cls?.academic_year || '';
                const classname = cls?.name || '';
                setData(state => ({
                    ...state, academic_year, classname,
                }));
            }
        }
    }
    function onPostingSelect(value) {
        setSelectedPostings(prevArray => {
            if (prevArray.includes(value)) {
                return prevArray.filter(id => id !== value);
            } else {
                return [...prevArray, value];
            }
        });
    }
    useEffect(() => {
        async function _fetchSchoolData() {
            statusHandler.toggleFetching();
            const schools = await fetchSchools({}, true);
            if (schools?.length > 0) setSchools(schools);
            statusHandler.toggleFetching();
        }

        _fetchSchoolData();
    }, []);

    useEffect(() => {
        setSelectedPostings([]);
        async function _fetchClasses(schoolId) {
            let data = await fetchClasses(schoolId);
            data = Object.values(data || {});
            let _classMap = {};
            data = data.reduce((acc, [, cls,]) => {
                acc.push({ value: cls.id, name: cls.name });
                _classMap[cls.id] = cls;
                return acc;
            }, []);
            setClasses(state => ({ ...state, [schoolId]: data }));
            setClassMap(state => ({ ...state, [schoolId]: _classMap }));
        }
        async function _fetchAcademicYears(schoolId) {
            let data = await getAcademicYears(schoolId, true);
            setAcademicYears(state => ({ ...state, [schoolId]: data }));
        }

        if (data?.school) {
            if (!classes?.[data.school]) _fetchClasses(data.school);
            if (!academicYears?.[data.school]) _fetchAcademicYears(data.school);
        }
    }, [data.school]);
    useEffect(() => {
        setLedgerPostings([]);
        setSelectedPostings([]);
    }, [data.class_info]);

    async function onSearchPosting(e) {
        e.preventDefault();
        setSelectedPostings([]);
        statusHandler.toggleSearching();
        // 
        let ldata = await getLedgers(data.school, '', data.class_info, data.academic_year);
        if (ldata?.length) {
            setLedgerPostings(ldata);
        } else {
            updateNotification(404, "Not found!");
        }
        statusHandler.toggleSearching();
    }

    function allowSearch() {
        return (
            data?.school && data?.class_info && data?.academic_year &&
            !searching
        )
    }
    function onReset() {
        setSelectedPostings([]);
        setData(state => ({ ...schema, school: state.school }));
    }

    async function onDeleteConfirmed(reason) {
        statusHandler.toggleDeleting();
        const deleteData = {
            school: data.school,
            academic_year: data.academic_year,
            class_info: data.class_info,
            posting_ids: selectedPostings,
            remarks: reason,
        };
        const [status, message,] = await __update(LedgersManageAPI, deleteData);
        updateNotification(status, message);
        if (status === 200) {
            onReset();
        }
        statusHandler.toggleDeleting();
    }
    async function onDeleteSelectedPostings() {
        const count = selectedPostings?.length;
        if (count > 0) {
            const promptData = { ask_reason: true, reason_required: true, };
            promptData['header'] = `Are you sure delete these ${count} postings?`;
            promptData['onConfirm'] = onDeleteConfirmed;
            toggleConfirmationPrompt(promptData);
        } else {
            updateNotification(400, "Invalid request!");
        }
    }

    return (
        <>
            <Section>
                <SearchInput input={{ name: "school", label: "School", options: schools, readOnly: (fetching || searching) }} value={data?.school} onChange={onChange} />
            </Section>
            <>
                {fetching ? <Loader /> :
                    <form onSubmit={onSearchPosting}>
                        <Section title={"Search Student Ledger Postings"}>
                            <SearchInput input={{ name: "class_info", label: "Class", options: classes?.[data.school] || [] }}
                                value={data?.class_info} onChange={onChange} />
                            <SearchInput input={{ name: "academic_year", label: "AcademicYear", options: academicYears?.[data.school] || [], readOnly: true }}
                                value={data?.academic_year} onChange={onChange} />
                        </Section>
                        <ButtonsSecion>
                            <FormSaveButton isSearch={true} searching={searching} disabled={!allowSearch()} />
                        </ButtonsSecion>
                    </form>
                }
            </>
            <>
                {ledgerPostings?.length > 0 &&
                    <form onSubmit={onDeleteSelectedPostings}>
                        <span className="my-2 text-base font-semibold">Selected Postings count : {selectedPostings.length}</span>
                        <div className={`grid grid-cols-3 justify-between w-full items-center uppercase font-semibold mb-3 p-2 rounded-md bg-blue-gray-200`}>
                            <span>Class</span>
                            <span>Date</span>
                            <span>Months</span>
                        </div>
                        {
                            ledgerPostings?.map((posting) => (
                                <LedgerView key={posting.id} ledger={posting}
                                    superAdminData={{
                                        school: data.school,
                                        academic_year: data.academic_year,
                                        className: data.classname,
                                        isChecked: selectedPostings.includes(posting.id),
                                        onSelect: onPostingSelect,
                                    }}
                                />
                            ))
                        }
                        <ButtonsSecion>
                            <FormSaveButton custom={[deleting, "Delete", "Deleting..."]} disabled={!selectedPostings?.length} />
                        </ButtonsSecion>
                    </form>
                }
            </>
        </>
    )
}

export default CleanStudentLedgerPosting;