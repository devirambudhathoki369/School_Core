import SeeLogsButton from "@/components/buttons/SeeLogsButton";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { useEffect, useState } from "react";
import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { Button, Tooltip, Typography, Textarea } from "@material-tailwind/react";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { journalEntrySchema, journalParticularSchema } from "@/schemas/accounting";
import { __save, __search, __update } from "@/services/functions";
import Loader from "@/components/Loader";
import { BALANCE_TYPES } from "../ledger_groups";
import { getLedgerGroup } from "..";
import EntriesSection from "../EntriesSection";
import RecentEntriesView from "../RecentEntriesView";
import { JOURNAL_ENTRIES_TCs } from "../tableColumnsConfig";
import { CREDIT, DEBIT, ENTRIES } from "../acc_constants";
import { useTempState } from "@/contexts/TempStateContext";

const ledger_groups = [];
function JournalEntry() {
    const { user: { user }, fiscalYear: { year, years, isAccountingYearClosed }, notification: { updateNotification } } = useAppContext();
    // fiscal year to work in: current open year = create/edit; a past/closed
    // year = read-only (form hidden, only view/reprint its vouchers below).
    const [selectedYear, setSelectedYear] = useState(year?.accounting_economic_year || '');
    const isClosed = isAccountingYearClosed?.(selectedYear);
    function onYearChange({ value }) { setSelectedYear(value); }
    journalEntrySchema["school"] = user?.profile?.school || user?.profile?.id;
    journalEntrySchema["date"] = user?.today;
    const [data, setData] = useState({ ...journalEntrySchema });
    const [ledgers, setLedgers] = useState({});
    const [entry, setEntry] = useState(null);
    const [total, setTotal] = useState(0);
    const { uploading, searching, statusHandler } = useRequestStatus();
    const { getTempState } = useTempState();

    function onChange({ name, value }) {
        setData(state => ({ ...state, [name]: value }));
    }
    function onAddNewParticular() {
        setData(state => {
            const newEntry = {
                ...journalParticularSchema,
            };
            const _pars = state?.particulars ? [...state.particulars, newEntry] : [newEntry];
            return {
                ...state,
                particulars: _pars,
            }
        });
    }
    function onRemoveParticular(index) {
        setData(state => {
            let _pars = state?.particulars ? [...state.particulars] : [];
            _pars.splice(index, 1);
            setTotal(getSingleSideTotal(_pars));
            return {
                ...state,
                particulars: _pars,
            };
        });
    }
    function clearAllParticulars() {
        setData(state => ({ ...state, particulars: [] }));
        setTotal(0);
    }
    function onParticularsChange(index, { name, value }) {
        setData(state => {
            let _pars = state?.particulars ? [...state.particulars] : [];
            if (name === "dr_amount") {
                _pars[index]["type"] = DEBIT;
                _pars[index]["amount"] = roundAmount(value) || 0;
                setTotal(getSingleSideTotal(_pars));
            } else if (name === "cr_amount") {
                _pars[index]["type"] = CREDIT;
                _pars[index]["amount"] = roundAmount(value) || 0;
                setTotal(getSingleSideTotal(_pars));
            } else {
                _pars[index] = { ..._pars[index], [name]: value };
            }

            return {
                ...state,
                particulars: _pars,
            };
        });
    }
    function roundAmount(value) {
        // Guard against binary floating-point drift (e.g. 206.48 + 15347.97 => 15554.449999999999)
        return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
    }
    function getSingleSideTotal(particulars) {
        const drItems = particulars.filter(p => p.type == DEBIT);
        const crItems = particulars.filter(p => p.type == CREDIT);

        if (crItems.length > 1 && drItems.length > 1) return "!";

        if (crItems.length > 1) {
            return roundAmount(crItems.reduce((sum, p) => sum + p.amount, 0));
        } else if (drItems.length > 1) {
            return roundAmount(drItems.reduce((sum, p) => sum + p.amount, 0));
        }
    }

    function validateParticulars(data) {
        const { particulars } = data || {};
        if (!particulars?.length) return false;
        let drTotal = 0, crTotal = 0, drCount = 0, crCount = 0;
        for (const par of particulars) {
            if (!par?.ledger || !par?.type || !par?.amount) {
                return false;
            }
            const amt = parseFloat(par.amount);
            const type = parseInt(par.type);
            if (type === BALANCE_TYPES.DEBIT.value) {
                drTotal += amt;
                drCount++;
            }
            else if (type === BALANCE_TYPES.CREDIT.value) {
                crTotal += amt;
                crCount++;
            }
            else return false;
        }
        return roundAmount(drTotal) === roundAmount(crTotal) && (
            (crCount > 1 && drCount === 1) ||
            (drCount > 1 && crCount === 1) ||
            (crCount === 1 && drCount === 1)
        );
    }
    function allowEntry() {
        return (
            data?.school && data?.economic_year && data?.date
        )
    }

    async function saveEntry(apiPath, data) {
        if (data?.id) return __update(apiPath, data);
        return __save(apiPath, data);
    }

    async function onJournalEntrySave(e) {
        e.preventDefault();
        if (!validateParticulars(data)) {
            updateNotification(500, "Entry is Invalid!");
            return;
        }
        // return;
        statusHandler.toggleUploading();
        const uploadData = {
            ...data,
            particulars: data.particulars.sort((a, b) => a.type - b.type),
        }
        const [status, msg, res] = await saveEntry(ENTRIES.JOURNAL.apiPath, uploadData);
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
        setData({ ...journalEntrySchema });
        setTotal(0);
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
            const _ledgers = ledgers.reduce((acc, ledger) => {
                let ledgerGroupName = getLedgerGroup(ledger.ledger_group)?.name;
                acc.push({ ...ledger, name: `${ledger.name} [${ledgerGroupName}]` });
                return acc;
            }, []);
            setLedgers(_ledgers);
        } else {
            updateNotification(404, "Ledgers Not found! Create them first!");
        }
        statusHandler.toggleSearching();
    }
    function onClose() {
        setEntry(null);
    }

    function loadEditingData() {
        const _tempStateKey = `${ENTRIES.JOURNAL.name}__edit`;
        const tempStateData = getTempState(_tempStateKey);
        if (tempStateData) {
            setData({ ...journalEntrySchema, ...tempStateData });
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
                journalEntrySchema["economic_year"] = selectedYear;
                await getLedgers(selectedYear);
                //
                const loaded = loadEditingData();
                if (!loaded) {
                    setData({ ...journalEntrySchema });
                }
            })();
        }
    }, [selectedYear, isClosed]);

    return (
        <>
            <ButtonsSecion>
                <SeeLogsButton href={"admin#accounting.journal-entries"} name={"Journal entries"} />
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
                    <RecentEntriesView id={ENTRIES.JOURNAL.ID} name={ENTRIES.JOURNAL.name}
                        apiPath={ENTRIES.JOURNAL.apiPath} pagePath={ENTRIES.JOURNAL.pagePath}
                        tableColumns={JOURNAL_ENTRIES_TCs} tag={ENTRIES.JOURNAL.tag}
                        economicYear={selectedYear} hideYearSelector />
                </>
                :
                searching ? <Loader /> :
                <>
                    <form onSubmit={onJournalEntrySave}>
                        <Section title={"Journal Entry"}>
                            <TextInput input={{ name: 'date', label: "Date" }} value={data?.date} onChange={onChange} />
                        </Section>
                        <div className="p-2 mb-4 flex flex-col gap-y-2 bg-blue-gray-50 shadow-sm rounded-md mx-auto">
                            <div className="flex text-xl text-black font-bold gap-x-2 float-end p-2 w-max rounded-md">
                                <span>Total :</span>
                                <span>{total}</span>
                            </div>
                            <hr className="border-gray-500" />
                            <div className="mygrid !grid-cols-19 rounded-none">
                                <Typography variant="paragraph"
                                    color="blue-gray"
                                    className="sm:col-span-1 font-semibold capitalize p-2">
                                    S.N.
                                </Typography>
                                {
                                    ["Ledger", "Debit", "Credit", "Narration"].map((title, ti) => (
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
                                        <div key={index} className="mygrid !grid-cols-19 p-2">
                                            <span className="text-xl sm:col-span-1">{index + 1}.</span>
                                            <SearchInput input={{ name: 'ledger', label: "Ledger", hideLabel: true, options: ledgers || [] }}
                                                value={particular?.ledger} onChange={onParticularsChange.bind(null, index)} />
                                            <TextInput input={{ name: 'dr_amount', label: '', hideLabel: true, type: 'number' }}
                                                value={particular?.type === DEBIT ? (particular?.amount || "") : ""} onChange={onParticularsChange.bind(null, index)} />
                                            <TextInput input={{ name: 'cr_amount', label: '', hideLabel: true, type: 'number' }}
                                                value={particular?.type === CREDIT ? (particular?.amount || "") : ""} onChange={onParticularsChange.bind(null, index)} />
                                            <TextInput input={{ name: 'remarks', label: '', hideLabel: true }} value={particular?.remarks} onChange={onParticularsChange.bind(null, index)} />
                                            <div className="sm:col-span-2 grid justify-center">
                                                <Tooltip content="Remove particular">
                                                    <Button type="button" className="px-3 py-2" variant="text"
                                                        onClick={() => onRemoveParticular(index)}>
                                                        <XMarkIcon className="icon" />
                                                    </Button>
                                                </Tooltip>
                                            </div>
                                        </div>
                                    )))
                                }
                            </>
                            <ButtonsSecion className={"px-2"}>
                                <Tooltip content="Clear all particulars">
                                    <Button type="button" className="px-3 py-2" variant="outlined" onClick={clearAllParticulars}>
                                        <XMarkIcon className="icon" />
                                    </Button>
                                </Tooltip>
                                <Tooltip content="Add new particular">
                                    <Button type="button" className="px-3 py-2" variant="outlined" onClick={onAddNewParticular}>
                                        <PlusIcon className="icon" />
                                    </Button>
                                </Tooltip>
                            </ButtonsSecion>
                        </div>
                        <div className="flex">
                            <div className="textarea w-1/2">
                                <Textarea value={data?.remarks || ''} name="remarks" label="Remarks"
                                    onChange={(e) => {
                                        const { name, value } = e.target;
                                        onChange({ name, value });
                                    }} />
                            </div>
                        </div>
                        <ButtonsSecion>
                            <Button type="button" variant="outlined" onClick={onReset}>Reset</Button>
                            <FormSaveButton saving={uploading} isUpdate={data?.id} disabled={!allowEntry()} />
                        </ButtonsSecion>
                    </form>
                    {
                        entry &&
                        <EntriesSection id={ENTRIES.JOURNAL.ID} name={ENTRIES.JOURNAL.name}
                            entry={entry} onClose={onClose} />
                    }
                </>
            }
        </>
    )
}

export default JournalEntry;