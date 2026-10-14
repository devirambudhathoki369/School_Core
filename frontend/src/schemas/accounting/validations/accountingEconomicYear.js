import { object } from "yup";
import { fiscalYear } from "@/schemas/validations/fiscal-year";

const accountingEconomicYearValidationSchema = object(fiscalYear("Accounting economic year"));

export { accountingEconomicYearValidationSchema };