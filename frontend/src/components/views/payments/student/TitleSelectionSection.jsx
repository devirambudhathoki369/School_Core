import { Section } from "@/components/sections";
import { useStudentPayment } from "@/contexts/StudentPayment";
import HeaderCard from "@/components/tables/HeaderCard";
import TitleBill from "./TitleBill";
import Loader from "@/components/Loader";
import { useEffect } from "react";

function TitleSelectionSection() {
    const { data: { studentLedger },
        selectedBills: { selectedBills },
        methods: { onTitleSelect, resetLedgerSelection } } = useStudentPayment();
    // console.log(studentLedger);
    useEffect(() => { }, [selectedBills]);
    // Derived, never accumulated: the sum of the BILL AMOUNT of every selected
    // title. Reading it off selectedBills each render means it cannot drift out
    // of step with the ticks or with a reloaded ledger, and it stays put while
    // the cashier edits the paying amounts below.
    const totalSelected = Object.keys(selectedBills || {})
        .reduce((acc, titleId) => acc + (Number(studentLedger?.bill_amount?.[titleId]) || 0), 0);
    return (
        <Section title={`Student's Ledger`}
            description={"Select titles below to proceed with payment"} grid={false}
            actions={[
                // <Button variant="outlined" onClick={resetLedgerSelection}>Reset</Button>
            ]}>
            <div className="w-full flex flex-col items-start justify-between overflow-x-auto mb-3">
                {
                    (Object.keys(studentLedger?.titles || {})?.length > 0) ?
                        <>
                            <HeaderCard grid={3}>
                                <span className="flex gap-x-2 pl-[1.85rem]">
                                    title
                                </span>
                                <span>
                                    rate
                                </span>
                                <span>bill amount</span>
                            </HeaderCard>
                            {
                                Object.entries(studentLedger?.titles || {})
                                    ?.map(([titleId, title]) => (
                                        // membership, not truthiness: a title selected at Rs. 0
                                        // is still selected (matches onTitleSelect's own check)
                                        <TitleBill key={titleId}
                                            isSelected={titleId in (selectedBills || {})}
                                            onSelect={
                                                () => onTitleSelect({ titleId, total: studentLedger?.bill_amount[titleId] || 0 })
                                            }
                                            title={title || titleId} rate={studentLedger?.rates?.[titleId]}
                                            billAmount={studentLedger?.bill_amount[titleId] || 0}
                                        />
                                    ))
                            }
                            <TitleBill title={'TOTAL'} billAmount={studentLedger?.total} disableClick={true} />
                            <TitleBill title={'TOTAL SELECTED'} billAmount={totalSelected} disableClick={true} />
                        </> :
                        <Loader />
                }
            </div>
        </Section>
    )
}

export default TitleSelectionSection;