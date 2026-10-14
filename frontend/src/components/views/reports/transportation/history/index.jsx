import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { OPTION_ALL, SearchInput, SelectInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import ClassPicker from "@/components/inputs/ClassPicker";
import classPickerSchema from "@/schemas/class-picker";
import { ButtonsSecion, FilterSection, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { fetchBusStations } from "@/services/functions/busStations";
import cleanClassInfo from "@/methods/cleanClassInfo";
import cleanEmptyFields from "@/methods/cleanEmptyFields";
import { __search } from "@/services/functions";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";

// Mirror the Transactions-History form layout: ClassPicker on top, then a
// FilterSection below holding all secondary filters (Station, Include
// contacts, Active status). Keeps inputs grid-aligned on desktop and
// stacks cleanly on mobile.
const extraSchema = {
    station: '',
    include_contact: '',
    is_active: 'true',
};
const searchSchema = { ...classPickerSchema, ...extraSchema, school: '' };

function TransportationHistory() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    searchSchema.school = user?.profile?.school || user?.profile?.id;
    const [stations, setStations] = useState([]);
    const [input, setInput] = useState({ ...searchSchema });
    const [data, setData] = useState([]);
    const { searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }
    function onReset() {
        setInput({
            ...searchSchema,
            school: user?.profile?.school || user?.profile?.id,
        });
        setData([]);
    }

    function cleanedSearchInput() {
        const inp = { ...cleanClassInfo(input) };
        inp.is_active = inp?.is_active === 'true' || inp?.is_active === true;
        inp.include_station = true;
        inp.station_name = true;
        inp.strict = true;
        return cleanEmptyFields(inp, ['is_active', 'include_station', 'station_name', 'strict']);
    }

    async function onSearch(e) {
        e.preventDefault();
        if (!input?.education_level && !input?.station) {
            updateNotification(400, 'Pick an education level or a station first!');
            return;
        }
        statusHandler.toggleSearching();
        const payload = cleanedSearchInput();
        const [status, message, _data] = await __search('/api/search/students', payload);
        if (_data?.length > 0) {
            setData(_data);
        } else {
            setData([]);
            updateNotification(status || '', message || 'No data found!');
        }
        statusHandler.toggleSearching();
    }

    useEffect(() => {
        if (user?.profile) {
            (async () => {
                const schoolId = user?.profile?.school || user?.profile?.id;
                const stations = await fetchBusStations(schoolId, true);
                setStations(stations);
            })();
        }
    }, [user?.profile]);

    return (
        <>
            <form onSubmit={onSearch}>
                <Section>
                    <ClassPicker data={input} onChange={onChange} classwise={true} />
                    <FilterSection title={"Filters"}>
                        <div className="grid grid-cols-1 sm:grid-cols-12 w-full gap-x-1 gap-y-2 items-end">
                            <SearchInput input={{ name: 'station', label: 'Station', options: [OPTION_ALL, ...stations] }}
                                value={input?.station} onChange={onChange} />
                            <SelectInput value={input?.is_active} onChange={onChange}
                                input={{
                                    name: 'is_active', label: 'Active status',
                                    options: [
                                        { value: true, name: 'Active' },
                                        { value: false, name: 'Inactive' },
                                    ]
                                }} />
                            <div className="sm:col-span-4 flex items-end">
                                <Checkbox name={"include_contact"} onClick={() => {
                                    onChange({ name: "include_contact", value: !input?.include_contact });
                                }} checked={input?.include_contact}
                                    text={"Include contacts"} />
                            </div>
                        </div>
                    </FilterSection>
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                    <FormSaveButton searching={searching} isSearch={true} />
                </ButtonsSecion>
            </form>
            <>
                {searching ? <Loader /> :
                    <div className="mt-3">
                        {data?.length > 0 ?
                            <BasicTable name={"Transportation report"} data={data} columns={[
                                ['name'],
                                ['bus_station', 'Station'],
                                ['start_date', 'Start date'],
                                ...(input?.include_contact ?
                                    [["self_contact", "Self Contact"], ["guardian_contact", "Guardian's Contact"]] : []),
                            ]} print={true} onSelect={() => null} showSelected={false} allowExport={true} /> :
                            <NotFound />
                        }
                    </div>
                }
            </>
        </>
    )
}

export default TransportationHistory;
