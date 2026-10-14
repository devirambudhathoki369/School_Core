import { TemplateTypes } from "./configs";

export const PH_STUDENT_NAME = { name: "Student Name", value: "{{student-name}}" },
    PH_GUARDIAN_NAME = { name: "Guardian Name", value: "{{guardian-name}}" },
    PH_CLASS_NAME = { name: "Class Name", value: "{{class-name}}" },
    PH_PAID_AMOUNT = { name: "Paid Amount", value: "{{paid-amount}}" },
    PH_BALANCE_AMOUNT = { name: "Balance Amount", value: "{{balance-amount}}" },
    // staff-side; both resolve on the backend from the staff row being sent to.
    PH_STAFF_NAME = { name: "Staff Name", value: "{{staff-name}}" },
    PH_DESIGNATION = { name: "Designation", value: "{{designation}}" };

const PAYMENT_PH_OPTIONS = [PH_STUDENT_NAME, PH_GUARDIAN_NAME, PH_PAID_AMOUNT, PH_BALANCE_AMOUNT];
const ALL_PH_OPTIONS = [PH_STUDENT_NAME, PH_GUARDIAN_NAME, PH_CLASS_NAME, PH_PAID_AMOUNT, PH_BALANCE_AMOUNT];
const LETTER_PH_OPTIONS = [PH_STUDENT_NAME, PH_GUARDIAN_NAME, PH_BALANCE_AMOUNT];
const STAFF_PH_OPTIONS = [PH_STAFF_NAME, PH_DESIGNATION];

const PH_OPTIONS = {
    [TemplateTypes.DUES]: PAYMENT_PH_OPTIONS,
    [TemplateTypes.PAYMENT]: PAYMENT_PH_OPTIONS,
    [TemplateTypes.RESULT]: [],
    [TemplateTypes.ATTENDANCE]: [PH_STUDENT_NAME, PH_GUARDIAN_NAME],
    [TemplateTypes.BIRTHDAY]: [PH_STUDENT_NAME, PH_GUARDIAN_NAME],
    [TemplateTypes.STAFF_BIRTHDAY]: STAFF_PH_OPTIONS,
    [TemplateTypes.BULK_SMS]: [PH_STUDENT_NAME, PH_GUARDIAN_NAME, PH_CLASS_NAME],
    [TemplateTypes.STAFF_SMS]: STAFF_PH_OPTIONS,
    [TemplateTypes.ALL]: ALL_PH_OPTIONS,
    [TemplateTypes.LETTER]: LETTER_PH_OPTIONS,
};

function PlaceValues({ onClick, template_type = TemplateTypes.ALL }) {
    // A type with no place values — or an unknown one — offers none. It must
    // never throw and take the compose box above it down with it.
    const options = PH_OPTIONS?.[template_type] || [];
    if (options.length === 0) return null;

    return (
        <>
            <h1 className="font-semibold">Select Place Values</h1>
            <div className="flex gap-x-1 flex-wrap  m-1 p-2"
                onMouseDown={(e) => {
                    e.preventDefault();
                }}>
                {
                    options.map((e, i) => (
                        <button type="button" className="border border-black rounded-md py-1 px-2 text-sm"
                            key={i} onClick={() => {
                                onClick({ name: "placevalue", value: e.value });
                            }}>{e.name}</button>
                    ))
                }
            </div>
        </>
    )
}

export default PlaceValues;
