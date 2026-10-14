import { deleteBusStation, fetchBusStations, saveBusStation } from "@/services/functions/busStations";
import { createContext, useContext, useEffect, useState } from "react";
import { useAppContext } from "./AppContext";
import busStationSchema from "@/schemas/bus-station";
import busStationValidationSchema from "@/schemas/validations/bus-station";
import useRequestStatus from "@/hooks/requestStatus";


const BusStationContext = createContext({});

export function useBusStation() {
    return useContext(BusStationContext);
}

export default function BusStationProvider({ children }) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    busStationSchema['school'] = user?.profile?.school || user?.profile?.id;
    const [form, setForm] = useState(() => ({ ...busStationSchema }));
    const [errors, setErrors] = useState([]);
    const [stations, setStations] = useState([]);
    const [locations, setLocations] = useState([]);
    const { uploading, statusHandler } = useRequestStatus();
    // 
    function onChange({ name, value }) {
        setForm(state => ({ ...state, [name]: value }));
    }
    async function onBlur({ name, value }) {
        try {
            await busStationValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }
    function onLocationSelect({ latitude, longitude }) {
        setForm(state => ({ ...state, latitude, longitude }));
    }
    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        try {
            await busStationValidationSchema.validate(form);
            const [status, message, data] = await saveBusStation(form);
            updateNotification(status, message);
            if (status === 200) {
                // after-new-entry
                if (data?.station) setStations(state => [data.station, ...state]);
                // after-update;
                else if (form?.id) {
                    const { station, fee, latitude, longitude } = form;
                    setStations(state =>
                        [...state
                            .map(item =>
                                item.id === form.id ? { ...item, station, fee, latitude, longitude } : item)
                        ]);
                }
                setForm({ ...busStationSchema });
            }
        } catch ({ message }) {
            updateNotification('', message);
            // console.log(e.message);
        }
        statusHandler.toggleUploading();
    }
    async function onEdit(id) {
        const item = stations.reduce((acc, _station) => {
            if (_station.id === id) {
                // carry the saved pin too, so the form shows it and a
                // re-pick replaces it instead of looking like it was never set
                const { station, fee, latitude, longitude } = _station;
                acc = { station, fee, id, latitude: latitude ?? '', longitude: longitude ?? '' };
            }
            return acc;
        }, {});
        setForm({ ...busStationSchema, ...item });
    }
    async function onDelete(id) {
        const [status, message, _] = await deleteBusStation(id, user?.profile?.school || user?.profile?.id);
        updateNotification(status, message);
        if (status === 200) {
            setStations(state => [...state.filter(item => item.id != id)]);
        }
    }
    function extractLocations(stations) {
        return (stations || []).reduce((acc, station) => {
            const { latitude, longitude, station: name } = station;
            const lat = parseFloat(latitude), lng = parseFloat(longitude);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                acc.push({ lat, lng, name });
            }
            return acc;
        }, []);
    }
    // keep the green map pins in step with the list after saves/deletes
    useEffect(() => {
        setLocations(extractLocations(stations));
    }, [stations]);
    // 
    useEffect(() => {
        (async () => {
            const stations = await fetchBusStations(user?.profile?.school || user?.profile?.id);
            const _locations = extractLocations(stations);
            setLocations(_locations);
            setStations(stations);
        })();
    }, []);
    // 
    return (
        <BusStationContext.Provider value={{
            data: { form, errors, stations, locations },
            methods: { onChange, onBlur, onLocationSelect, onSave, onEdit, onDelete },
            status: { uploading }
        }}>
            {children}
        </BusStationContext.Provider>
    )
}