import { OPTION_OTHER, SelectInput } from ".";

export default function SportInput({ value, error, onChange, onBlur, disabled = false }) {
    return (
        <SelectInput value={value} error={error} onChange={onChange} onBlur={onBlur} input={{
            label: 'Sport', name: 'sport', options: [
                { value: '1', name: 'Football' },
                { value: '2', name: 'Cricket' },
                { value: '3', name: 'Basketball' },
                { value: '4', name: 'Volleyball' },
                OPTION_OTHER,
            ], readOnly: disabled
        }} />
    );
}
