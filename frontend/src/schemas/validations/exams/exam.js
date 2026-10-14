import { object } from "yup";
import { float_number, select, text } from "..";

const examValidationSchema = object({
    academic_year: select("Academic year").must(),
    name: text("Name").must().size(4, 40),
    inclusion: float_number("Inclusion"),
})

export default examValidationSchema;