import { object } from "yup";
import { location, number, select } from ".";

const busStationValidationSchema = object({
    station: location("Bus station"),
    fee: number('Fee').must(),
    school: select("Auth"),
})

export default busStationValidationSchema;