import FormSaveButton from "@/components/buttons/FormSaveButton";
import SeeLogsButton from "@/components/buttons/SeeLogsButton";
import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { Button, Typography, Tooltip } from "@material-tailwind/react";
import AccountingPaymentMethods from "../AccountingPaymentMethods";
import { useEffect, useState } from "react";
import useRequestStatus from "@/hooks/requestStatus";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useAppContext } from "@/contexts/AppContext";
import { incomeEntrySchema, accountingParticularSchema } from "@/schemas/accounting";
import { __save, __search, __update } from "@/services/functions";
import { ENTRIES, MAJOR_LEDGER_GROUPS as MLG } from "../acc_constants";
import Loader from "@/components/Loader";
import { getLedgerType } from "..";
import EntriesSection from "../EntriesSection";
import RecentEntriesView from "../RecentEntriesView";
import { INCOME_ENTRIES_TCs } from "../tableColumnsConfig";
import { useTempState } from "@/contexts/TempStateContext";

const ledger_groups = [MLG.CASH_IN_HAND, MLG.BANK, MLG.DIRECT_INCOME, MLG.INDIRECT_INCOME];
function IncomeEntry() {
    const { user: { user }, fiscalYear: { year, years, isAccountingYearClosed }, notification: { updateNotification } } = useAppContext();
    // fiscal year to work in: current open year = create/edit; a past/closed
    // year = read-only (form hidden, only view/reprint its vouchers below).
    const [selectedYear, setSelectedYear] = useState(year?.accounting_economic_year || '');
    const isClosed = isAccountingYearClosed?.(selectedYear);
    function onYearChange({ value }) { setSelectedYear(value); }
    incomeEntrySchema["school"] = user?.profile?.school || user?.profile?.id;
    incomeEntrySchema["date"] = user?.today;
    const [data, setData] = useState({ ...incomeEntrySchema });
    const [entryBackup, setEntryBackup] = useState({});
    const [ledgerGroupType, setLedgerGroupType] = useState('');
    const [majorLedgers, setMajorLedgers] = useState({});
    const [mappedLedgerGroups, setMappedLedgerGroups] = useState({});
    const [modeChanged, setModeChanged] = useState(false);
    const [entry, setEntry] = useState(null);
    const { uploading, searching, statusHandler } = useRequestStatus();
    const { getTempState } = useTempState();

    function onChange({ name, value }) {
        setData(state => ({ ...state, [name]: value }));
        if (name === "ledger") {
            const mlg = mappedLedgerGroups?.[value];
            const type = getLedgerType(mlg, true) || "_";
            const str = `Transaction goes to ${type} side!`;
            setLedgerGroupType(str);
        } else if (name === "mode") {
            if (data.mode != value) setModeChanged(true);
            else setModeChanged(false);
        }
    }
    function onAddNewParticular() {
        setData(state => ({ ...state, particulars: [...state.particulars, { ...accountingParticularSchema }] }));
    }
    function onRemoveParticular(index) {
        setData(state => {
            const _s = state?.particulars ? [...state.particulars] : [];
            _s.splice(index, 1);
            return {
                ...state, particulars: _s
            };
        });
    }
    function clearAllParticulars() {
        setData(state => ({ ...state, particulars: [] }));
    }
    function onParticularsChange(index, { name, value }) {
        setData(state => {
            const _s = state?.particulars ? [...state.particulars] : [];
            _s[index] = { ..._s[index], [name]: value };
            return {
                ...state,
                particulars: _s
            };
        });
    }

    function validateParticulars(data) {
        return (data?.particulars ?? []).length > 0 && data.particulars.every((par) => {
            return (par?.ledger && par?.amount);
        });
    }
    function allowEntry() {
        return (
            data?.school && data?.economic_year &&
            data?.date && data?.mode && data?.ledger
        )
    }

    async function saveEntry(apiPath, data) {
        if (data?.id) return __update(apiPath, data);
        return __save(apiPath, data);
    }

    async function onIncomeEntrySave(e) {
        e.preventDefault();
        if (!validateParticulars(data)) {
            updateNotification(500, "Entry is Invalid!");
            return;
        }
        statusHandler.toggleUploading();
        const [status, msg, res] = await saveEntry(ENTRIES.INCOME.apiPath, data);
        updateNotification(status, msg);
        if (status === 200) {
            if (res?.entry) {
                setEntry(res.entry);
            }
            onReset();
        } else {
            setEntry(null);
        }
        statusHandler.toggleUploading();
    }

    function onReset() {
        setData({ ...incomeEntrySchema });
        setEntryBackup({});
    }

    async function getLedgers(economic_year) {
        statusHandler.toggleSearching();
        const schoolId = user?.profile?.school || user?.profile?.id;
        const [, , ledgers] = await __search("/accounting/search/ledgers", {
            school: schoolId,
            economic_year,
            ledger_groups,
            as_options: true,
        });
        if (ledgers) {
            setMajorLedgers(ledgers);
            setMappedLedgerGroups(Object.values(ledgers).reduce((acc, [ledger]) => {
                if (ledger) {
                    acc[ledger.value] = ledger.ledger_group; // value is id;
                }
                return acc;
            }, {}));
        } else {
            updateNotification(404, "Ledgers Not found! Create them first!");
        }
        statusHandler.toggleSearching();
    }
    function onClose() {
        setEntry(null);
    }

    function loadEditingData() {
        const _tempStateKey = `${ENTRIES.INCOME.name}__edit`;
        const tempStateData = getTempState(_tempStateKey);
        if (tempStateData) {
            setData({ ...incomeEntrySchema, ...tempStateData });
            setEntryBackup({ ...incomeEntrySchema, ...tempStateData });
            return true;
        }
        return false;
    }

    useEffect(() => {
        if (year?.accounting_economic_year && !selectedYear) setSelectedYear(year.accounting_economic_year);
    }, [year?.accounting_economic_year]);

    useEffect(() => {
        if (selectedYear && !isClosed) {
            (async () => {
                incomeEntrySchema["economic_year"] = selectedYear;
                await getLedgers(selectedYear);
                //
                const loaded = loadEditingData();
                if (!loaded) {
                    setData({ ...incomeEntrySchema, mode: '1' });
                }
            })();
        }
    }, [selectedYear, isClosed]);

    useEffect(() => {
        if (modeChanged) {
            setData(state => ({ ...state, ledger: '' }));
            setLedgerGroupType('');
        }
    }, [data?.mode]);

    return (
        <>
            <ButtonsSecion>
                <SeeLogsButton href={"admin#accounting.income-entries"} name={"Income entries"} />
            </ButtonsSecion>
            <Section>
                <SelectInput input={{ name: 'economic_year', label: "Fiscal Year", options: years?.allAccountingEconomicYears || [] }}
                    value={selectedYear} onChange={onYearChange} />
            </Section>
            {isClosed ?
                <>
                    <p className="px-2 py-2 text-sm font-semibold text-amber-700">
                        This fiscal year is closed — new entries and edits are disabled. You can view/reprint its vouchers below.
                    </p>
                    <RecentEntriesView id={ENTRIES.INCOME.ID} name={ENTRIES.INCOME.name}
                        apiPath={ENTRIES.INCOME.apiPath} pagePath={ENTRIES.INCOME.pagePath}
                        tableColumns={INCOME_ENTRIES_TCs} tag={ENTRIES.INCOME.tag}
                        economicYear={selectedYear} hideYearSelector />
                </>
                :
                (searching || !selectedYear) ? <Loader /> :
                <>
                    <form onSubmit={onIncomeEntrySave}>
                        <Section title={"Income Entry"}>
                            <TextInput input={{ name: 'date', label: "Date" }} value={data?.date} onChange={onChange} />
                            <AccountingPaymentMethods value={data?.mode} onChange={onChange} />
                            <SelectInput input={{ name: 'ledger', label: "Ledger", options: majorLedgers?.[MLG?.[data.mode]] || [] }}
                                value={data?.ledger} info={ledgerGroupType} onChange={onChange} />
                        </Section>
                        {/* PARTICULARS-ENTRY-FORM */}
                        <div className="p-2 mb-4 bg-blue-gray-50 flex flex-col gap-y-2 rounded-md shadow-sm mx-auto">
                            <div className="mygrid !grid-cols-15 rounded-none">
                                <Typography variant="paragraph"
                                    color="blue-gray"
                                    className="sm:col-span-1 font-semibold capitalize p-2">
                                    S.N.
                                </Typography>
                                {
                                    ["Ledger", "Amount", "Remarks"].map((title, ti) => (
                                        <Typography key={ti} variant="paragraph"
                                            color="blue-gray"
                                            className="sm:col-span-4 font-semibold capitalize p-2">
                                            {title}
                                        </Typography>
                                    ))
                                }
                                <Typography variant="paragraph"
                                    color="blue-gray"
                                    className="text-center sm:col-span-2 font-semibold capitalize p-2">
                                    Actions
                                </Typography>
                            </div>
                            <>
                                {
                                    (data?.particulars || []).map(((particular, index) => (
                                        <div key={index}
                                            className={`mygrid !grid-cols-15 p-2 ${particular?.ledger === entryBackup?.ledger ? '!hidden' : ''}`}>
                                            <span className="text-xl sm:col-span-1">{index + 1}.</span>
                                            <SearchInput input={{ name: 'ledger', label: "Ledger", hideLabel: true, options: majorLedgers?.[MLG.INDIRECT_INCOME] || [] }}
                                                value={particular?.ledger} onChange={onParticularsChange.bind(null, index)} />
                                            <TextInput input={{ name: 'amount', label: '', hideLabel: true, type: 'number' }}
                                                value={particular?.amount} onChange={onParticularsChange.bind(null, index)} />
                                            <TextInput input={{ name: 'remarks', label: '', hideLabel: true }}
                                                value={particular?.remarks} onChange={onParticularsChange.bind(null, index)} />
                                            <div className="sm:col-span-2 grid justify-center">
                                                <Tooltip content="Remove particular">
                                                    <Button type="button" className="px-3 py-2" variant="text" onClick={() => {
                                                        onRemoveParticular(index);
                                                    }}>
                                                        <XMarkIcon className="icon !font-bold" />
                                                    </Button>
                                                </Tooltip>
                                            </div>
                                        </div>
                                    )))
                                }
                            </>
                            <ButtonsSecion className={"px-2"}>
                                <Tooltip content="Clear all particulars">
                                    <Button className="px-3 py-2" variant="outlined" onClick={clearAllParticulars}>
                                        <XMarkIcon className="icon" />
                                    </Button>
                                </Tooltip>
                                <Tooltip content="Add new particular">
                                    <Button className="px-3 py-2" variant="outlined" onClick={onAddNewParticular}>
                                        <PlusIcon className="icon" />
                                    </Button>
                                </Tooltip>
                            </ButtonsSecion>
                        </div>
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={onReset}>Reset</Button>
                            <FormSaveButton saving={uploading} isUpdate={data?.id} disabled={!allowEntry()} />
                        </ButtonsSecion>
                    </form>
                    {
                        entry &&
                        <EntriesSection id={ENTRIES.INCOME.ID} name={ENTRIES.INCOME.name}
                            entry={entry} onClose={onClose} />
                    }
                </>
            }
        </>
    )
}

export default IncomeEntry;