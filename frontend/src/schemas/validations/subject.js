import { text, select, number, float_number } from ".";

const commonValidations = {
    code: text("Subject code").size(2, 10),
    subject: text("Subject name").must().size(2, 50),
    credit_hours: float_number("Credit hours").must(),
}

const subjectValidationSchema = {
    type: select("Subject Type"),
    order: number("Subject's order").must(),
    school: select("Auth"),
    ...commonValidations
};


/* 
Must wrap the validation schema as yup.object(schema) while using;
*/
export default subjectValidationSchema;
export { commonValidations };