import { TRANSPORTATION, HOSTEL } from "@/configs/payment";
import { getLedgers } from "@/services/functions/ledgers";
import { useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { Button, Textarea } from "@material-tailwind/react";
import { ButtonsSecion, Section } from "@/components/sections";
import ReminderBill from "./ReminderBill";
import Loader from "@/components/Loader";
import { SearchInput } from "@/components/inputs";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import NotFound from "@/components/NotFound";

const extraInfoSchema = { note: '' };
function ReminderBillsView({ selectedClass, schoolProfile, academicYear, students }) {
    const [selectedStudent, setSelectedStudent] = useState('');
    const [bills, setBills] = useState({});
    const [extraInfo, setExtraInfo] = useState({ ...extraInfoSchema });
    // Print layout controls — Chrome's own dialog hides the orientation
    // dropdown once a page `size` is forced, so we expose it here instead.
    // `cols` is how many bills sit side-by-side per row (e.g. 3-in-one).
    const [orientation, setOrientation] = useState('portrait');
    const [cols, setCols] = useState(3);
    const { searching, statusHandler } = useRequestStatus();
    const billRef = useRef(null);
    //
    function onExtraInfoChange({ name, value }) {
        setExtraInfo(state => ({ ...state, [name]: value }));
    }
    const printReminderBills = useReactToPrint({
        content: () => billRef.current,
        // Drives the printed page orientation (portrait/landscape). Using the
        // orientation keyword alone keeps the user's chosen paper size.
        pageStyle: `@page { size: ${orientation}; margin: 8mm 10mm; }`,
    });
    function prepareParticulars(details, titles, rates) {
        // [[title, rate, paid, due, discount], ...]
        const particulars = Array.from(new Set([...Object.keys(details)]));
        while (particulars.length < 15) particulars.push(['', '', '', '', '']);
        return particulars.reduce((acc, titleId) => {
            if (titleId != "discounts") {
                const titleData = [titles?.[titleId], rates?.[titleId]];
                if (details?.[titleId]) {
                    const due = details?.[titleId] || '',
                        total_due = (due) || 0;
                    acc.push([...titleData, due, total_due]);
                } else {
                    acc.push([...titleData, '', '']);
                }
            }
            return acc;
        }, []);
    }

    function prepareReminderBills(data) {
        return data?.student_details
            ?.reduce((acc, std) => {
                const bill = {};
                bill["studentId"] = std.id;
                bill["studentName"] = std.name;
                bill["date"] = data.date;
                bill["class"] = data.classname;
                bill["guardianName"] = std.guardian_name;
                bill["months"] = data.months;
                bill["particulars"] = prepareParticulars(
                    data.data[std.id]?.mergedLedgers || [],
                    data.titles,
                    { ...data.rates, [TRANSPORTATION]: std?.transportation_rate, [HOSTEL]: std?.hostel_rate }
                );
                bill['due'] = data.data[std.id]?.total || 0;
                bill['paid'] = data.data[std.id]?.paid || 0;
                bill['previous_due'] = data.data[std.id]?.old_dues || 0;
                bill['adjusted'] = data.data[std.id]?.adjusted || 0;
                bill["total"] = data.data[std.id]?.total_dues || 0; //  ((bill.due + bill.previous_due + bill.adjusted) - bill.paid)
                bill["discount"] = '';
                bill["remarks"] = '';
                acc.push(bill);
                return acc;
            }, []);
    }
    async function onSearch(e) {
        e.preventDefault();
        (async () => {
            statusHandler.toggleSearching();
            let data = await getLedgers(schoolProfile?.id, null, selectedClass.class_info.id, academicYear, true, '', selectedStudent);
            data = prepareReminderBills(data);
            setBills(state => ({ ...state, [selectedClass.class_info.id]: data }));
            statusHandler.toggleSearching();
        })();
    }
    // 
    return (
        <div className="my-5 flex flex-col">
            <form onSubmit={onSearch}>
                <Section>
                    <SearchInput input={{ name: 'student', label: "Student", options: students }}
                        value={selectedStudent} onChange={({ name, value }) => {
                            setSelectedStudent(value);
                        }} />
                    <div className="sm:col-span-8">
                        <Textarea value={extraInfo?.note} className="!text-base" name="note" label="Note"
                            onChange={(e) => {
                                const { name, value } = e.target;
                                onExtraInfoChange({ name, value });
                            }} />
                    </div>
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
            <>
                <div className="flex flex-col gap-y-2 w-full">
                    {
                        searching ? <Loader /> :
                            <>
                                {
                                    bills?.[selectedClass.class_info.id] ?
                                        <>
                                            {/* Print-layout controls (not printed) */}
                                            <div className="hide-from-print flex flex-wrap items-center gap-2 my-2">
                                                <span className="text-sm font-semibold">Orientation:</span>
                                                {['portrait', 'landscape'].map(o => (
                                                    <Button key={o} size="sm" className="capitalize"
                                                        variant={orientation === o ? 'filled' : 'outlined'}
                                                        onClick={() => setOrientation(o)}>{o}</Button>
                                                ))}
                                                <span className="text-sm font-semibold ml-4">Bills per row:</span>
                                                {[1, 2, 3, 4].map(n => (
                                                    <Button key={n} size="sm"
                                                        variant={cols === n ? 'filled' : 'outlined'}
                                                        onClick={() => setCols(n)}>{n}</Button>
                                                ))}
                                                <Button onClick={printReminderBills} size="sm"
                                                    className="ml-auto flex items-center gap-2 bg-teal-400 text-gray-900 normal-case">
                                                    Print
                                                </Button>
                                            </div>
                                            <div ref={billRef} className="w-full flex justify-start items-start">
                                                <>
                                                    <div id="reminder-bills-view" className="grid gap-4 p-1 w-full"
                                                        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                                                        {
                                                            bills[selectedClass.class_info.id].map((bill, bi) => (
                                                                <ReminderBill bill={bill} key={bi} schoolProfile={schoolProfile} extraInfo={extraInfo} />
                                                            ))
                                                        }
                                                    </div>
                                                </>
                                            </div>
                                        </> :
                                        <NotFound />
                                }
                            </>
                    }
                </div>
            </>
        </div>
    )
}

export default ReminderBillsView;