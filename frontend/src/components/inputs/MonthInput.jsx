import { SelectInput } from ".";
import monthOptions from "./options/months";


export default function MonthInput({ input, value, onChange }) {
    return (
        <SelectInput value={value} onChange={onChange} input={{
            name: 'month', label: 'Month',
            options: monthOptions, ...input
        }} />
    );
}
