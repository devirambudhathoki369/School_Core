import { SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import { Button, Textarea } from "@material-tailwind/react";
import { useState } from "react";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import BasicTable from "@/components/tables/BasicTable";
import { deleteAction } from "@/components/tables/actions";
import useRequestStatus from "@/hooks/requestStatus";
import { fillData, flattenSchema } from "@/methods/FlattenSchema";
import { makePayment } from "@/services/functions/payments";
import BillsSection from "../student/BillsSection";
import fastCashSchema, { KEYS, particularSchema } from "@/schemas/fastcashschema";
import { PAYMENT_MODES } from "@/configs/payment";
import fastCashValidationSchema from "@/schemas/validations/fastCash";
import { generateInvoice } from "@/methods/payment/invoice";

const _schema = flattenSchema(fastCashSchema);

function FastCashReceipt() {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    _schema['school'] = user?.profile?.school || user?.profile?.id;
    _schema['date'] = user?.today;
    _schema['academic_year'] = year?.academic_year;
    _schema['economic_year'] = year?.economic_year;
    // 
    const [input, setInput] = useState({ ..._schema });
    const [errors, setErrors] = useState({});
    const [invoice, setInvoice] = useState(null);
    const { uploading, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }
    function onParticularChange(index, col, value) {
        if (col === KEYS.AMOUNT) value = parseFloat(value);
        setInput(state => {
            const ns = { ...state };
            ns.details[index] = { ...ns.details[index], [col]: value };
            ns.total_paid = ns.details.reduce((acc, detail) => {
                acc += detail?.[KEYS.AMOUNT] || 0;
                return acc;
            }, 0);
            return ns;
        });
    }
    async function onBlur({ name, value }) {
        try {
            await fastCashValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }
    function onAddParticular() {
        setInput(state => {
            const ns = { ...state };
            const index = ns?.details?.length || 0;
            ns.details = [...ns.details, { id: index, ...particularSchema }];
            return ns;
        });
    }
    function deleteParticular(particularIndex) {
        setInput(state => {
            const ns = { ...state };
            ns.details = ns.details.filter((_, index) => index !== particularIndex);
            return ns;
        });
    }
    function onReset() {
        setInput(_schema);
    }

    function validateData(uploadData) {
        // removing id from each details, as they were used for table;
        uploadData["details"] = uploadData?.details?.map(({ id, ...data }) => ({ ...data }));
        // check if none are invalid;
        const areParticularsCorrect = uploadData?.details?.every(e => {
            const amount = e?.[KEYS.AMOUNT];
            return e?.[KEYS.PARTICULAR] && amount && amount > 0;
        });
        if (areParticularsCorrect) return uploadData;
    }

    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        // 
        try {
            await fastCashValidationSchema.validate(input);
            let uploadData = fillData(fastCashSchema, input);
            uploadData = validateData(uploadData);
            if (uploadData) {
                const [status, message, res] = await makePayment(uploadData);
                updateNotification(status, message);
                if (status === 200) {
                    if (res?.invoice) {
                        const _invoice = generateInvoice(res?.invoice, user?.profile);
                        setInvoice(_invoice);
                    }
                    onReset();
                }
            } else {
                updateNotification('', "Invalid data!");
            }
        } catch ({ message }) {
            updateNotification('', message);
        }
        statusHandler.toggleUploading();
    }

    return (
        <>
            <form onSubmit={onSave}>
                <div className="flex flex-col">
                    {/* `Section` is what gives a page its surface, its heading and
                        the shared field rhythm — this form was a bare grid, so on
                        a phone the labels and inputs sat straight on the canvas
                        with nothing holding them together. */}
                    <Section title="Receipt details">
                        <TextInput value={input?.date} onChange={onChange} input={{
                            name: 'date', label: 'Date (BS)'
                        }} onBlur={onBlur} error={errors?.date} />
                        <TextInput value={input?.name} onChange={onChange} input={{
                            name: 'name', label: 'Name'
                        }} onBlur={onBlur} error={errors?.name} />
                        <TextInput value={input?.address} onChange={onChange} input={{
                            name: 'address', label: 'Address'
                        }} onBlur={onBlur} error={errors?.address} />
                        <TextInput value={input?.total_paid} onChange={onChange} input={{
                            name: 'total_paid', label: 'Total', readOnly: true
                        }} />
                        <SelectInput value={input?.mode} onChange={onChange}
                            input={{ name: 'mode', label: "Payment mode", options: PAYMENT_MODES }} />
                        <div className="sm:col-span-8">
                            <Textarea value={input?.remarks || ''} name="remarks" label="Remarks"
                                onChange={(e) => {
                                    const { name, value } = e.target;
                                    onChange({ name, value });
                                }} />
                        </div>
                    </Section>
                    <BasicTable name={"Particulars"} data={input?.details || []} columns={[
                        [KEYS.PARTICULAR, 'particular'], [KEYS.AMOUNT, 'amount']
                    ]}
                        editable={true} editableColumns={[[KEYS.PARTICULAR], [KEYS.AMOUNT]]}
                        actions={[deleteAction]} showSelected={false}
                        onSelect={(action, _, item) => {
                            if (action === deleteAction.action) deleteParticular(item.id);
                        }} onChange={onParticularChange} onBlur={() => null} footer={
                            <ButtonsSecion>
                                <Button variant="outlined" onClick={onAddParticular}>Add particular</Button>
                            </ButtonsSecion>
                        } />
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={onReset}>Reset</Button>
                        <FormSaveButton saving={uploading} isUpdate={false} disabled={!input?.date || !input?.name || !input?.address} />
                    </ButtonsSecion>
                </div>
            </form >
            <BillsSection invoice={invoice} onClose={() => {
                setInvoice(null);
            }} />
        </>
    )
}

export default FastCashReceipt;