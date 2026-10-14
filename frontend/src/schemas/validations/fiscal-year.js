import { object } from "yup";
import { date_required, text } from ".";

const fiscalYear = (label) => ({
    name: text(`${label} name`).must().size(4, 20),
    start_date: date_required('Start date'),
    end_date: date_required('End date')
})

const economicYearValidationSchema = object(fiscalYear("Economic year"));
const academicYearValidationSchema = object(fiscalYear("Academic year"));

export { fiscalYear, economicYearValidationSchema, academicYearValidationSchema };