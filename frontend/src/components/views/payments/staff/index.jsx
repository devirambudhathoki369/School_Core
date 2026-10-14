import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import MonthInput from "@/components/inputs/MonthInput";
import { ButtonsSecion, Section } from "@/components/sections";
import { INVOICE_DETAILS, PAYMENT_MODES } from "@/configs/payment";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { makeStaffPayment } from "@/services/functions/payments";
import { searchStaffs } from "@/services/functions/staffs";
import { Button, Textarea } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import SeeLogsButton from "@/components/buttons/SeeLogsButton";
import PaySlipSection from "./PaySlipSection";
import safeDecimal from "@/methods/safeDecimal";
import { fetchStaffLedgers } from "@/services/functions/ledgers";
import TitleBill from "../student/TitleBill";
import Loader from "@/components/Loader";
import AmountInput from "@/components/tables/AmountInput";
import HeaderCard from "@/components/tables/HeaderCard";
import RowCard from "@/components/tables/RowCard";
import { payrollStaffName, payrollTitle } from "@/configs/payroll";

/* 
What to send?
date, details, total_paid, total_due, payment_month, school, mode, remarks, 
academic_year, economic_year,
staff, total_deduction
*/
const staffPaymentSchema = {
    school: '', staff: '', economic_year: '', academic_year: '', date: '', mode: '1',
    balance: '', total_paid: '', total_due: '', payment_month: '', remarks: '',
    total_deduction: '', pf_deduction: '', insurance_deduction: '',
}; // remaining details: {},

