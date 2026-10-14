export default function CollectionSummary({ totals, label = 'Collected by payment mode' }) {
    return (
        <div className="my-3 rounded-lg border border-teal-200 bg-white p-3 text-sm text-gray-900">
            <div className="mb-2 font-semibold">{label}</div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
                {totals.map(({ payment_mode, total }) => (
                    <span key={payment_mode}>
                        {payment_mode}: <strong>Rs. {total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                    </span>
                ))}
            </div>
        </div>
    );
}
