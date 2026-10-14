import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import MonthPicker from "@/components/inputs/MonthPicker";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import cleanEmptyFields from "@/methods/cleanEmptyFields";
import clone from "@/methods/clone";
import { calculateTotal, genPostingMonths, payableMonthsCount } from "@/methods/payment/ledger";
import { fetchStaffLedgers, saveSalaryPostings } from "@/services/functions/ledgers";
import { searchStaffs } from "@/services/functions/staffs";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";

// MUST MATCH ALL_TITLES in backend/main/views/LedgerViewsStaff.py — this list
// decides what is multiplied by the months and what is posted. `funds` is an
// earning that behaves exactly like the salary, so it sits right behind it.
const TITLES = ["salary", "funds", "grade", "allowance", "extra"];
const salaryPostingSchema = { date: '', months: [], ledgers: [], academic_year: '', economic_year: '', school: '', postedMonths: [], postableMonths: [] };
function SalaryPosting() {
    const { user: { user }, fiscalYear: { year },
        notification: { updateNotification } } = useAppContext();
    const [staffs, setStaffs] = useState([]);
    const [rates, setRates] = useState({}); // salary rates using staff-id for easy search!
    salaryPostingSchema['school'] = user?.profile?.school || user?.profile?.id;
    salaryPostingSchema['academic_year'] = year?.academic_year;
    salaryPostingSchema['economic_year'] = year?.economic_year;
    salaryPostingSchema['date'] = user?.today;
    const [data, setData] = useState(null);
    const [pickedAllMonths, setPickedAllMonths] = useState(false);
    const [status, setStatus] = useState(false);
    const [editable, setEditable] = useState(false);
    const { searching, statusHandler } = useRequestStatus();

    function updateTotals() {
        const pmc = payableMonthsCount(data?.months, [, , data.postableMonths]);
        if (pmc > 0) {
            setData(state => {
                const ns = { ...state };
                ns['ledgers'] = (ns?.ledgers || []).reduce((acc, led) => {
                    let total = 0;
                    let _led = { ...led };
                    TITLES.forEach(title => {
                        const prevTotal = _led?.[title] || 0,
                            rate = rates?.[_led.id]?.[title];
                        const titleTotal = calculateTotal(prevTotal, pmc, rate, 0);
                        _led[title] = titleTotal;
                        total += titleTotal;
                    });
                    acc.push({ ..._led, total });
                    return acc;
                }, []);
                return ns;
            });
        }
    }

    function onChange({ name, value }) {
        setData(state => ({ ...state, [name]: value }));
    }

    // per-row manual edit of the salary posting table (salary/grade/allowance/
    // extra recompute the row total; remarks is a free-text note per staff).
    function onManualLedgerUpdate(index, key, value) {
        setData(state => {
            const ns = { ...state };
            const ledgers = [...(ns.ledgers || [])];
            const row = { ...ledgers[index] };
            if (key === 'remarks') {
                row[key] = value;
            } else {
                // Keep the draft text so typing a decimal point (e.g. "100.")
                // does not immediately turn it back into "100".
                row[key] = value;
                row['total'] = Math.round(TITLES.reduce((acc, t) => acc + (parseFloat(row[t]) || 0), 0) * 100) / 100;
            }
            ledgers[index] = row;
            ns.ledgers = ledgers;
            return ns;
        });
    }

    function shouldDisable() {
        return (
            !data?.school || !data?.date || !data?.academic_year || !data?.economic_year ||
            !data?.ledgers?.length > 0 || !data?.months?.length > 0
        );
    }

    function prepareData(data) {
        const { academic_year, economic_year, date, months, school } = data;
        // 
        return {
            academic_year, economic_year, date, school, months,
            // data['ledgers] = [{staff, details: { }, total}, ...]
            ledgers: data.ledgers.reduce((acc, led) => {
                // here, insurance and pf_contrib are not used currently!
                const { id: staff, remarks } = led;
                const amounts = Object.fromEntries(TITLES.map(title => [title, parseFloat(led[title]) || 0]));
                const total = Math.round(Object.values(amounts).reduce((sum, amount) => sum + amount, 0) * 100) / 100;
                acc.push({
                    staff,
                    details: cleanEmptyFields(amounts, [], true),
                    total,
                    remarks: (remarks || '').toString().trim() || null,
                });
                return acc;
            }, [])
        }
    }

    function reset() {
        setData({ ...salaryPostingSchema, ledgers: staffs });
    }

    async function onSalaryPost(e) {
        setStatus(true);
        e.preventDefault();
        const uploadData = prepareData(data);
        if (uploadData) {
            const [status, message, res] = await saveSalaryPostings(uploadData);
            updateNotification(status, message);
            if (status === 200) {
                salaryPostingSchema["postedMonths"] = [...salaryPostingSchema?.postedMonths, ...data.months];
                reset();
                setEditable(false);
            }
        }
        setStatus(false);
    }

    async function fetchPostedMonths() {
        const schoolId = user?.profile?.school || user?.profile?.id;
        const data = await fetchStaffLedgers(schoolId, year.academic_year, year.economic_year, true);
        if (data?.months) {
            salaryPostingSchema['postedMonths'] = data.months;
            salaryPostingSchema['postableMonths'] = genPostingMonths({ min: 1, max: 12 }, data.months);
            setData({ ...salaryPostingSchema });
        }
    }

    useEffect(() => {
        if (year?.economic_year && year?.academic_year) {
            (async () => {
                await fetchPostedMonths();
                statusHandler.toggleSearching();
                const schoolId = user?.profile?.school || user?.profile?.id;
                const [, , _data] = await searchStaffs({ school: schoolId, finance: true });

                if (_data) {
                    setRates(_data.reduce((acc, staff) => {
                        const { id, salary, funds, grade, allowance, extra, insurance, pf_contrib } = staff;
                        acc[id] = { salary, funds, grade, allowance, extra, insurance, pf_contrib };
                        return acc;
                    }, {}));
                    setStaffs(_data.reduce((acc, staff) => {
                        acc.push(clone(staff));
                        return acc;
                    }, []));
                    // ledgers data for table;
                    setData(state => ({
                        ...state,
                        ledgers: [..._data]
                    }));
                }
                statusHandler.toggleSearching();
            })();
        }

        return () => {
            setData({ ...salaryPostingSchema });
        }
    }, [user?.profile, year]);

    useEffect(() => {
        if (data?.months?.length > 0) {
            updateTotals();
        }
    }, [data?.months]);

    return (
        <>
            {searching ? <Loader minutes={10} /> :
                <>
                    {staffs?.length > 0 ?
                        <form onSubmit={onSalaryPost}>
                            <div className="mb-2">
                                <MonthPicker name={"months"} data={data?.months || []} previousData={data?.postedMonths || []}
                                    onSelect={onChange} onSelectAll={(value) => {
                                        onChange({ name: 'months', value });
                                    }}
                                    allMonths={{ pickedAllMonths, setPickedAllMonths }}
                                    allowAllMonthSelectAtOnce={false}
                                />
                                <Section>
                                    <TextInput input={{ name: 'date', label: 'Posting date' }} value={data?.date} onChange={onChange} />
                                </Section>

                                <ButtonsSecion>
                                    <Button variant="outlined" onClick={() => {
                                        setData(state => ({ ...state, months: [] }));
                                    }}>Reset</Button>
                                </ButtonsSecion>
                            </div>
                            <div>
                                <BasicTable columns={[
                                    ['name'], ['salary'], ['funds'], ['grade'], ['allowance'], ['extra'],
                                    // ['insurance'], ['pf_contrib', "PF Contribution"],
                                    ['total'], ['remarks', 'Remarks']
                                ]} data={data?.ledgers || []} onSelect={() => null} showSelected={false}
                                    editable={editable}
                                    editableColumns={[['salary'], ['funds'], ['grade'], ['allowance'], ['extra'], ['remarks']]}
                                    onChange={onManualLedgerUpdate} />

                                <ButtonsSecion>
                                    <Button variant="outlined" disabled={false} onClick={reset}>Reset</Button>
                                    <Button variant="outlined" onClick={() => setEditable(state => !state)}>
                                        {editable ? 'Lock' : 'Edit'}
                                    </Button>
                                    <FormSaveButton custom={[status, "Post", "Posting..."]} disabled={shouldDisable() || status} />
                                </ButtonsSecion>
                            </div>
                        </form> :
                        <NotFound error="Staffs not found!" />
                    }
                </>
            }
        </>
    )
}

export default SalaryPosting;