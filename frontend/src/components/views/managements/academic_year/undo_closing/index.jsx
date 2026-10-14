import { SearchInput } from "@/components/inputs";
import { Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { customAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import useMappedAcademicYears from "@/hooks/useMappedAcademicYears";
import { __fetch, __save } from "@/services/functions";
import { fetchSchools } from "@/services/functions/schools";
import { useEffect, useState } from "react";

const API_PATH = "/api/academic_year/closing/undo";
const undoAction = customAction({ text: "Undo", action: 'undo_close', icon: null, tooltip: "Undo closed academic year" });

const schema = { school: '' };
function UndoAcademicYearClosing() {
    const { notification: { updateNotification } } = useAppContext();
    const { extractKey } = useMappedAcademicYears();
    const [data, setData] = useState({ ...schema });
    const [schools, setSchools] = useState([]);
    const [closedAcademicYears, setClosedAcademicYears] = useState([]);
    const { fetching, uploading, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setData(state => ({ ...state, [name]: value }));
    }

    function onClick(action, id, item) {
        if (action === undoAction.action) {
            // console.log(item);
            if (item?.previous_academic_year) {
                undoCloseAcademicYear(item);
            }
        }
    }

    async function undoCloseAcademicYear(academic_year_mapping) {
        const class_details = (academic_year_mapping?.keys || []).map(key => extractKey(key));
        const uploadData = {
            school: data.school,
            ...academic_year_mapping,
            classes: class_details,
        };
        statusHandler.toggleUploading();
        const [status, msg] = await __save(API_PATH, uploadData);
        updateNotification(status, msg);
        statusHandler.toggleUploading();
    }

    useEffect(() => {
        async function fetchSchoolData() {
            const schools = await fetchSchools({}, true);
            if (schools?.length > 0) setSchools(schools);
        }

        fetchSchoolData();
    }, []);

    useEffect(() => {
        async function fetchClosedAcademicYears(schoolId) {
            statusHandler.toggleFetching();
            const _years = await __fetch(API_PATH, { school: schoolId });
            setClosedAcademicYears(_years);
            statusHandler.toggleFetching();
        }
        if (data?.school) {
            fetchClosedAcademicYears(data?.school);
        }
    }, [data?.school]);

    return (
        <>
            <Section>
                <SearchInput input={{ name: "school", label: "School", options: schools }} value={data?.school} onChange={onChange} />
            </Section>
            <BasicTable name={"Closed Academic Years"} data={closedAcademicYears} columns={[
                ['academic_year_name', 'Current Academic Year'],
                ['previous_academic_year_name', "Previous Academic Year"],
                ["keys"],
            ]} actions={[undoAction]} loading={fetching} showSelected={false}
                onSelect={onClick} disabled={uploading} />
        </>
    )
}

export default UndoAcademicYearClosing;