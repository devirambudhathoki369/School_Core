import { TextInput } from "@/components/inputs";
import CSVFileUpload from "@/components/inputs/CSVFileUpload";
import { ButtonsSecion } from "@/components/sections";
import HeaderCard from "@/components/tables/HeaderCard";
import RowCard from "@/components/tables/RowCard";
import { Typography, Button } from "@material-tailwind/react";

const COLS = 4;
function IdentityUpdatesView({ headers, data, onChange, onBlur, autoFillRollNos, onBulkEntry }) {
    return (
        <>
            <div className="my-2">
                <ButtonsSecion>
                    <Button variant="outlined" onClick={autoFillRollNos}>auto fill roll number</Button>
                </ButtonsSecion>
            </div>
            <CSVFileUpload hasHeaders={false} onReadComplete={onBulkEntry} />
            <HeaderCard grid={COLS} className={"bg-table-header py-3"}>
                {
                    headers.map((header, hi) => (
                        <span className="font-semibold" key={hi}>{header}</span>
                    ))
                }
            </HeaderCard>
            {
                data.students?.map((student) => (
                    <RowCard key={student.id} grid={COLS} className={"rounded-none bg-teal-100"}>
                        <Typography variant="paragraph"
                            color="blue-gray"
                            className="font-normal capitalize">
                            {student.name}
                        </Typography>
                        <>
                            <span>
                                <TextInput error={data?.errors?.roll_no}
                                    value={data.updateForm[student.id]?.roll_no}
                                    onChange={({ name, value }) => {
                                        onChange(student.id, name, value, null);
                                    }} onBlur={onBlur}
                                    input={{ name: 'roll_no', label: '', hideLabel: true }} />
                            </span>
                            <span>
                                <TextInput error={data?.errors?.symbol_no}
                                    value={data.updateForm[student.id]?.symbol_no}
                                    onChange={({ name, value }) => {
                                        onChange(student.id, name, value, null);
                                    }} onBlur={onBlur}
                                    input={{ name: 'symbol_no', label: '', hideLabel: true }} />
                            </span>
                            <span>
                                <TextInput error={data?.errors?.regd_no}
                                    value={data.updateForm[student.id]?.regd_no}
                                    onChange={({ name, value }) => {
                                        onChange(student.id, name, value, null);
                                    }} onBlur={onBlur}
                                    input={{ name: 'regd_no', label: '', hideLabel: true }} />
                            </span>
                        </>
                    </RowCard>
                ))
            }
        </>
    )
}

export default IdentityUpdatesView;