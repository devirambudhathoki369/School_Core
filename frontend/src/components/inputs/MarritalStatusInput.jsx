import { SelectInput } from ".";

function MarritalStatusInput({ value, error, input, onChange, onBlur }) {
    return (
        <SelectInput input={{
            label: "Marrital status", name: "marrital_status", options: [
                { value: 1, name: "Unmarried" },
                { value: 2, name: "Married" },
            ], ...input
        }} error={error} value={value} onChange={onChange} onBlur={onBlur} />
    )
}

export default MarritalStatusInput;