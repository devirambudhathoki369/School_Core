import { object, string } from "yup";

const superadminValidationSchema = object({
    full_name: string().label('Full name').trim().must().size(4, 30),
    username: string().label('Username').trim().must().size(6, 25),
    password: string().label('Password').trim().must().size(6, 15),
});

export default superadminValidationSchema;