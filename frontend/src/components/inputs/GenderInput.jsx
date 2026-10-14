import { SelectInput } from ".";

function GenderInput({ value, error, input, onChange, onBlur }) {
    return (
        <SelectInput onChange={onChange} onBlur={onBlur} value={value} error={error} input={{
            label: "Gender", name: "gender", options: [
                { value: "1", name: "male" },
                { value: "2", name: "female" },
                { value: "3", name: "others" }
            ], ...input
        }} />
    )
}

export default GenderInput;