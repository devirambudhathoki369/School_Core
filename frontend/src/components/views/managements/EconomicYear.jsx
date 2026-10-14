import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { applyAction } from "@/components/tables/actions";

import YearProvider, { useYear } from "@/contexts/FiscalYearContext";
import { economicYearSchema } from "@/schemas/fiscal-year";
import { economicYearValidationSchema } from "@/schemas/validations/fiscal-year";
import { getEconomicYears, saveEconomicYear } from "@/services/functions/fiscalYear";
import { Button } from "@material-tailwind/react";

const _applyAction = applyAction("Apply economic year to all schools!");

function ManageEconomicYear() {
    const { data: { year, years, errors },
        methods: { onChange, onBlur, onSubmit, reset, onSelect },
        status: { uploading } } = useYear();
    return (
        <>
            <form onSubmit={onSubmit}>
                <Section title={"Economic year setup"} grid={2}>
                    <TextInput value={year?.name} input={{ label: 'Name', name: 'name' }} error={errors?.name}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput value={year?.start_date} input={{ label: 'Start date (BS)', name: 'start_date' }} error={errors?.start_date}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput value={year?.end_date} input={{ label: 'End date(BS)', name: 'end_date' }} error={errors?.end_date}
                        onChange={onChange} onBlur={onBlur} />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={reset}>Reset</Button>
                    <FormSaveButton saving={uploading} disabled={uploading} />
                </ButtonsSecion>
            </form>
            <BasicTable name={"Economic Years"} data={years} columns={[
                ['name'],
                ['start_date', 'start date'],
                ['end_date', 'end date']
            ]} actions={[_applyAction]} onSelect={onSelect} showSelected={false} />
        </>
    )
}

export default function () {
    return (
        <YearProvider yearSchema={economicYearSchema} validationSchema={economicYearValidationSchema}
            /* The provider hands its fetcher a SCHOOL ID, but the economic year
               is nationwide and `getEconomicYears`' first argument is
               `as_options`. Passing it through turned every row into
               `{name, value}`, so this table has been showing its years with
               both date columns blank. Swallow the argument. */
            getYearsFunction={() => getEconomicYears()} saveYearFunction={saveEconomicYear}
            contextType={"Economic"}>
            <ManageEconomicYear />
        </YearProvider>
    )
}