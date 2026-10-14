import { __delete, __fetch, __fetchAsOptions, __save, __update } from ".";

const STATIONS_API = "/api/stations";

async function fetchBusStations(school_id, as_options = '') {
    if (as_options) return __fetchAsOptions(STATIONS_API,
        { school: school_id },
        { name: 'station' });
    return __fetch(STATIONS_API, { school: school_id, as_options });
}

/**
 * save if data doesn't consist id;
 * edit if data consists id;
 */
async function saveBusStation(data) {
    if (data?.id) return __update(STATIONS_API, data);
    else return __save(STATIONS_API, data);
}

async function deleteBusStation(bus_station_id, school_id) {
    return __delete(STATIONS_API, { id: bus_station_id, school: school_id });
}

export { fetchBusStations, saveBusStation, deleteBusStation };