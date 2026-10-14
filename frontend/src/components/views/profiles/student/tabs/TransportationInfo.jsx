import { TextInput } from "@/components/inputs";
import BusStationInput from "@/components/inputs/BusStationInput";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import { useStudentProfile } from "@/contexts/StudentProfile";
import { getStudentTransportations } from "@/services/functions/students";
import { Button, Switch } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import BasicTable from "@/components/tables/BasicTable";
import { fetchBusStations } from "@/services/functions/busStations";
import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import { editAction } from "@/components/tables/actions";
import { ALL_SECTIONS } from "..";

function TransportationInfoTab({ tab }) {
    const { user: { user } } = useAppContext();
    const [stations, setStations] = useState([]);
    const [fetched, setFetched] = useState(false);
    const { data: { studentBackup },
        view: { currentTab },
        transportation: { transportationForm, onTransportationInfoChange,
            setTransportationServices, transportationServices,
            onTransportationEdit, onTransportationServiceEnroll } } = useStudentProfile();
    //
    async function getStations() {
        const stations = await fetchBusStations(user?.profile?.school || user?.profile?.id, true);
        const mappings = stations.reduce((acc, val) => {
            acc[val.value] = val.name;
            return acc;
        }, {});
        setStations(stations);
        return mappings;
    }
    useEffect(() => {
        (async () => {
            // The profile renders every section at once, so `currentTab` is
            // ALL_SECTIONS, not this tab's own key — accept both, or the existing
            // services never load and the list spins forever.
            if (currentTab === tab.key || currentTab === ALL_SECTIONS) {
                const mappings = await getStations();
                let data = await getStudentTransportations(studentBackup?.ids?.sid, user?.profile?.school || user?.profile?.id);
                data = (data || []).reduce((acc, val) => {
                    val['station'] = mappings?.[val?.bus_station] || '';
                    val['active'] = val?.is_active ? 'yes' : 'no';
                    acc.push(val);
                    return acc;
                }, []);
                setTransportationServices(data);
                setFetched(true);
            }
        })();
    }, [studentBackup?.ids?.sid, currentTab]);
    // 
    return (
        <>
            <>
                <Section grid={3} title={"Transportation details"}
                    description={transportationForm?.start_date ? "Update/Stop transportation service!" : "Start transportation service!"}>
                    <BusStationInput value={transportationForm?.bus_station} onChange={onTransportationInfoChange} input={{
                        name: 'bus_station', label: 'Bus Station', options: stations
                    }} />
                    <TextInput value={transportationForm?.start_date || ''}
                        input={{ name: 'start_date', label: 'Start date (BS)' }} onChange={onTransportationInfoChange} />
                    {
                        transportationForm?.id &&
                        <div className="flex flex-col items-center justify-center">
                            <label htmlFor="is_active" className="text-sm font-medium leading-6 text-gray-900">
                                Status
                            </label>
                            <Switch checked={transportationForm?.is_active} value={transportationForm?.is_active} onChange={(e) => {
                                // console.log(e);
                                const { checked } = e.target;
                                onTransportationInfoChange({ name: "is_active", value: checked });
                            }} name="is_active" />
                        </div>
                    }
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onTransportationServiceEnroll}>{
                        transportationForm?.id ? "Update" : "Enroll"
                    }</Button>
                </ButtonsSecion>
            </>
            <>
                {transportationServices?.length > 0 ?
                    <BasicTable columns={[
                        ['station'],
                        ['start_date', 'start date'],
                        ['active']
                    ]} data={transportationServices}
                        onSelect={(action, id) => {
                            if (action === editAction.action) onTransportationEdit(id);
                        }}
                        actions={[editAction]} /> :
                    // once fetched with nothing, say so instead of spinning forever
                    (fetched ? <NotFound /> : <Loader />)
                }
            </>
        </>
    )
}

export default TransportationInfoTab;