function StaffPayment() {
    const { user: { user }, fiscalYear: { year },
        notification: { updateNotification } } = useAppContext();
    const [staffs, setStaffs] = useState([]);
    const [staffsMapping, setStaffsMapping] = useState({});
    staffPaymentSchema['school'] = user?.profile?.school || user?.profile?.id;
    staffPaymentSchema['economic_year'] = year?.economic_year;
    staffPaymentSchema['academic_year'] = year?.academic_year;
    staffPaymentSchema['date'] = user?.today || "";
    const [data, setData] = useState({ ...staffPaymentSchema });
    const [staffLedgers, setStaffLedgers] = useState({});
    const [selectedBills, setSelectedBills] = useState({});
    const [taxes, setTaxes] = useState({});
    const [dues, setDues] = useState({});

    const [invoice, setInvoice] = useState(null);
    const { uploading, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        let update = {};
        if (name === "staff") {
            const balance = staffsMapping?.[value]?.balance || 0;
            if (balance) {
                update['balance'] = balance;
            }
        } else if (name === "total_paid") {
            const due = ((data?.balance || 0) - value);
            update['total_due'] = due;
            // reset tds;
            update['total_deduction'] = '';
        }
        setData(state => ({ ...state, [name]: value, ...update }));
    }

    function updateDue(titleId, due) {
        // due = due > 0 ? due : 0;
        if (due) {
            setDues(state => ({ ...state, [titleId]: due }));
        } else {
            const _dues = { ...dues };
            delete _dues[titleId];
            setDues(_dues);
        }
    }
    function updateTax(title, taxPercent, taxAmount) {
        if (taxPercent) {
            setTaxes(state => ({
                ...state, [title]: {
                    [INVOICE_DETAILS.TAX_PERCENT]: taxPercent,
                    [INVOICE_DETAILS.TAX_AMOUNT]: taxAmount
                }
            }));
        } else {
            const _taxes = { ...taxes };
            delete _taxes[title];
            setTaxes(_taxes);
        }
    }
    function onTitleSelect({ title, total }) {
        const _selectedBills = { ...selectedBills };
        let _payingTotal = data?.total_paid || 0;
        let _remTotal = data?.total_due || 0;
        if (title in _selectedBills) {
            // removing title from selectedBills;
            // 
            const tpa = _selectedBills[title];
            const rt = _remTotal + tpa;
            _remTotal = rt > 0 ? rt : _remTotal;
            _payingTotal -= _selectedBills[title];
            // 
            delete _selectedBills[title];
            // delete due, and tax as well;
            if (dues?.[title]) {
                updateDue(title, null);
            }
            if (taxes?.[title]) {
                _payingTotal += taxes[title][INVOICE_DETAILS.TAX_AMOUNT];
                updateTax(title, null);
            }
        } else {
            // new title is selected;
            _selectedBills[title] = total;
            _payingTotal += total;
            _remTotal = (staffLedgers?.[data.staff]?.total || 0) - (_payingTotal + (data?.total_deduction || 0));
        }
        setSelectedBills(_selectedBills);
        setData(state => ({ ...state, total_paid: _payingTotal, total_due: _remTotal }));
    }
    function onPayingAmountChange(title, value) {
        if (!value) return null;
        const titleOriginalTotal = staffLedgers?.[data.staff]?.bill_amount[title];
        const _selectedBills = { ...selectedBills };
        // update payingTotal;
        const prevTotal = _selectedBills[title];
        const _payingTotal = safeDecimal(data.total_paid - (prevTotal - value));
        // 
        _selectedBills[title] = value; // updated title's total with new value;
        setSelectedBills(_selectedBills);
        // 
        let due = (titleOriginalTotal - value); // due or surplus;
        updateDue(title, due);
        // 
        const prevDue = dues?.[title]
        prevDue && (due -= prevDue);
        // 
        setData(state => ({
            ...state,
            total_paid: _payingTotal,
            total_due: state.total_due + due,
        }));
        const tds_percent = taxes?.[title]?.[INVOICE_DETAILS.TAX_PERCENT];
        if (tds_percent) {
            onTDSChange(title, tds_percent, value);
        }
    }
    function onTDSChange(title, value, titleAmount = null) {
        if (!titleAmount) titleAmount = selectedBills?.[title]; // paying-amount
        if (titleAmount) {
            const prevTDSAmount = taxes?.[title]?.[INVOICE_DETAILS.TAX_AMOUNT] || 0;
            let tdsAmount = 0;
            if (value) {
                tdsAmount = safeDecimal((value / 100) * titleAmount);
                updateTax(title, value, tdsAmount);
            } else {
                updateTax(title, null, null);
            }
            setData(state => ({
                ...state,
                total_paid: prevTDSAmount ?
                    (state.total_paid - (tdsAmount - prevTDSAmount)) :
                    (state.total_paid - tdsAmount)
            }))
        } else {
            updateNotification(404, "Paying amount is 0!");
        }
    }

    function onReset(staff = '') {
        setData({ ...staffPaymentSchema, staff });
        setStaffLedgers({});
        setSelectedBills({});
        setTaxes({});
        setDues({});
    }

    function resetInvoice() {
        setInvoice(null);
    }

    function prepareData(data) {
        // remove balance
        const { balance, tds_percent, ...uploadData } = data;
        // PF & insurance are withheld from the cash the staff receives, so the
        // net paid is the (already TDS-net) paying total minus these too.
        const pf = Number(uploadData.pf_deduction) || 0;
        const insurance = Number(uploadData.insurance_deduction) || 0;
        uploadData.pf_deduction = pf;
        uploadData.insurance_deduction = insurance;
        uploadData.total_paid = safeDecimal((Number(uploadData.total_paid) || 0) - pf - insurance);
        uploadData["details"] = Object.keys(selectedBills).reduce((acc, title) => {
            acc[title] = { [INVOICE_DETAILS.AMOUNT]: selectedBills[title] };
            if (taxes?.[title]) {
                acc[title] = { ...acc[title], ...taxes[title] };
            }
            if (dues?.[title]) {
                acc[title] = { ...acc[title], [INVOICE_DETAILS.DUE]: dues[title] }
            }
            return acc;
        }, {});
        return uploadData;
    }

    function updateStaffBalance(staff, newBalance) {
        setStaffsMapping(state => ({ ...state, [staff]: { ...state[staff], balance: newBalance } }));
    }

    async function handleStaffPayment(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const uploadData = prepareData(data);
        const [status, message, res] = await makeStaffPayment(uploadData);
        updateNotification(status, message);
        if (status === 200) {
            if (res?.invoice) {
                setInvoice(res.invoice);
            }
            updateStaffBalance(data.staff, data.total_due);
            onReset();
        }
        statusHandler.toggleUploading();
    }

    function shouldDisable() {
        return (
            !data?.academic_year || !data?.economic_year || !data?.date || !data?.payment_month ||
            !data?.mode || !data?.total_paid || !data?.school || !data?.staff
        );
    }

    useEffect(() => {
        if (year?.economic_year && year?.academic_year && staffs?.length < 1) {
            (async () => {
                const schoolId = user?.profile?.school || user?.profile?.id;
                let [, , _data] = await searchStaffs({ school: schoolId, designation: true, address: true, include_balance: true, finance: true, economic_year: year.economic_year });
                if (_data) {
                    _data = _data.reduce((acc, staff, index) => {
                        acc[staff.id] = { value: staff.id, order: index, ...staff, name: payrollStaffName(staff) };
                        return acc;
                    }, {});
                    setStaffsMapping(_data);
                }
            })();
        }
    }, [user, year]);

    // whenever, staffs' mapped data is updated, staff-list also gets updated;
    // currently is updated when first fetched and after payment;
    useEffect(() => {
        setStaffs(Object.values(staffsMapping).sort((a, b) => a.order - b.order));
    }, [staffsMapping]);

    useEffect(() => {
        if (data?.staff) {
            onReset(data.staff);
            // auto-fill the staff's fixed monthly PF & insurance deductions;
            // editable below so the admin can adjust them for partial months.
            const finance = staffsMapping?.[data.staff] || {};
            setData(state => ({
                ...state,
                pf_deduction: finance?.pf_contrib || '',
                insurance_deduction: finance?.insurance || '',
            }));
            //
            (async () => {
                const _staffLedgers = await fetchStaffLedgers(data?.school, null, year?.economic_year, null, data.staff);
                if (_staffLedgers) {
                    setStaffLedgers(state => ({ ...state, [data.staff]: _staffLedgers }));
                } else {
                    updateNotification(404, "Ledgers not found!");
                }
            })();
        }
    }, [data?.staff]);

    function calculateTotalDeduction(taxes) {
        return Object.values(taxes).reduce((acc, obj) => {
            acc += obj?.[INVOICE_DETAILS.TAX_AMOUNT] || 0;
            return acc;
        }, 0);
    }
    useEffect(() => {
        let total_deduction = calculateTotalDeduction(taxes);
        total_deduction = safeDecimal(total_deduction);
        setData(state => ({
            ...state, total_deduction
        }));
    }, [taxes]);

    return (
        <>
            <ButtonsSecion>
                <SeeLogsButton name={"Pay Slips"} href={"admin#payroll.pay-slips"} />
            </ButtonsSecion>
            <Section title={"Staff's payment"} description={"Select staff"}>
                <>
                    <SearchInput input={{ name: 'staff', label: 'Staff', options: staffs }} value={data?.staff} onChange={onChange}
                        tabular={true} columns={[
                            ['name'], ['designation'], ['balance'], ['address']
                        ]} />
                </>
            </Section>
            <>
                {data?.staff &&
                    <>
                        <Section title={`Staff's Ledger`}
                            description={"Select titles below to proceed with payment"} grid={false}
                            actions={[
                                // <Button variant="outlined" onClick={resetLedgerSelection}>Reset</Button>
                            ]}>
                            <div className="w-full flex flex-col items-start justify-between overflow-x-auto mb-3">
                                {
                                    staffLedgers?.[data.staff]?.bill_amount ?
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
                                                Object.entries(staffLedgers[data.staff].bill_amount || {})
                                                    .map(([title, billAmount]) => (
                                                        <TitleBill key={title}
                                                            isSelected={!!selectedBills?.[title]}
                                                            onSelect={
                                                                () => onTitleSelect({ title, total: billAmount })
                                                            }
                                                            total={0} setTotal={() => null}
                                                            title={payrollTitle(title)} rate={staffsMapping?.[data.staff]?.[title]}
                                                            billAmount={billAmount}
                                                        />
                                                    ))
                                            }
                                            <TitleBill title={'TOTAL'} billAmount={staffLedgers?.[data.staff]?.total || 0} disableClick={true} />
                                            <TitleBill title={'TOTAL SELECTED'} billAmount={0} disableClick={true} />
                                        </> :
                                        <Loader />
                                }
                            </div>
                        </Section>
                        {Object.keys(selectedBills)?.length > 0 &&
                            <form onSubmit={handleStaffPayment}>
                                <Section title={"Payment Form"} grid={false}>
                                    <div className="w-full flex flex-col items-end">
                                        <HeaderCard grid={7}>
                                            <span className="font-semibold flex gap-x-2">
                                                title
                                            </span>
                                            <span className="font-semibold">rate</span>
                                            <span className={`text-left font-semibold`}>paying amount</span>
                                            <span className={`text-left font-semibold`}>TDS (%)</span>
                                            <span className={`text-left font-semibold`}>TDS (Rs.)</span>
                                            <span className={`text-left font-semibold`}>due</span>
                                            <span className={`text-left font-semibold`}>total</span>
                                        </HeaderCard>
                                        {
                                            Object.keys(selectedBills)
                                                ?.map((title, i) => (
                                                    <RowCard key={i} grid={7}>
                                                        <span className="capitalize font-semibold">
                                                            {payrollTitle(title)}
                                                        </span>
                                                        <span>
                                                            {staffsMapping?.[data.staff]?.[title] || ''}
                                                        </span>
                                                        {/* paying-amount */}
                                                        <AmountInput id={title} value={selectedBills?.[title]} onChange={onPayingAmountChange} />
                                                        <AmountInput id={title} value={taxes?.[title]?.[INVOICE_DETAILS.TAX_PERCENT]} onChange={onTDSChange} />
                                                        {/*  */}
                                                        <span className="capitalize font-semibold px-2"> {taxes?.[title]?.[INVOICE_DETAILS.TAX_AMOUNT]} </span>
                                                        <span className="capitalize font-semibold"> {dues?.[title] || ''} </span>
                                                        <span className="capitalize font-semibold"> {
                                                            selectedBills[title] - (taxes?.[title]?.[INVOICE_DETAILS.TAX_AMOUNT] || 0)
                                                        } </span>
                                                    </RowCard>
                                                ))
                                        }
                                        <>
                                            <TitleBill title={'TOTAL PAYING'} billAmount={data.total_paid} disableClick={true} />
                                            <TitleBill title={'TDS DEDUCTION'} billAmount={data?.total_deduction || 0} disableClick={true} />
                                            <TitleBill title={'PF DEDUCTION'} billAmount={Number(data?.pf_deduction) || 0} disableClick={true} />
                                            <TitleBill title={'INSURANCE DEDUCTION'} billAmount={Number(data?.insurance_deduction) || 0} disableClick={true} />
                                            <TitleBill title={'NET PAYABLE'} billAmount={safeDecimal((Number(data.total_paid) || 0) - (Number(data?.pf_deduction) || 0) - (Number(data?.insurance_deduction) || 0))} disableClick={true} />
                                            <TitleBill title={'TOTAL REMAINING'} billAmount={data.total_due} disableClick={true} />
                                        </>
                                    </div>
                                </Section>
                                <div className="grid grid-cols-16 justify-end items-end w-full gap-x-2">
                                    <TextInput input={{ name: 'date', label: 'Payment date' }} value={data?.date} onChange={onChange} />
                                    <MonthInput value={data?.payment_month} input={{ name: 'payment_month', label: 'Payment month' }} onChange={onChange} />
                                    <SelectInput input={{ name: 'mode', label: 'Payment mode', options: PAYMENT_MODES }} value={data?.mode} onChange={onChange} />
                                    <TextInput input={{ name: 'pf_deduction', label: 'PF deduction' }} value={data?.pf_deduction} onChange={onChange} />
                                    <TextInput input={{ name: 'insurance_deduction', label: 'Insurance deduction' }} value={data?.insurance_deduction} onChange={onChange} />
                                    <div className="sm:col-span-4">
                                        <Textarea value={data?.remarks || ''} name="remarks" label="Remarks"
                                            onChange={(e) => {
                                                const { name, value } = e.target;
                                                onChange({ name, value });
                                            }} />
                                    </div>
                                </div>
                                <ButtonsSecion>
                                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                                    <FormSaveButton disabled={shouldDisable()} custom={[uploading, "Pay", "Paying..."]} />
                                    {/* <FormSaveButton disabled={false} custom={[uploading, "Pay", "Paying..."]} /> */}
                                </ButtonsSecion>
                            </form>
                        }
                    </>
                }
            </>
            <>
                {invoice &&
                    <PaySlipSection invoice={invoice} user={user} onClose={resetInvoice} />
                }
            </>
        </>
    )
}

export default StaffPayment;