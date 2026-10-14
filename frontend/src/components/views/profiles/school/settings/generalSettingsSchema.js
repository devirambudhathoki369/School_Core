const SMS_ON_BILL_PAYMENT = "sms_on_bill_payment";
const AUTO_SEND_BIRTHDAY_WISH = "birthday_sms_auto_wish";
const AUTO_SEND_STAFF_BIRTHDAY_WISH = "staff_birthday_sms_auto_wish";
const AUTO_SEND_ABSENT_SMS = "sms_on_absences";

const generalSettingsSchema = {
    [SMS_ON_BILL_PAYMENT]: false,
    [AUTO_SEND_BIRTHDAY_WISH]: false,
    [AUTO_SEND_STAFF_BIRTHDAY_WISH]: false,
    [AUTO_SEND_ABSENT_SMS]: false,
};

export default generalSettingsSchema;
export {
    SMS_ON_BILL_PAYMENT,
    AUTO_SEND_BIRTHDAY_WISH,
    AUTO_SEND_STAFF_BIRTHDAY_WISH,
    AUTO_SEND_ABSENT_SMS,
};
