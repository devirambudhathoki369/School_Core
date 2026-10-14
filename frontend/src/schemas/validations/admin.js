import { boolean, object } from "yup";
import { CONTACT_SIZE, contact, date_required, email_required, text } from ".";
import { flattenSchema } from "@/methods/FlattenSchema";

const _adminValidationSchema = {
    account: {
        username: text('Username').must().size(6, 25),
        password: text('Password').must().size(6, 15)
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
    test_account: boolean().label("Account type").must(),
    uses_sms: boolean().label("Uses sms"),
    uses_mobile_app: boolean().label("Uses mobile app").must(),
};

const adminValidationSchema = object(flattenSchema(_adminValidationSchema));
export default adminValidationSchema;