const examSchema = { academic_year: '', name: '', inclusion: '', attendance_inclusion: '', school: '' };
// 
const examScheduleSchema = { exam: '', start_time: '', end_time: '', schedule: {}, class_info: '' };
// 
const criteriaSchema = { fm: '', pm: '', fm_th: '', pm_th: '', fm_pr: '', pm_pr: '', attendance: '' };
// class-result;
const marksEntrySchema = { exam: '', class_info: '', student_status: '', subject: '', criteria: { ...criteriaSchema }, published_date: '' };
// student-result;
const studentResultSchema = { theory: '', practical: '', total: '', attendance: '', inclusion: '', result: '', absent: '' };

export { examSchema };
export { examScheduleSchema }
export { criteriaSchema, marksEntrySchema, studentResultSchema };