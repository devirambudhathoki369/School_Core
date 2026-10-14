import { object } from "yup";
import {
    date_required, name, select, location, email, EMAIL_SIZE, text,
    full_name_required, contact, CONTACT_SIZE, name_optional, date,
    number,
    float_number,
    document_no
} from ".";
import { flattenValidationSchema } from "../../methods/FlattenSchema";

const _staffValidationSchema = {
    ...{
        role: select("Staff Role").must(),
        status: select("Status").must(),
        first_name: name("First Name"),
        middle_name: name_optional("Middle Name"),
        last_name: name("Last Name"),
        ...{
            primary_contact: contact("Primary Contact").must().size(...CONTACT_SIZE),
            secondary_contact: contact("Secondary Contact").size(...CONTACT_SIZE),
        },
        // ...{
        //     primary_subject: select("Primary subject"),
        //     secondary_subject: select("Secondary subject"),
        // },
        location: location("Location"),
    },
    // 
    account: {
        username: text('Username').size(6, 25),
        password: text('Password').size(6, 15)
    },
    other_info: {
        father_name: full_name_required("Father's name"),
        mother_name: full_name_required("Mother's name"),
        birth_date: date_required("Birth Date"),
        gender: select('Gender').must(),
        email: email().size(...EMAIL_SIZE),
        joined_date: date("Joined date"),
        marrital_status: select("Marrital status"),
        citizenship_no: document_no("Citizenship No.").size(1, 30),
        // 
        ...{
            basic_salary: float_number("Basic salary (Net)"),
            // Funds is an EARNING, like the basic salary — posted with the
            // month, paid on the same receipt. Same validator as salary.
            funds: float_number("Funds"),
            grade: number("Grade"),
            allowance: number("Allowance"),
            extra: number("Extra"),
            pan_no: text('Pan No.').size(1, 20),
            insurance: float_number("Insurance"),
            pf_contrib: float_number("PF Contribution (%)"),
        },
        // 
        ...{
            qualification: text("Qualification").size(3, 300),
            experience: text("Experience").size(3, 300),
        },
        // 
        ethnicity: select("Ethnicity"),
        sport: select("Sport"),
        blood_group: select("Blood group"),
    }
}

export const staffRoleValidationSchema = object({
    role: text("Staff role").must().size(2, 30)
});
/* 
console.log(_staffValidationSchema);
const x = flattenValidationSchema(_staffValidationSchema);
console.log(Object.keys(x).length);
console.log(x); 
*/
const staffValidationSchema = object(flattenValidationSchema(_staffValidationSchema));
export default staffValidationSchema;