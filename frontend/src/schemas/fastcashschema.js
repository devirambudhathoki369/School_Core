const KEYS = {
    PARTICULAR: 'PAR',
    AMOUNT: 'AMT'
};

const fastCashSchema = {
    date: '',
    mode: 1,
    extra_info: { name: '', address: '' },
    details: [],
    total_paid: '',
    school: '',
    academic_year: '',
    economic_year: '',
    isCashReceipt: true,
    remarks: ''
};
const particularSchema = { [KEYS.PARTICULAR]: '', [KEYS.AMOUNT]: '' }; //details;

export default fastCashSchema;
export { KEYS, particularSchema };