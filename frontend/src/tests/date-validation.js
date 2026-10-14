import staffValidationSchema from "@/schemas/validations/staff";

staffValidationSchema.validateAt('birth_date', { birth_date: '2000-4-20' });