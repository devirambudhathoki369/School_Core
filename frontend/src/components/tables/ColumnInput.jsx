// A bare input inside a list row (payment amounts, discounts, dues posting,
// the bulk-enrol grid). Styled by `.app-cell-input` to match every other field
// — it carried its own dark square border (`border-gray-500 rounded-sm`), so
// the one control a cashier types money into looked like it came from a
// different product. Widths stay with the caller.
export default function ColumnInput({ id, type, value, onChange, className = '' }) {
    function onInputChange(e) {
        let { value } = e.target;
        value = type === "number" && parseFloat(value) || value;
        onChange(id, value);
    }
    return (
        <input type={type || 'text'} onChange={onInputChange} value={value || ''}
            className={`app-cell-input m-0 text-start font-semibold ${className}`} />
    );
}
