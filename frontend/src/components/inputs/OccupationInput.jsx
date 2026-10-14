import { OPTION_OTHER, SelectInput } from ".";

function OccupationInput({ input, value, error, onChange, onBlur }) {
    input['options'] = [
        { name: 'teacher', value: 1 },
        { name: 'doctor', value: 2 },
        { name: 'engineer', value: 3 },
        { name: 'lawyer', value: 4 },
        { name: 'government employee', value: 5 },
        { name: 'house wife', value: 6 },
        { name: 'farmer', value: 7 },
        { name: 'driver', value: 8 },
        OPTION_OTHER,
    ]
    return (
        <SelectInput value={value} error={error} onChange={onChange} onBlur={onBlur} input={input} />
    )
}

export default OccupationInput;