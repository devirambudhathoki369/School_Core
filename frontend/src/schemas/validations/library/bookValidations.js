import { bool, contact, date_required, float_number, number, select, text } from "@/schemas/validations";
import { object } from "yup";

// book entry validation;
const bookEntryValidationSchema = object({
    school: select("School").must(),
    library: select("Library").must(),
    entry_date: date_required("Entry date"),
    class_info: select("Class Info"),
    // 
    title: text("Title").must().size(1, 100),
    edition: text("Edition").must().size(2, 10),
    place_and_publisher: text("Place and Publisher").must().size(5, 50),
    isbn_no: text("ISBN No.").size(5, 20),
    source: text("Source").size(5, 50),
    pages: number("Pages"),
    quantity: number("Quantity").must(),
    price: number("Price"),
    published_year: text("Published year").must().size(4, 4),
    // 
    broad_subject: text("Broad subject").must().size(1, 100),
    geographical_descriptions: text("Geographical descriptions"),
    keywords: text("Keywords"),
    note: text("Note"),
    // 
    vendor: text("Vendor").size(5, 50),
    vendor_contact: contact("Contact"),
    call_no: contact("Call No."),
    personal_author: text("Personal Author").must().size(5, 50),
    corporate_author: text("Corporate Author").size(5, 50),
});

const bookIssueValidationSchema = object({
    book: select("Book").must(),
    student: select("Student"),
    staff: select("Staff"),
    // 
    issued_date: date_required("Issue date"),
    due_date: date_required("Due date"),
    returned_date: date_required("Return date"),
    fine: float_number("Fine"),
    fine_paid: float_number("Fine paid"),
    is_lost: bool("Is lost"),
    is_damaged: bool("Is damaged"),
    remarks: text("Remarks"),
    // 
    librarian: select("Librarian"),
});

export {
    bookEntryValidationSchema,
    bookIssueValidationSchema,
}