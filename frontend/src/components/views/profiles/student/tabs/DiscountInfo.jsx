import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SearchInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { deleteAction, editAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import { useStudentProfile } from "@/contexts/StudentProfile";
import useRequestStatus from "@/hooks/requestStatus";
import { getStudentDiscounts } from "@/services/functions/students";
import { Button, Textarea } from "@material-tailwind/react";
import { useEffect } from "react";
import { ALL_SECTIONS } from "..";

function DiscountInfoTab({ tab }) {
    const { user: { user } } = useAppContext();
    const { data: { studentBackup, titles, titleMappings, titleRates },
        view: { currentTab },
        discount: { discountForm, discounts, setDiscounts,
            onDiscountEdit, onDiscountDelete, onDiscountInfoChange, onDiscountSave, resetDiscountForm, savingDiscount,
            fetchStudentTransportationAsTitle } } = useStudentProfile();
    const { fetching, statusHandler } = useRequestStatus();
    //
    useEffect(() => {
        (async () => {
            if (currentTab === tab.key || currentTab === ALL_SECTIONS) {
                statusHandler.toggleFetching();
                await fetchStudentTransportationAsTitle();
                let _discounts = await getStudentDiscounts(studentBackup?.ids?.sid, user?.profile?.school || user?.profile?.id);
                _discounts = _discounts.map(item =>
                    ({ ...item, title_name: titleMappings?.[item.title.toString()] }));
                setDiscounts(_discounts);
                statusHandler.toggleFetching();
            }
        })();
    }, [studentBackup?.ids?.sid, currentTab]);
    return (
        <>
            <>
                <form onSubmit={onDiscountSave}>
                    <Section title={"Discount details"}>
                        <SearchInput input={{ name: 'title', label: 'Discount title', placeholder: 'Choose fee title', options: titles }}
                            value={discountForm?.title || ''} onChange={({ name, value }) => {
                                onDiscountInfoChange({ name, value });
                            }} info={discountForm?.title ? `Rate : ${titleRates?.[discountForm.title] || ''}` : ''} />
                        <TextInput input={{ name: 'discount', label: 'Discount amount', placeholder: 'Enter discount amount', readOnly: !discountForm?.title }}
                            value={discountForm?.discount || ''} onChange={onDiscountInfoChange} />
                        <TextInput input={{ name: 'percentage', label: 'Discount percentage', placeholder: 'Enter discount percentage', readOnly: !discountForm?.title }}
                            value={discountForm?.percentage} onChange={onDiscountInfoChange} />
                        <div className="sm:col-span-4">
                            {/* the column holds 50 characters: stop at 50 here
                                rather than take a longer note and refuse it */}
                            <Textarea value={discountForm?.remarks} className="!text-base" name="remarks" label="Remarks"
                                maxLength={50}
                                onChange={(e) => {
                                    const { name, value } = e.target;
                                    onDiscountInfoChange({ name, value });
                                }} />
                            {/* <Error /> */}
                        </div>
                    </Section>
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={() => {
                            resetDiscountForm();
                        }}>Reset</Button>
                        <FormSaveButton isUpdate={discountForm?.id} saving={savingDiscount} />
                    </ButtonsSecion>
                </form>
            </>
            <>
                {(titles?.length > 0 && discounts?.length > 0) ?
                    <BasicTable name={"Discounts"} columns={[
                        ['title_name', 'title'],
                        ['percentage', 'discount percentage'],
                        ['discount', 'discount amount'],
                        ['remarks']
                    ]} data={
                        // Resolve the title name at render time from the current
                        // mappings: on first load the discounts are fetched before
                        // titleMappings is populated, so a name baked in at fetch
                        // time would stay blank forever.
                        discounts.map(d => ({ ...d, title_name: titleMappings?.[String(d.title)] || d.title_name || '' }))
                    } onSelect={(action, id) => {
                        if (action === editAction.action) onDiscountEdit(id);
                        else if (action === deleteAction.action) onDiscountDelete(id);
                    }} actions={[editAction, deleteAction]}
                        loading={discounts?.length < 1} />
                    :
                    <>
                        {
                            fetching ? <Loader /> : <NotFound />
                        }
                    </>
                }
            </>
        </>
    )
}

export default DiscountInfoTab;