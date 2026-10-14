import { UPDATE_TYPES } from "./configs";

const EXTRACTORS = {
    [UPDATE_TYPES.transportation_info]: (std) => (
        {
            transportation_info: {
                bus_station: std?.bus_station || '',
                start_date: std?.start_date || ''
            }
        }
    ),
    [UPDATE_TYPES.image]: (std) => ({
        image: ""
    }),
    [UPDATE_TYPES.identity]: (std) => ({
        roll_no: std?.roll_no || "",
        symbol_no: std?.symbol_no || "",
        regd_no: std?.regd_no || ""
    }),
    [UPDATE_TYPES.general]: (std) => (
        {
            guardian_info: {
                guardian_name: std?.guardian_name || '',
                guardian_contact: std?.guardian_contact || '',
                guardian_location: std?.guardian_location || '',
            },
            other_info: {
                blood_group: std?.blood_group || '',
            },
            birth_date: std?.birth_date || '',
            location: std?.location || '',
            contact: std?.contact || '',
            emis: std?.emis || '',
        }
    )
}

export default EXTRACTORS;