import { useEffect, useState } from "react";
import { SearchInput } from ".";
import { useAppContext } from "@/contexts/AppContext";
import { fetchBusStations } from "@/services/functions/busStations";

function BusStationInput({ input, value, error, onChange, onBlur }) {
    const { user: { user } } = useAppContext();
    const [stations, setStations] = useState([]);
    useEffect(() => {
        if (user?.profile) {
            (async () => {
                const stations = await fetchBusStations(user?.profile?.school || user?.profile?.id, true);
                setStations(stations);
            })();
        }
    }, [user?.profile]);
    return (
        <SearchInput input={{ ...input, options: stations }} value={value} error={error} onChange={onChange} onBlur={onBlur} />
    )
}

export default BusStationInput;