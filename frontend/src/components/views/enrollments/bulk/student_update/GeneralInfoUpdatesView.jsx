import { TextInput } from "@/components/inputs";
import BloodGroupInput from "@/components/inputs/BloodGroupInput";
import HeaderCard from "@/components/tables/HeaderCard";
import RowCard from "@/components/tables/RowCard";
import { Typography } from "@material-tailwind/react";
import { UPDATE_TYPES } from "./configs";

function GeneralInfoUpdatesView({ headers, data, onChange, onBlur }) {
    const grid = headers?.length || 1;
    return (
        <>
            <HeaderCard grid={grid} className={"bg-table-header"}>
                {
                    headers.map((header, hi) => (
                        <span className="font-semibold" key={hi}>{header}</span>
                    ))
                }
            </HeaderCard>
            {
                data.students?.map((student) => (
                    <RowCard key={student.id} grid={grid} className={"rounded-none bg-teal-100"}>
                        <Typography variant="paragraph"
                            color="blue-gray"
                            className="font-normal capitalize">
                            {student.name}
                        </Typography>
                        <>
                            <span className="flex items-stretch gap-x-1">
                                <TextInput error={data.errors?.emis}
                                    value={data.updateForm[student.id]?.emis}
                                    onChange={({ name, value }) => {
                                        onChange(student.id, name, value);
                                    }} onBlur={onBlur}
                                    input={{ name: 'emis', label: 'EMIS', hideLabel: true }} />
                            </span>
                            <span className="flex items-stretch gap-x-1">
                                <TextInput error={data.errors?.guardian_name}
                                    value={data.updateForm[student.id]?.guardian_info?.guardian_name}
                                    onChange={({ name, value }) => {
                                        onChange(student.id, name, value, UPDATE_TYPES.guardian_info);
                                    }} onBlur={onBlur}
                                    input={{ name: 'guardian_name', label: 'Guardian Name', hideLabel: true }} />
                            </span>
                            <span>
                                <TextInput error={data.errors?.guardian_contact}
                                    value={data.updateForm[student.id]?.guardian_info?.guardian_contact}
                                    onChange={({ name, value }) => {
                                        onChange(student.id, name, value, UPDATE_TYPES.guardian_info);
                                    }} onBlur={onBlur}
                                    input={{ name: 'guardian_contact', label: 'Guardian Contact', hideLabel: true }} />
                            </span>
                            <span>
                                <TextInput error={data.errors?.guardian_location}
                                    value={data.updateForm[student.id]?.guardian_info?.guardian_location}
                                    onChange={({ name, value }) => {
                                        onChange(student.id, name, value, UPDATE_TYPES.guardian_info);
                                    }} onBlur={onBlur}
                                    input={{ name: 'guardian_location', label: 'Guardian Location', hideLabel: true }} />
                            </span>
                            <span>
                                <TextInput error={data.errors?.contact}
                                    value={data.updateForm[student.id]?.contact}
                                    onChange={({ name, value }) => {
                                        onChange(student.id, name, value);
                                    }} onBlur={onBlur}
                                    input={{ name: 'contact', label: 'Contact', hideLabel: true }} />
                            </span>
                            <span>
                                <TextInput error={data.errors?.location}
                                    value={data.updateForm[student.id]?.location}
                                    onChange={({ name, value }) => {
                                        onChange(student.id, name, value);
                                    }} onBlur={onBlur}
                                    input={{ name: 'location', label: 'Location', hideLabel: true }} />
                            </span>
                            <span>
                                <TextInput error={data.errors?.birth_date}
                                    value={data.updateForm[student.id]?.birth_date}
                                    onChange={({ name, value }) => {
                                        onChange(student.id, name, value);
                                    }} onBlur={onBlur}
                                    input={{ name: 'birth_date', label: 'DOB (BS)', hideLabel: true }} />
                            </span>
                            <span>
                                <BloodGroupInput error={data.errors?.blood_group}
                                    value={data.updateForm[student.id]?.other_info?.blood_group}
                                    onChange={({ name, value }) => {
                                        onChange(student.id, name, value, UPDATE_TYPES.other_info);
                                    }} onBlur={onBlur} />
                            </span>
                        </>
                    </RowCard>
                ))
            }
        </>
    )
}

export default GeneralInfoUpdatesView;