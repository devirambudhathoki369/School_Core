import FormSaveButton from "@/components/buttons/FormSaveButton";
import SeeLogsButton from "@/components/buttons/SeeLogsButton";
import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { Button, Typography, Card, Tooltip } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import useRequestStatus from "@/hooks/requestStatus";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useAppContext } from "@/contexts/AppContext";
import { contraEntrySchema, accountingParticularSchema } from "@/schemas/accounting";
import { ENTRIES, MAJOR_LEDGER_GROUPS as MLG } from "../acc_constants";
import { __save, __search } from "@/services/functions";
import Loader from "@/components/Loader";
import { getLedgerType } from "..";
import EntriesSection from "../EntriesSection";

const ledger_groups = [MLG.CASH_IN_HAND, MLG.BANK];
function ContraEntry() {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    contraEntrySchema["school"] = user?.profile?.school || user?.profile?.id;
    contraEntrySchema["economic_year"] = year?.accounting_economic_year;
    contraEntrySchema["date"] = user?.today || "";
    const [data, setData] = useState({ ...contraEntrySchema });
    const [ledgerGroupType, setLedgerGroupType] = useState('');
    const [ledgers, setLedgers] = useState([]);
    const [mappedLedgerGroups, setMappedLedgerGroups] = useState({});
    const [entry, setEntry] = useState(null);
    const { uploading, searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setData(state => ({ ...state, [name]: value }));
        if (name === "ledger") {
            const mlg = mappedLedgerGroups?.[value];
            const type = getLedgerType(mlg, true) || "_";
            const str = `Transaction goes to ${type} side!`;
            setLedgerGroupType(str);
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
            data?.date && data?.ledger
        )
    }

    async function onContraEntrySave(e) {
        e.preventDefault();
        if (!validateParticulars(data)) {
            updateNotification(500, "Entry is Invalid!");
            return;
        }
        statusHandler.toggleUploading();
        const [status, msg, res] = await __save(ENTRIES.CONTRA.apiPath, data);
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
        setData({ ...contraEntrySchema });
    }

    async function getLedgers() {
        statusHandler.toggleSearching();
        const schoolId = user?.profile?.school || user?.profile?.id;
        const [, , ledgers] = await __search("/accounting/search/ledgers", {
            school: schoolId,
            ledger_groups,
            as_options: true,
        });
        if (ledgers) {
            setLedgers(Object.values(ledgers).flat());
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

    useEffect(() => {
        (async () => {
            await getLedgers();
        })();
    }, [user?.profile]);

    return (
        <>
            <ButtonsSecion>
                <SeeLogsButton href={"admin#accounting.contra-entries"} name={"Contra entries"} />
            </ButtonsSecion>
            {searching ? <Loader /> :
                <>
                    <form onSubmit={onContraEntrySave}>
                        <Section title={"Contra Entry"}>
                            <TextInput input={{ name: 'date', label: "Date" }} value={data?.date} onChange={onChange} />
                            <SelectInput input={{ name: 'ledger', label: "Ledger", options: ledgers || [] }}
                                value={data?.ledger} info={ledgerGroupType} onChange={onChange} />
                        </Section>
                        {/* PARTICULARS-ENTRY-FORM */}
                        <Card className="py-1 mb-4 flex flex-col gap-y-2">
                            <Card className="mygrid !grid-cols-15 rounded-none">
                                <Typography variant="paragraph"
                                    color="blue-gray"
                                    className="sm:col-span-1 font-semibold capitalize p-2">
                                    S.N.
                                </Typography>
                                {
                                    ["Ledger 2", "Amount", "Remarks"].map((title, ti) => (
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
                            </Card>
                            <>
                                {
                                    (data?.particulars || []).map(((particular, index) => (
                                        <Card key={index} className="mygrid !grid-cols-15 p-2">
                                            <span className="text-xl sm:col-span-1">{index + 1}.</span>
                                            <SearchInput input={{ name: 'ledger', label: "Ledger", hideLabel: true, options: ledgers || [] }}
                                                value={particular?.ledger} onChange={onParticularsChange.bind(null, index)} />
                                            <TextInput input={{ name: 'amount', label: '', hideLabel: true, type: 'number' }}
                                                value={particular?.amount} onChange={onParticularsChange.bind(null, index)} />
                                            <TextInput input={{ name: 'remarks', label: '', hideLabel: true }}
                                                value={particular?.remarks} onChange={onParticularsChange.bind(null, index)} />
                                            <div className="sm:col-span-2 grid justify-center">
                                                <Tooltip content="Remove particular">
                                                    <Button className="px-2 py-0" variant="text" onClick={() => {
                                                        onRemoveParticular(index);
                                                    }}>
                                                        <XMarkIcon className="icon !font-bold" />
                                                    </Button>
                                                </Tooltip>
                                            </div>
                                        </Card>
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
                        </Card>
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={onReset}>Reset</Button>
                            <FormSaveButton saving={uploading} disabled={!allowEntry()} />
                        </ButtonsSecion>
                    </form>
                    {
                        entry &&
                        <EntriesSection id={ENTRIES.CONTRA.ID} name={ENTRIES.CONTRA.name}
                            entry={entry} onClose={onClose} />
                    }
                </>
            }
        </>
    )
}

export default ContraEntry;