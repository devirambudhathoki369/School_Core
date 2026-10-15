import { SCHOOL_MODULES } from "@/configs/moduleGates";

const adminSchema = {
    id: '',
    account: { username: '', password: '' },
    name: '',
    address: '',
    contact: '', telephone: '',
    estd_date: '',
    pan_no: '',
    email: '',
    renew_date: '',
    slogan: '',
    about_us: '',
    economic_year: '',
    test_account: false,
    uses_sms: false,
    uses_mobile_app: false,
    time_set_required: false,
    // the facilities a new school starts with ticked (configs/moduleGates.js)
    ...Object.fromEntries(SCHOOL_MODULES.map(({ flag, on }) => [flag, on])),
}

export default adminSchema;
