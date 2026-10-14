import { TextInput } from "@/components/inputs";
import { Section, ButtonsSecion } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import BusStationProvider, { useBusStation } from "@/contexts/BusStationContext";
import { deleteAction, editAction } from "@/components/tables/actions";
import Loader from "@/components/Loader";
import FormSaveButton from "@/components/buttons/FormSaveButton";

import dynamic from "next/dynamic";
const MapPicker = dynamic(() => import("@/components/inputs/MapPicker"));

function ManageBusStations() {
    const { data: { form, errors, stations, locations },
        methods: { onChange, onBlur, onLocationSelect, onSave, onEdit, onDelete },
        status: { uploading } } = useBusStation();

    return (
        <>
            <>
                <form onSubmit={onSave}>
                    <Section title={"Bus Station"}>
                        <>
                            <TextInput input={{ name: 'station', label: 'Bus Station' }} value={form?.station}
                                error={errors?.station} onChange={onChange} onBlur={onBlur} />
                            <TextInput input={{ name: 'fee', label: 'Fee', type: 'number' }} value={form?.fee}
                                error={errors?.fee} onChange={onChange} onBlur={onBlur} />
                            <span className="sm:col-span-4"></span>
                        </>
                        <>
                            <MapPicker locations={locations} onSelect={onLocationSelect} value={form} />
                            <TextInput input={{ name: 'latitude', label: 'Latitude', readOnly: true }}
                                value={form?.latitude} onChange={() => null} />
                            <TextInput input={{ name: 'longitude', label: 'Longitude', readOnly: true }}
                                value={form?.longitude} onChange={() => null} />
                        </>
                    </Section>
                    <ButtonsSecion>
                        <div className="col-span-11"></div>
                        <FormSaveButton isUpdate={form?.id} saving={uploading} disabled={uploading} />
                    </ButtonsSecion>
                </form>
            </>
            <>
                {
                    stations?.length > 0 ?
                        <BasicTable name={"Bus Stations"} columns={[
                            ['station'],
                            ['fee'],
                            ['latitude'], ['longitude'],
                        ]} data={stations} onSelect={(action, id) => {
                            if (action === editAction.action) onEdit(id);
                            else if (action === deleteAction.action) onDelete(id);
                        }} actions={[editAction, deleteAction]} /> :
                        <Loader />
                }
            </>
        </>
    )
}

export default function () {
    return (
        <BusStationProvider>
            <ManageBusStations />
        </BusStationProvider>
    )
}