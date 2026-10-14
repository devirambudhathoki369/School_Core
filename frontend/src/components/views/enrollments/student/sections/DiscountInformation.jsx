import { OPTION_NONE, SelectInput, TextInput } from "@/components/inputs";
import { Section } from "@/components/sections";
import { useEnrollmentContext } from "@/contexts/EnrollmentContext";

function DiscountInformationSection() {
    const { student, errors, methods } = useEnrollmentContext();
    return (
        <Section title={"Discount Information"}>
            <SelectInput value={student?.discount_type} error={errors?.discount_type} {...methods} input={{
                name: 'discount_type', label: 'Discount Type', options: [
                    OPTION_NONE,
                    { name: 'One time (fixed amount)', value: "1" },
                    { name: 'One time (percentage)', value: "2" },
                    { name: 'Recurring (fixed amount)', value: "3" },
                    { name: 'Recurring (percentage)', value: "4" }
                ]
            }} />
            {(student?.discount_type && student?.discount_type > 0) &&
                <TextInput value={student?.discount} error={errors?.discount} {...methods} input={{
                    name: 'discount', label: 'Discount',
                    type: 'number'
                }} />
            }
        </Section >
    )
}

export default DiscountInformationSection;

/* Discount types
1. One time discount - discount on new enrollment/registration
2. Discount per year/semester
3. 
*/