import { string, number as _number, boolean, addMethod, Schema } from "yup";
// CUSTOM METHODS;
addMethod(Schema, 'must', function () {
    return this.required(`${this.spec.label} is required!`);
});
addMethod(Schema, 'size', function (min, max) {
    return this.test({
        name: 'size',
        message: `${this.spec.label} must be between ${min} and ${max} characters`,
        test: function (value) {
            if (typeof value === 'string' && value.length > 0) {
                return value.length >= min && value.length <= max;
            }
            return true;
        }
    });
});
// 
export const EMAIL_SIZE = [12, 50];
export const CONTACT_SIZE = [10, 10];
const DATE_VALIDATION = /^\d{4}-\d{2}-\d{2}$/,
    DATE_VALIDATION_ERROR = "Please use the format YYYY-MM-DD!";
const DEFAULT_NAME_SIZE = [2, 20];
// 
// # everything is optional, add `.must()` for required input;

/** text : string, cast : [trimmed, lowercased] */
export const text = (label) => string().label(label).nullable().trim().lowercase();
/** document_no : string, optional, cast : [trimmed] — kept as typed, since an
 * id printed on a certificate is not ours to re-case. */
export const document_no = (label) => string().label(label).nullable().trim();
/** date : string, optional, match [yyyy-m-d || yyyy-mm-dd] */
export const date = (label) => string().label(label).nullable().matches(DATE_VALIDATION,
    { excludeEmptyString: true, message: DATE_VALIDATION_ERROR });
/** just to manage orders of error, created this one, and use this if date field is required. */
export const date_required = (label) => string().label(label).must().matches(DATE_VALIDATION,
    { excludeEmptyString: true, message: DATE_VALIDATION_ERROR });
/** number : number, required, min:10, max:10, positive integer */
const base_number = (label) => _number(label).nullable()
    .transform((value, originalValue) => originalValue === '' ? undefined : Number(originalValue))
export const number = (label) => base_number(label).integer().label(label);
export const float_number = (label) => base_number(label).label(label);
/** select : string, optional, (add .must() to make it required) */
export const select = (label) => string().nullable().label(label);
export const email = (label) => string().label(label || 'Email address').nullable().trim().email().size(...EMAIL_SIZE);
export const email_required = (label) => string().label(label || 'Email address').trim().email().must().size(...EMAIL_SIZE);
// 
export const username = () => string().label('Username').trim().must().size(6, 25)
    .matches(/^[\w.@+-]+$/, "Letters, digits and @/./+/-/_ only.");
export const password = () => string().label('Password').trim().must().size(6, 20);
export const strong_password = () => password()
    .matches(/[a-z]/, 'Password must contain at least one lowercase letter.')
    .matches(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .matches(/[0-9]/, 'Password must contain at least one number.')
    .matches(/[@$!%*#?&]/, 'Password must contain at least one special character from the following: @$!%*#?&.');
// ... .notOneOf(['12345678', 'password', 'qwerty'], 'Do not use a common password.');
/** name: string, required, min:2, max:10, cast : [trimmed, lowercased] */
export const name = (label, size) => text(label).must().size(...size || DEFAULT_NAME_SIZE);
export const name_optional = (label) => text(label).nullable().size(...DEFAULT_NAME_SIZE);
/** full_name: string, required, min:2, max:10, cast : [trimmed, lowercased] */
export const full_name = (label) => text(label).nullable().size(4, 30);
export const full_name_required = (label) => text(label).must().size(4, 30);
/** location : string, required, min:2, max: 20, cast : [trimmed, lowercased] */
export const location = (label) => text(label).must().size(2, 50);
export const location_optional = (label) => text(label).nullable().size(2, 50);
/** contact : number, optional, min:10, max:10, positive integer */
export const contact = (label) => string().label(label).nullable().trim();
/*  */
export const bool = (label) => boolean().label(label).transform((value, originalValue) => {
    if (typeof originalValue === "boolean") return originalValue;
    if (typeof originalValue === "string") {
        const v = originalValue.toLowerCase().trim();
        if (v === "true" || v === "1") return true;
        if (v === "false" || v === "0") return false;
    }
    return value;
});