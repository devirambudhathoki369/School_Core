const ledgerSchema = {
    school: '', economic_year: '',
    name: '', ledger_group: '', address: '', contact: '',
    opening_balance: '', balance_type: '1'
};
// 
const accountingParticularSchema = { ledger: '', amount: '', remarks: '' }; // remarks/narration;
const journalParticularSchema = { ...accountingParticularSchema, type: '' };
//
const baseEntrySchema = { school: '', economic_year: '', date: '', particulars: [], remarks: '' };

const incomeEntrySchema = { ...baseEntrySchema, mode: '', ledger: '' };
const expenseEntrySchema = { ...baseEntrySchema, mode: '', ledger: '' };
const journalEntrySchema = { ...baseEntrySchema };
const contraEntrySchema = { ...baseEntrySchema, ledger: '' };

export { ledgerSchema };
export { incomeEntrySchema, journalEntrySchema };
export { accountingParticularSchema, expenseEntrySchema, journalParticularSchema, contraEntrySchema };