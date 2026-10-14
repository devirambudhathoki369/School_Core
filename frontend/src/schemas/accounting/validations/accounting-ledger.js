import { contact, float_number, location_optional, select, text } from '@/schemas/validations';
import * as Yup from 'yup';

const accountingLedgerValidationSchema = Yup.object().shape({
  school: select('School').must(),
  economic_year: select('Accouting economic year').must(),
  name: text('Ledger name').must().size(3, 30),
  ledger_group: select("Ledger Group").must(),
  address: location_optional("Address"),
  contact: contact("Contact"),
  opening_balance: float_number("Opening Balance")
    .min(0, `Opening balance must be unsigned!`),
  balance_type: select("Balance Type").must(),
});

export default accountingLedgerValidationSchema;