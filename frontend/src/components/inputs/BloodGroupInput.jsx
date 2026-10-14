import { SelectInput } from ".";

export default function BloodGroupInput({ value, error, onChange, onBlur, disabled = false }) {
    return (
        <SelectInput value={value} error={error} onChange={onChange} onBlur={onBlur} input={{
            label: 'Blood Group', name: 'blood_group', options: [
                { "name": "A+", "value": 1 },
                { "name": "A-", "value": 2 },
                { "name": "B+", "value": 3 },
                { "name": "B-", "value": 4 },
                { "name": "AB+", "value": 5 },
                { "name": "AB-", "value": 6 },
                { "name": "O+", "value": 7 },
                { "name": "O-", "value": 8 }
            ], readOnly: disabled
        }} />
    );
}
