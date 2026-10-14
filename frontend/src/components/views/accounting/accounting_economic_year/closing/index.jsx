import { useEffect, useState } from "react";
import { useAppContext } from "@/contexts/AppContext";
import { Button, Stepper, Tooltip } from "@material-tailwind/react";
import PreviousButton from "@/components/buttons/PreviousButton";
import { __save, __search } from "@/services/functions";
import NotFound from "@/components/NotFound";
import Loader from "@/components/Loader";
import Warning from "@/components/Warning";
import {
    BookOpenIcon,
    CheckBadgeIcon,
    LockClosedIcon,
    ChevronDoubleLeftIcon,
    ChevronDoubleRightIcon,
} from "@heroicons/react/24/outline";
import CStep from "@/components/cstepper/CStep";
import { useTempState } from "@/contexts/TempStateContext";
import { AccountingEconomicYearClosingKey } from "@/components/views/accounting/accounting_economic_year/configs";
import Users from "@/configs/Users";
import { economicYearSchema } from "@/schemas/fiscal-year";
import { RETAINED_EARNING_GROUP } from "@/components/views/accounting/ledger_groups";
import { SearchInput, TextInput } from "@/components/inputs";
import { Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { economicYearValidationSchema } from "@/schemas/validations/fiscal-year";
import PayrollCarryPreview, { payrollAlert, usePayrollClosingWith } from "./PayrollCarryPreview";

const HOMEPAGE = process.env.NEXT_PUBLIC_DEFAULT_ADMIN_VIEW;
const LEDGERS_SEARCH_API = "/accounting/search/ledgers";
const API_PATH = "/accounting/economic_year/closing";
const schema = { school: '' };
function AccountingEconomicYearClosing() {
    const { user: { user },
        fiscalYear: { year, fyKeys, mappedYears },
        notification: { updateNotification },
        prompt: { toggleConfirmationPrompt } } = useAppContext();
    schema["school"] = user?.profile?.school || user?.profile?.id;
    const [data, setData] = useState({});
    const [newYear, setNewEconomicYear] = useState({ ...economicYearSchema });
    const [accountingEconomicYears, setAccountingEconomicYears] = useState([]);
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [retainedEarningLedgers, setRetainedEarningLedgers] = useState([]);
    const [selectedRELedger, setSelectedRELedger] = useState(null);
    const [isClosing, setIsClosing] = useState(false);
    // Closing the books closes the payroll of that year with it. The school is
    // told so twice: on the closing step, and again in the confirmation.
    const payrollClosing = usePayrollClosingWith(data?.school, data?.id);
    const payrollWarning = payrollAlert(payrollClosing);
    // stepper
    const [activeStep, setActiveStep] = useState(0);
    const [isLastStep, setIsLastStep] = useState(false);
    const [isFirstStep, setIsFirstStep] = useState(false);

    const handleNext = () => !isLastStep && setActiveStep((cur) => cur + 1);
    const handlePrev = () => !isFirstStep && setActiveStep((cur) => cur - 1);

    const onStepClick = (step) => setActiveStep(step);
    // 
    const { getTempState } = useTempState();
    function loadEditingData() {
        let tempStateData = getTempState(AccountingEconomicYearClosingKey, false);
        if (tempStateData) {
            tempStateData = { ...schema, ...tempStateData };
            // console.log(tempStateData);
            setData(tempStateData);
            return tempStateData;
        }
        return false;
    }
    function onRELedgerSelect({ name, value }) {
        setSelectedRELedger(value);
    }
    function onEconomicYearChange({ name, value }) {
        setNewEconomicYear(state => ({ ...state, [name]: value }));
    }
    async function onEconomicYearBlur({ name, value }) {
        try {
            await economicYearValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }
    // 
    async function closeAccountingEconomicYearRequest() {
        return __save(API_PATH, {
            ...data,
            new_accounting_economic_year: newYear,
            selected_retained_earning_ledger: selectedRELedger,
            check_invalids: false,
        });
    }
    async function closeAccountingEconomicYear(e) {
        e.preventDefault();
        try {
            await economicYearValidationSchema.validate(newYear);
        } catch ({ message }) {
            updateNotification(400, message);
            return;
        }
        // 
        setIsClosing(state => !state);
        const promptData = {
            ask_reason: false, header: "Are you sure to close this accounting economic year?",
            sub_header: payrollWarning,
        };
        promptData['onConfirm'] = async (reason) => {
            let status, message, res;
            [status, message, res] = await closeAccountingEconomicYearRequest();
            if (status) {
                updateNotification(status, message);
                if (status === 200) {
                    // the message names the payroll year that closed and what
                    // was carried: leave it up long enough to be read
                    reset(res?.payroll?.length > 0 ? afterPayrollCloseExitTime : afterCloseExitTime);
                }
            }
        }
        toggleConfirmationPrompt(promptData);
        setIsClosing(state => !state);
    }
    function reset(exitTime = afterCloseExitTime) {
        setData({});
        setNewEconomicYear({ ...economicYearSchema });
        setErrors({});
        // 
        setTimeout(() => {
            window.location.href = `/admin#${HOMEPAGE}`;
            window.location.reload();
            localStorage.removeItem(fyKeys?.accounting_economic_year);
        }, exitTime);
    }
    // 
    async function fetchRetainedEarningGroupLedgers(economic_year) {
        const schoolId = user?.profile?.school || user?.profile?.id;
        const ledger_groups = [RETAINED_EARNING_GROUP];
        // 
        const [, , ledgers] = await __search(LEDGERS_SEARCH_API, {
            school: schoolId,
            economic_year,
            ledger_groups,
            as_options: true,
        });
        if (ledgers) {
            setRetainedEarningLedgers(ledgers?.[RETAINED_EARNING_GROUP] || []);
        } else {
            updateNotification(404, "RetainedEarning Ledgers Not found! Create them first!");
        }
    }
    function loadAccountingEconomicYears() {
        setAccountingEconomicYears(Object.values(mappedYears?.accountingEconomicYears || {}));
    }
    useEffect(() => {
        const loadedData = loadEditingData();
        if (loadedData) {
            loadAccountingEconomicYears();
        }
        if (year?.accounting_economic_year) {
            fetchRetainedEarningGroupLedgers(year.accounting_economic_year);
        }
        return () => {
            setData({});
        }
    }, [year?.accounting_economic_year]);
    // 
    return (
        <>
            <div className="grid grid-cols-3">
                <PreviousButton />
                <h1 className="text-center font-semibold text-lg">Accounting Economic Year Review!</h1>
                <span></span>
            </div>
            <div className="mt-2">
                {/* if accounting economic year id found! */}
                {data?.id ?
                    <>
                        <div className="w-[63%] mx-auto flex flex-col">
                            <Stepper
                                activeStep={activeStep}
                                isLastStep={(value) => setIsLastStep(value)}
                                isFirstStep={(value) => setIsFirstStep(value)}>
                                <CStep step={0} activeStep={activeStep} onClick={onStepClick}
                                    title={"Guide"} description={"Recommended to read carefully!"} icon={
                                        <BookOpenIcon className="h-8 w-8" />
                                    } />
                                <CStep step={1} activeStep={activeStep} onClick={onStepClick}
                                    title={"Step 2"} description={"Fill some required data."} icon={
                                        <CheckBadgeIcon className="h-8 w-8" />
                                    } />
                                <CStep step={2} activeStep={activeStep} onClick={onStepClick}
                                    title={"Close Running Economic Year"} description={"Create new accounting economic year and close runnning."} icon={
                                        <LockClosedIcon className="h-8 w-8" />
                                    } />
                            </Stepper>
                            <div className="mt-32 flex justify-between border-b-2 border-gray-500">
                                <Tooltip content="Previous">
                                    <Button variant="text" onClick={handlePrev} disabled={isFirstStep} >
                                        <ChevronDoubleLeftIcon className="h-4 w-4" />
                                    </Button>
                                </Tooltip>
                                <Tooltip content="Next">
                                    <Button variant="text" onClick={handleNext} disabled={isLastStep}>
                                        <ChevronDoubleRightIcon className="h-4 w-4" />
                                    </Button>
                                </Tooltip>
                            </div>
                        </div>
                        {/*  */}
                        <div className="my-4 overflow-y-auto">
                            {/* 0 */}
                            {activeStep === 0 &&
                                <div className="p-3">
                                    <div className="w-max mx-auto">
                                        <span className="font-bold text-base">Next Steps</span>
                                        <ol type="1" className="font-semibold my-5">
                                            <li>1. Select retained earning ledger</li>
                                            <li>2. Fill up new economic year data</li>
                                            <li>3. After closing, select new from top right `Fiscal Year` section.</li>
                                            <li>4. Payroll of this year closes with it: salaries still unpaid are carried into the next year as old dues.</li>
                                        </ol>
                                    </div>
                                    <Warning warning={"READ CAREFULLY!, The action is irreversible, so please do as mentioned!"} />
                                </div>
                            }
                            {/* 1 */}
                            {activeStep === 1 &&
                                <div className="p-3 rounded-md">
                                    <div className="flex flex-col gap-y-1">
                                        {loading ?
                                            <Loader /> :
                                            <Section title={"Retained Earning Ledgers"} description={retainedEarningDescription}>
                                                <SearchInput input={{ name: "selectedRELedger", label: "Retained Earning Ledger", options: retainedEarningLedgers }}
                                                    value={selectedRELedger} onChange={onRELedgerSelect} />
                                            </Section>
                                        }
                                    </div>
                                </div>
                            }
                            {/* 2 */}
                            {activeStep === 2 &&
                                <>
                                    {selectedRELedger ?
                                        <div>
                                            {allowClosing(user) ?
                                                <form onSubmit={closeAccountingEconomicYear} className="flex flex-col my-2 p-3 rounded-md shadow-default">
                                                    <>
                                                        <Section title={"New Accounting Economic Year Setup"} grid={2} description={''}>
                                                            {/* Bound to `newYear`, NOT to `year`.
                                                                `year` is the fiscal year the user is
                                                                currently working in, taken from
                                                                AppContext — it has no `name` /
                                                                `start_date` / `end_date` of the shape
                                                                this form writes, so these three fields
                                                                were reading a value that never existed
                                                                while `onEconomicYearChange` wrote to
                                                                `newYear` (which is what gets submitted).
                                                                It only appeared to work because an
                                                                undefined value leaves the input
                                                                UNCONTROLLED and the DOM keeps whatever
                                                                is typed. */}
                                                            <TextInput value={newYear?.name} input={{ label: 'Name', name: 'name', placeholder: 'FY YYYY/YY' }} error={errors?.name}
                                                                onChange={onEconomicYearChange} onBlur={onEconomicYearBlur} />
                                                            <TextInput value={newYear?.start_date} input={{ label: 'Start date (BS)', name: 'start_date' }} error={errors?.start_date}
                                                                onChange={onEconomicYearChange} onBlur={onEconomicYearBlur} />
                                                            <TextInput value={newYear?.end_date} input={{ label: 'End date(BS)', name: 'end_date' }} error={errors?.end_date}
                                                                onChange={onEconomicYearChange} onBlur={onEconomicYearBlur} />
                                                        </Section>
                                                        <BasicTable name={"Running Accounting Economic Years"} data={accountingEconomicYears} columns={[
                                                            ['id'], ['name'], ['start_date', 'start date'], ['end_date', 'end date']
                                                        ]} onSelect={() => null} showSelected={false} />
                                                        <PayrollCarryPreview pending={payrollClosing} />
                                                        {payrollWarning && <Warning warning={payrollWarning} />}
                                                    </>
                                                    <Button type="submit" className="mx-auto w-max text-base" color="blue-gray" disabled={isClosing || !selectedRELedger}>
                                                        Close Accounting Economic Year &nbsp;
                                                        <span className="capitalize text-lg">`{data.name}`</span>
                                                    </Button>
                                                </form> :
                                                <Warning warning={"TESTING!!!"} />
                                            }
                                        </div> :
                                        <NotFound error="Select Retained Earning ledger first!" />
                                    }
                                </>
                            }
                        </div>
                    </>
                    :
                    <div className="w-max mx-auto">
                        <PreviousButton name={"Return Back"} />
                    </div>
                }
            </div>
        </>
    )
}

const retainedEarningDescription = `Select one ledger from these ledgers within group retained earnings
 to transfer income ledgers balance.`;
const afterCloseExitTime = 2 * 1000; // after 2 seconds!
const afterPayrollCloseExitTime = 7 * 1000; // longer: there is a payroll message to read

function allowClosing(user) {
    return user?.role === Users.ADMIN;
}

export default AccountingEconomicYearClosing;