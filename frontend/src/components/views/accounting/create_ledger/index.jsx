import FormSaveButton from "@/components/buttons/FormSaveButton";
import SeeLogsButton from "@/components/buttons/SeeLogsButton";
import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { ledgerSchema } from "@/schemas/accounting";
import { Button } from "@material-tailwind/react";
import { useCallback, useEffect, useState } from "react";
import { getLedgerType } from "..";
import { saveAccountingLedger } from "@/services/functions/accounting/accounting_ledgers";
import { useTempState } from "@/contexts/TempStateContext";
import tempStateKeys from "../../tempStateKeys";
import { BALANCE_TYPES_OPTIONS, LEDGER_GROUPS_OPTIONS } from "../ledger_groups";
import accountingLedgerValidationSchema from "@/schemas/accounting/validations/accounting-ledger";

function CreateLedger() {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    ledgerSchema["school"] = user?.profile?.school || user?.profile?.id;
    ledgerSchema["economic_year"] = year?.accounting_economic_year;
    const [data, setData] = useState({ ...ledgerSchema });
    const [errors, setErrors] = useState({});
    const { uploading, statusHandler } = useRequestStatus();
    const { getTempState } = useTempState();

    function onChange({ name, value }) {
        setData(state => {
            let extra = {};
            if (name === "ledger_group") {
                extra["balance_type"] = getLedgerType(value);
            }
            return {
                ...state,
                [name]: value,
                ...extra,
            };
        });
    }
    const onBlur = useCallback(async ({ name, value }) => {
        try {
            await accountingLedgerValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }, []);

    async function onCreateLedger(e) {
        e.preventDefault();
        try {
            await accountingLedgerValidationSchema.validate(data);
            console.log(data);
            statusHandler.toggleUploading();
            const [status, msg,] = await saveAccountingLedger(data);
            updateNotification(status, msg);
            statusHandler.toggleUploading();
            if (status === 200) {
                onReset();
            }
        } catch ({ message }) {
            updateNotification(400, message);
        }
    }
    function onReset() {
        setData({ ...ledgerSchema });
    }

    const KEY = tempStateKeys.ACC_LEDGER;
    useEffect(() => {
        const tempStateData = getTempState(KEY, true);
        if (tempStateData) {
            setData({ ...ledgerSchema, ...tempStateData });
        }
    }, []);

    return (
        <>
            <ButtonsSecion>
                <SeeLogsButton name={"Ledgers"} href={"admin#accounting.ledgers"} />
            </ButtonsSecion>
            <form onSubmit={onCreateLedger}>
                <Section title={"Create Ledger"}>
                    <TextInput input={{ name: 'name', label: "Ledger name" }}
                        value={data?.name} error={errors?.name} onChange={onChange} onBlur={onBlur} />
                    <SearchInput input={{ name: 'ledger_group', label: "Ledger group", options: LEDGER_GROUPS_OPTIONS }}
                        value={data?.ledger_group} error={errors?.ledger_group} onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'address', label: "Address" }}
                        value={data?.address} error={errors?.address} onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'contact', label: "Contact" }}
                        value={data?.contact} error={errors?.contact} onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'opening_balance', label: "Opening balance (Unsigned)", type: "number" }}
                        value={data?.opening_balance} error={errors?.opening_balance} onChange={onChange} onBlur={onBlur} />
                    <SelectInput input={{ name: 'balance_type', label: "Balance's type", options: BALANCE_TYPES_OPTIONS }}
                        value={data?.balance_type} error={errors?.balance_type} onChange={onChange} onBlur={onBlur} />
                </Section>
                <ButtonsSecion>
                    <Button onClick={onReset} variant="outlined">Reset</Button>
                    <FormSaveButton saving={uploading} isUpdate={data?.id}
                        disabled={uploading || !data?.school || !data?.economic_year} />
                </ButtonsSecion>
            </form>
        </>
    )
}

export default CreateLedger;