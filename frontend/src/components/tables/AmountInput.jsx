import ColumnInput from "./ColumnInput";

export default function AmountInput({ id, value, onChange }) {
    return (
        <ColumnInput id={id} type={"number"} value={value || ''}
            onChange={(id, value) => { onChange(id, value) }} />
    );
}