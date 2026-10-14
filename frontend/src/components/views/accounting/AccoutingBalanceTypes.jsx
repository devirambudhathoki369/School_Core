import { SelectInput } from "@/components/inputs";

function AccountingBalanceTypes({ value, onChange }) {
    return (
        <SelectInput input={{ name: 'type', label: '', options: ACCOUNTING_BALANCE_TYPES }}
            value={value} onChange={onChange} />
    )
}

const ACCOUNTING_BALANCE_TYPES = [
    { value: 1, name: "Dr." },
    { value: 2, name: "Cr." },
];

export default AccountingBalanceTypes;