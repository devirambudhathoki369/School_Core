import { flattenValidationSchema } from "@/methods/FlattenSchema";
import { float_number, select, text } from "@/schemas/validations";
import { object } from "yup";

const libraryPrefsValidationSchema = {
    fine_per_day: float_number("Fine per day").must().min(0).max(1000),
    fine_on_damage: float_number("Fine if damage/lost").must().min(0).max(10000),
};

const _libraryValidationSchema = {
    school: select("school"),
    name: text("Library Name").must().size(2, 25),
    address: text("Address").size(2, 50),
    contacts: text("Contacts"),
    preferences: libraryPrefsValidationSchema,
};

const libraryValidationSchema = object(flattenValidationSchema(_libraryValidationSchema))
export default libraryValidationSchema;