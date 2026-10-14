import classPickerSchema from "./class-picker";

const feeSchema = {
    title: '', fee: '', isActive: true,
    class_info: {
        ...classPickerSchema
    }
};

export default feeSchema;