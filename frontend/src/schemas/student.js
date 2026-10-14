import classPickerSchema from "./class-picker";

const transportationSchema = { bus_station: "", start_date: "" };
const discountSchema = { title: '', discount: '', percentage: '', remarks: '', school: '', student: '' };

const studentSchema = {
    // student-table [personal]
    ...{
        ...{ first_name: "", middle_name: "", last_name: "" },
        birth_date: "", gender: 1,
        email: "", contact: "", location: "",
        emis: "", academic_year: "", status: 1, previous_school: "",
        transportation_info: { ...transportationSchema }
    },
    // guardian-table
    guardian_info: {
        guardian_name: "", father_name: "", mother_name: "",
        guardian_contact: "", guardian_email: "", guardian_location: "",
        father_occupation: "", mother_occupation: "", grandfather_occupation: "",
    },
    // student-grade-table
    class_info: {
        ...classPickerSchema
    },
    // other table
    other_info: {
        ethnicity: '', sport: '', blood_group: ''
    }
}


export default studentSchema;
export { transportationSchema, discountSchema }