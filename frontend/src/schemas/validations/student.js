import { object } from "yup";
import {
    date_required, email, select, name, name_optional, contact, location, full_name,
    EMAIL_SIZE, CONTACT_SIZE, location_optional, date,
    full_name_required,
    text
} from ".";
import { flattenValidationSchema } from "../../methods/FlattenSchema";
// 
const _studentValidationSchema = {
    school: select("Auth"),
    personal: {
        status: select("Status"),
        ...{
            first_name: name('First name'), //must
            middle_name: name_optional('Middle name'),
            last_name: name('Last name'), // must
        },
        birth_date: date_required('Birth date'),
        gender: select('Gender').must(),
        email: email(),
        contact: contact('Contact').size(...CONTACT_SIZE), // optional
        location: location('Location'), // must
        previous_school: text('Previous school').size(10, 50)
        // status is 1 i.e. 'running' by default;
        // acdemic_year is handled during submission;
        // emis is optional;
    },
    transportation: {
        bus_station: select('Bus station')
            .when('start_date', {
                is: (val) => val !== "",
                then: (schema) => schema.must(),
                otherwise: (schema) => schema
            }),
        start_date: date("Transportation start date")
    },
    guardian: {
        father_name: full_name_required("Father's full name"),
        mother_name: full_name_required("Mother's full name"),
        guardian_name: full_name("Guardian's full name"), // must
        guardian_contact: contact("Guardian's contact").must().size(...CONTACT_SIZE), // must
        guardian_email: email("Guardian's email address").size(...EMAIL_SIZE),
        guardian_location: location_optional("Guardian's location"),
        father_occupation: select("Father's occupation"),
        mother_occupation: select("Mother's occupation"),
        grandfather_occupation: select("Grandfather's occupation"),
    },
    class: {
        education_level: select("Education level").must(),
        grade: select("Class or Grade")
            .when('education_level', {
                is: (val) => val === "2" || val === "3",
                then: (schema) => schema.must(),
                otherwise: (schema) => schema
            }),
        faculty: select("Faculty")
            .when('education_level', {
                is: (val) => val === "3",
                then: (schema) => schema.must(),
                otherwise: (schema) => schema
            }),
        course: select("Course"),
        section: select("Section"),
        year: select("Year"),
        semester: select("Semester")
    },
    other: {
        ethnicity: select("Ethnicity"),
        sport: select("Sport"),
        blood_group: select("Blood group")
    }
};
const studentValidationSchema = object(flattenValidationSchema(_studentValidationSchema));

export default studentValidationSchema;