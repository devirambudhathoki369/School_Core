import { SearchInput } from "@/components/inputs";
import { Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { customAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __fetch, __save } from "@/services/functions";
import { fetchSchools } from "@/services/functions/schools";
import { useEffect, useState } from "react";

const API_PATH = "/accounting/economic_year/closing/undo";
const undoAction = customAction({ text: "Undo", action: 'undo_close', icon: null, tooltip: "Undo closed academic year" });

const schema = { school: '' };
function UndoAccountingEconomicYearClosing() {
    const { notification: { updateNotification } } = useAppContext();
    const [data, setData] = useState({ ...schema });
    const [schools, setSchools] = useState([]);
    const [closedEconomicYears, setClosedEconomicYears] = useState([]);
    const { fetching, uploading, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setData(state => ({ ...state, [name]: value }));
    }

    function onClick(action, id, item) {
        if (action === undoAction.action) {
            if (item?.id) {
                undoEconomicYearClose(item.id);
            }
        }
    }

    async function undoEconomicYearClose(closed_economic_year) {
        const uploadData = {
            school: data.school,
            closed_economic_year,
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
        async function fetchClosedEconomicYears(schoolId) {
            statusHandler.toggleFetching();
            const _years = await __fetch(API_PATH, { school: schoolId, closed: true });
            setClosedEconomicYears(_years);
            statusHandler.toggleFetching();
        }
        if (data?.school) {
            fetchClosedEconomicYears(data?.school);
        }
    }, [data?.school]);
    // 
    return (
        <>
            <Section>
                <SearchInput input={{ name: "school", label: "School", options: schools }} value={data?.school} onChange={onChange} />
            </Section>
            <BasicTable name={"Closed Accounting Economic Years"} data={closedEconomicYears} columns={[
                ['name', 'Economic Year Name'],
                ['start_date', "Start Date"],
                ['end_date', "End Date"],
            ]} actions={[undoAction]} loading={fetching} showSelected={false}
                onSelect={onClick} disabled={uploading} />
        </>
    )
}

export default UndoAccountingEconomicYearClosing;