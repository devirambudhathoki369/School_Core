import { SelectInput } from ".";

// The groups the enrollment form offers, with the numbers they are saved as
// (the backend's `choices/Ethnicity.py`). Exported so that a report names a
// group exactly as the form that recorded it does.
export const ETHNICITY_OPTIONS = [
    { "name": "Others", value: 0 },
    { "name": "Chhetri", "value": 1 },
    { "name": "Brahman", "value": 2 },
    { "name": "Magar", "value": 3 },
    { "name": "Tharu", "value": 4 },
    { "name": "Tamang", "value": 5 },
    { "name": "Newar", "value": 6 },
    { "name": "Kami", "value": 7 },
    { "name": "Muslim", "value": 8 },
    { "name": "Yadav", "value": 9 },
    { "name": "Rai", "value": 10 },
    { "name": "Gurung", "value": 11 },
    { "name": "Damai/Dholi", "value": 12 },
    { "name": "Thakuri", "value": 13 },
    { "name": "Limbu", "value": 14 },
    { "name": "Sarki", "value": 15 }
];

export default function EthnicityInput({ value, error, onChange, onBlur, disabled = false }) {
    return (
        <SelectInput value={value} error={error} onChange={onChange} onBlur={onBlur} input={{
            label: 'Ethnicity',
            name: 'ethnicity', options: ETHNICITY_OPTIONS, readOnly: disabled
        }} />
    );
}
