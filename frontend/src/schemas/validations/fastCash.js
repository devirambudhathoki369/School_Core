import { object } from "yup";
import { date_required, full_name_required, location } from ".";
import { flattenValidationSchema } from "@/methods/FlattenSchema";

const _fastCashValidationSchema = {
    date: date_required("Date"),
    extra_info: {
        name: full_name_required("Name"),
        address: location("Address")
    }
};

const fastCashValidationSchema = object(flattenValidationSchema(_fastCashValidationSchema));
export default fastCashValidationSchema;