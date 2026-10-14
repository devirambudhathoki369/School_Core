import { SelectInput, TextInput } from "@/components/inputs";
import HeaderCard from "@/components/tables/HeaderCard";
import RowCard from "@/components/tables/RowCard";
import { Typography } from "@material-tailwind/react";
import { UPDATE_TYPES } from "./configs";

function TransportationUpdatesView({ headers, data, onChange, onBlur }) {
    return (
        <>
            <HeaderCard grid={3} className={"bg-table-header"}>
                {
                    headers.map((header, hi) => (
                        <span className="font-semibold" key={hi}>{header}</span>
                    ))
                }
            </HeaderCard>
            {
                data.students?.map((student) => (
                    <RowCard key={student.id} grid={3} className={"rounded-none bg-teal-100"}>
                        <Typography variant="paragraph"
                            color="blue-gray"
                            className="font-normal capitalize">
                            {student.name}
                        </Typography>
                        <>
                            <span className="flex items-stretch gap-x-1">
                                <SelectInput error={data.errors?.bus_station}
                                    value={data.updateForm[student.id]?.transportation_info?.bus_station}
                                    onChange={({ name, value }) => {
                                        onChange(student.id, name, value, UPDATE_TYPES.transportation_info);
                                    }} onBlur={onBlur}
                                    input={{ name: 'bus_station', label: 'Bus station', options: data?.stations || [], hideLabel: true }} />
                            </span>
                            <span>
                                <TextInput error={data.errors?.start_date}
                                    value={data.updateForm[student.id]?.transportation_info?.start_date}
                                    onChange={({ name, value }) => {
                                        onChange(student.id, name, value, UPDATE_TYPES.transportation_info);
                                    }} onBlur={onBlur}
                                    input={{ name: 'start_date', label: 'Start date (BS)', hideLabel: true, placeholder: 'Enter start date (BS)' }} />
                            </span>
                        </>
                    </RowCard>
                ))
            }
        </>
    )
}

export default TransportationUpdatesView;