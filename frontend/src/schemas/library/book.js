const bookEntrySchema = {
    id: '', school: '', library: '', entry_date: '', title: '', edition: '', place_and_publisher: '',
    broad_subject: '', geographical_descriptions: '', keywords: '', isbn_no: '', note: '', source: '', pages: '', quantity: '',
    price: '', published_year: '', vendor: '', vendor_contact: '', call_no: '', personal_author: '', corporate_author: ''
};

const bookIssueSchema = {
    school: '', student: '', staff: '', book: '',
    issued_date: '', due_date: '', returned_date: '',
    fine_amount: '', fine_paid: '', is_lost: '', is_damaged: '', remarks: '',
};

export { bookEntrySchema, bookIssueSchema };