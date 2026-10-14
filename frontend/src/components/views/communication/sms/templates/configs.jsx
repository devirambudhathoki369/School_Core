// 1–7 are STORED template types and must match main/models/SMSTemplate.py.
// Anything above that is a frontend-only key, used only to choose which place
// values a compose box offers — those messages are written per send, not saved.
const TemplateTypes = {
    DUES: 1,
    PAYMENT: 2,
    RESULT: 3,
    ATTENDANCE: 4,
    BIRTHDAY: 5,
    LETTER: 6,
    STAFF_BIRTHDAY: 7,

    BULK_SMS: 11,
    ALL: 12,
    STAFF_SMS: 13,
};

const TEMPLATES_API_PATH = "/api/sms/templates";

export { TEMPLATES_API_PATH, TemplateTypes };
