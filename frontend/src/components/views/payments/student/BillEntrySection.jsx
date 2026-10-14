import { ButtonsSecion, Section } from "@/components/sections";
import { useStudentPayment } from "@/contexts/StudentPayment";
import { Button, Typography, Textarea } from "@material-tailwind/react";
import AmountInput from "@/components/tables/AmountInput";
import MonthPicker from "@/components/inputs/MonthPicker";
import HeaderCard from "@/components/tables/HeaderCard";
import RowCard from "@/components/tables/RowCard";
import { SelectInput, TextInput } from "@/components/inputs";
import { PAYMENT_MODES } from "@/configs/payment";
import FormSaveButton from "@/components/buttons/FormSaveButton";

// Money formatter — always two decimals with thousands separators (en-IN),
// so totals read accurately (e.g. "Rs. 11,525.00" instead of "Rs. 11525").
function rs(value) {
    const n = Number(value);
    return `Rs. ${(Number.isFinite(n) ? n : 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function BillEntrySection() {
    const { data: { studentLedger, discounts, profileDiscounts, dues, payingTotal, discountTotal, remainingTotal, paymentInfo, onPaymentInfoChange, paymentStatus },
        selectedBills: { selectedBills, },
        months: { selectedMonths, setSelectedMonths, pickedAllMonths, setPickedAllMonths, onSelectAll },
        methods: { payStudentFee, onPayingAmountChange, onDiscountAmountChange },
        guardianPayingSplit } = useStudentPayment();
    const cols = 6;
    return (
        <>
            {Object.keys(selectedBills)?.length > 0 &&
                <>
                    <Section title={"Guardian Paying Amount Distribution"}
                        description={"Distributes guardian paying amount to the selected titles!"} >
                        <TextInput value={guardianPayingSplit?.guardianPayingAmount} onChange={guardianPayingSplit.onGuardianPayingAmountChange}
                            input={{ name: "guardianPayingAmount", label: "Guardian Paying Amount", type: "number" }} />
                        <TextInput value={guardianPayingSplit.remainingToDistribute} onChange={() => null}
                            input={{ name: '', label: "Remaining to distribute", readOnly: true }} />
                    </Section>
                    <ButtonsSecion>
                        <Button variant="outlined" type="button" onClick={guardianPayingSplit.guardianPayingAmountDistribution}>Split</Button>
                    </ButtonsSecion>
                    <Section title={"Payment Form"} grid={false}>
                        <div>
                            <form className="w-full flex flex-col items-end" onSubmit={payStudentFee}>
                                {/* Horizontal scroll on small screens so the 6-column
                                    fee grid stays readable instead of crushing. */}
                                <div className="w-full overflow-x-auto">
                                  <div className="min-w-[600px] w-full flex flex-col">
                                <HeaderCard grid={cols}>
                                    <span className="font-semibold flex gap-x-2">
                                        title
                                    </span>
                                    <span className="font-semibold">rate</span>
                                    <span className={`text-left font-semibold`}>paying amount</span>
                                    <span className={`text-left font-semibold`}>discount amount</span>
                                    <span className={`text-left font-semibold`}>due</span>
                                    <span className={`text-left font-semibold`}>total</span>
                                </HeaderCard>
                                {
                                    Object.keys(selectedBills)
                                        ?.map((titleId, i) => (
                                            <RowCard key={i} grid={cols}>
                                                <span className="capitalize font-semibold">
                                                    {studentLedger.titles?.[titleId] || titleId}
                                                </span>
                                                <span>
                                                    {studentLedger?.rates?.[titleId] || ''}
                                                </span>
                                                {/* paying-amount */}
                                                <AmountInput id={titleId} value={selectedBills?.[titleId]} onChange={onPayingAmountChange} />
                                                {/* discount-amount */}
                                                <div className="flex flex-col">
                                                    <AmountInput id={titleId} value={discounts?.[titleId] || ''} onChange={onDiscountAmountChange} />
                                                    {profileDiscounts?.[titleId] ? (
                                                        <span className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                                                            Profile discount: Rs. {profileDiscounts[titleId]}
                                                        </span>
                                                    ) : null}
                                                </div>
                                                {/*  */}
                                                <span className="capitalize font-semibold"> {dues?.[titleId] || ''} </span>
                                                <span className="capitalize font-semibold"> {
                                                    (Number(selectedBills[titleId]) || 0) - (Number(discounts?.[titleId]) || 0)
                                                } </span>
                                            </RowCard>
                                        ))
                                }
                                  </div>
                                </div>
                                {/* Payment summary — clean, right-aligned, accurately formatted */}
                                <div className="w-full mt-3 flex justify-end">
                                    <div className="w-full sm:w-96 rounded-xl border border-blue-gray-100 bg-white shadow-sm overflow-hidden">
                                        <div className="flex items-center justify-between px-4 py-2 text-sm">
                                            <span className="text-blue-gray-600">Total paying</span>
                                            <span className="font-semibold text-blue-gray-900">{rs(payingTotal)}</span>
                                        </div>
                                        <div className="flex items-center justify-between px-4 py-2 text-sm border-t border-blue-gray-50">
                                            <span className="text-blue-gray-600">Total discount</span>
                                            <span className="font-semibold text-emerald-700">{rs(discountTotal)}</span>
                                        </div>
                                        <div className="flex items-center justify-between px-4 py-2 text-sm border-t border-blue-gray-50">
                                            <span className="text-blue-gray-600">Total remaining (due)</span>
                                            <span className={`font-semibold ${Number(remainingTotal) < 0 ? 'text-red-600' : 'text-blue-gray-900'}`}>{rs(remainingTotal)}</span>
                                        </div>
                                        <div className="flex items-center justify-between px-4 py-3 border-t-2 border-blue-gray-200 bg-blue-gray-900 text-white">
                                            <span className="font-semibold uppercase tracking-wide text-xs">Grand total to collect</span>
                                            <span className="font-bold text-lg whitespace-nowrap">
                                                {rs(payingTotal)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <>
                                    {/* month selection */}
                                    <div className="flex flex-col my-2 w-full">
                                        <Typography variant="h6">Upto the month</Typography>
                                        <MonthPicker onSelect={
                                            ({ value }) => {
                                                setSelectedMonths(value);
                                            }
                                        } data={selectedMonths} previousData={[]} allMonths={{ pickedAllMonths, setPickedAllMonths }} onSelectAll={onSelectAll} />
                                    </div>
                                </>
                                <>
                                    <div className="flex justify-end items-end w-full gap-x-2">
                                        <TextInput value={paymentInfo?.date} onChange={onPaymentInfoChange}
                                            input={{ name: 'date', label: "Payment Date (BS)" }} />
                                        <SelectInput value={paymentInfo?.mode} onChange={onPaymentInfoChange}
                                            input={{ name: 'mode', label: "Payment mode", options: PAYMENT_MODES }} />
                                        <Textarea value={paymentInfo?.remarks || ''} name="remarks" label="Remarks"
                                            onChange={(e) => {
                                                const { name, value } = e.target;
                                                onPaymentInfoChange({ name, value });
                                            }} />
                                    </div>
                                </>
                                <FormSaveButton
                                    disabled={(selectedMonths?.length != 1 || !paymentInfo?.date || paymentStatus === true || payingTotal <= 0)}
                                    custom={[paymentStatus, "Pay", "Paying"]} />
                            </form>
                        </div>
                    </Section >
                </>
            }
        </>
    )
}

export default BillEntrySection;