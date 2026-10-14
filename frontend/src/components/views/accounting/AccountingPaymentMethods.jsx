import { SelectInput } from "@/components/inputs";

function AccountingPaymentMethods({ value, onChange }) {
    return (
        <SelectInput input={{ name: 'mode', label: 'Received method', options: ACCOUNTING_PAYMENT_METHODS }}
            value={value} onChange={onChange} />
    )
}

const ACCOUNTING_PAYMENT_METHODS = [
    { value: 1, name: "Cash" },
    { value: 2, name: "Bank" },
];

export default AccountingPaymentMethods;