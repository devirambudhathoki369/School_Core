import Loader from "@/components/Loader";
import { SearchInput } from "@/components/inputs";
import { Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __fetch } from "@/services/functions";
import { fetchSchools } from "@/services/functions/schools";
import { useEffect, useState } from "react";

const searchSchema = { school: '' };
function ClasswiseOldDues() {
    const [schools, setSchools] = useState([]);
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const { class: { loadClasses } } = useAppContext();
    const [data, setData] = useState(null);
    const { fetching, statusHandler } = useRequestStatus();

    function onSearchInputChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }

    useEffect(() => { 
        (async () => {
            statusHandler.toggleFetching();
            const classes = await loadClasses({
                profile: { school: searchInput.school }
            });
            // 
            const API = "/api/classwiseolddues";
            let data = await __fetch(API, { school: searchInput.school });
            if (data && classes) {
                const dues = (data?.data || []).reduce((acc, val) => {
                    acc[val.class_info] = val.total_dues;
                    return acc;
                }, {});
                data['data'] = classes.reduce((acc, cls) => {
                    const [classname, class_info, _] = cls;
                    const total_dues = dues?.[class_info.id];
                    if (total_dues) {
                        acc.push({ classname, total_dues });
                    }
                    return acc;
                }, []);
                data['data'].push({ classname: 'total', total_dues: data.total });
                setData(data);
            }
            statusHandler.toggleFetching();
        })();
    }, [searchInput.school]);

    useEffect(() => {
        (async () => {
            const data = await fetchSchools({}, true);
            setSchools(data);
        })();
    }, []);

    return (
        <div>
            <>
                <Section title={"Classwise Old dues"}>
                    <SearchInput input={{ name: 'school', label: 'School', options: schools }} value={searchInput.school} onChange={onSearchInputChange} />
                </Section>
            </>
            {
                (fetching || !data) ? <Loader /> :
                    <BasicTable name={"Classwise Old Dues"} showSelected={false} data={data?.data || []} columns={[
                        ['classname'], ['total_dues', 'total dues']
                    ]} highLightLast={true} print allowExport />
            }
        </div>
    )
}

export default ClasswiseOldDues;