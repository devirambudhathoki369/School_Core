const staffSchema = {
    image: '', role: '', status: 1,
    ...{ first_name: '', middle_name: '', last_name: '' },
    ...{ primary_contact: '', secondary_contact: '' },
    // ...{ primary_subject: '', secondary_subject: '' },
    location: '',
    account: { username: '', password: '' },
    permissions: [],
    // ---
    other_info: {
        birth_date: '', gender: '', email: '', citizenship_no: '',
        father_name: '', mother_name: '',
        marrital_status: '', joined_date: '',
        ...{
            basic_salary: '', funds: '', grade: '', allowance: '', extra: '', pan_no: '', insurance: '', pf_contrib: ''
        },
        ...{ qualification: '', experience: '' },
        ...{ ethnicity: '', sport: '', blood_group: '' }
    }
}

export const staffRoleSchema = {
    role: ''
}

export default staffSchema;