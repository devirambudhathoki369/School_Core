import StudentNameCell from "@/components/tables/StudentNameCell";
import StudentImageCell from "@/components/tables/StudentImageCell";

const Payment_SearchListColumns = [
    // larger photo for this list
    ["image", "Image", "", false, "horizontal", StudentImageCell],
    // custom cell shows father's name + guardian contact under the student's name
    ["name", "Name", "", false, "horizontal", StudentNameCell],
    ["classname"],
    ["balance"]
];

const History_SearchListColumns = [
    ["date", "enrollment date"],
    ["name"],
    ["gender"],
    ["birth_date", "birth date"],
    ["age"],
    ["classname"],
    ["contact"],
    ["location"],
    ["email"],
    ["previous_school", "previous school"],
    ["father_name", "father name"],
    ["mother_name", "mother name"],
    ["guardian_name", "guardian name"],
    ["guardian_contact", "guardian contact"],
    ["guardian_location", "guardian location"],
];

// Staff "view all details" report — every column shown by default, toggleable.
const Staff_History_SearchListColumns = [
    ["name"],
    ["designation", "position"],
    ["birth_date", "birth date"],
    ["blood_group", "blood group"],
    ["primary_contact", "contact"],
    ["secondary_contact", "secondary contact"],
    ["address"],
    ["joined_date", "joined date"],
    ["grade"],
    ["salary", "basic salary (net)"],
    ["funds"],
    ["allowance"],
    ["extra"],
    ["insurance"],
    ["pf_contrib", "pf contribution"],
    ["balance", "salary payable"],
];

const Manage_SearchListColumns = [
    ["name"]
]

// Staff manage list: show photo + position alongside the name.
const Manage_StaffSearchListColumns = [
    ["image", "Photo"],
    ["name"],
    ["designation", "Position"],
]

const Library_SearchListColumns = [
    // the id is what the desk searches by, so it is worth reading off the list
    ["id", "Student ID"],
    ["image"],
    ["name"],
    ["classname"],
];

export { Payment_SearchListColumns, History_SearchListColumns, Staff_History_SearchListColumns, Manage_SearchListColumns, Manage_StaffSearchListColumns, Library_SearchListColumns };