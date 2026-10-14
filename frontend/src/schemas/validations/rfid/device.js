import { object } from "yup";
import { text, select } from "@/schemas/validations";

const deviceValidationSchema = object({
    serial_number: text("Serial No.").must().size(1, 32),
    alias: text("Alias").size(2, 64),
    ip_address: text("IP Address"),
    firmware: text("Firmware").size(1, 64),
    school: select("Auth"),
})

export default deviceValidationSchema;