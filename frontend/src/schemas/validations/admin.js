import { boolean, object } from "yup";
import { CONTACT_SIZE, contact, date_required, email_required, select, strong_password, text } from ".";
import { flattenSchema } from "@/methods/FlattenSchema";
import { SCHOOL_MODULES } from "@/configs/moduleGates";

const _adminValidationSchema = {
    account: {
        username: text('Username').must().size(6, 25),
        // Account creation is governed by the same password policy on the
        // server. Keeping the old 6–15 character rule here allowed a password
        // the API could never accept, which surfaced only as "Invalid request!".
        password: strong_password()
    },
    name: text('Organization name').must().size(10, 50),
    address: text('Address').must().size(2, 50),
    contact: contact('Contact').size(...CONTACT_SIZE),
    telephone: contact("Telephone").size(6, 10),
    estd_date: date_required("Estd date"),
    pan_no: text('Pan No.').must().size(1, 20),
    email: email_required("Email"),
    renew_date: date_required("Renew date"),
    slogan: text("Slogan").size(5, 100),
    about_us: text("About us"),
    // The school form validates fields individually with `validateAt`. Keep
    // every rendered field in this schema: without this path, merely leaving
    // the picker produced Yup's internal "schema does not contain the path"
    // error instead of a useful required-field message.
    economic_year: select("Economic year").must(),
    test_account: boolean().label("Account type").must(),
    uses_sms: boolean().label("Uses sms"),
    uses_mobile_app: boolean().label("Uses mobile app").must(),
    // The facilities, each true/false (the server refuses anything else). Not
    // required: one the row does not carry is left as the school has it.
    ...Object.fromEntries(SCHOOL_MODULES.map(({ flag, label }) => [flag, boolean().label(label)])),
};

const adminValidationSchema = object(flattenSchema(_adminValidationSchema));
export default adminValidationSchema;
