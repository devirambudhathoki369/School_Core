// Shapes as the SchoolCore API returns them to a student token. Dates are
// Bikram Sambat strings ("2083-07-19").

export type StudentProfile = {
  id: number; // the student record
  class_info: number;
  image: string | null;
  gender: number | null;
  email: string | null;
  contact: string | null;
  location: string | null;
  name: string;
  father_name: string | null;
  mother_name: string | null;
  guardian_name: string | null;
  guardian_contact: string | null;
  guardian_location: string | null;
  school: number;
  school_name: string;
  school_address: string | null;
  school_contact: string | null;
  school_telephone: string | null;
  school_email: string | null;
  school_logo: string | null;
  school_slogan: string | null;
  uses_exams?: boolean;
};

export type SignInResponse = {
  message: string;
  user: { username: string; role: string; token: string; today?: string; profile: StudentProfile };
};

export type StudentRecord = {
  id: number;
  roll_no: string | null;
  regd_no: string | null;
  symbol_no: string | null;
  image: string | null;
  class_info: { id: number; academic_year: number; grade: number | null; section: number | null; name: string | null };
  guardian_info: {
    father_name: string | null;
    mother_name: string | null;
    guardian_name: string | null;
    guardian_contact: string | null;
    guardian_location: string | null;
  } | null;
};

/** `/api/classes` → { [classId]: [name, details, count] } */
export type ClassMap = Record<string, [string, unknown, unknown]>;

export type AttendanceDay = {
  date: string;
  status: boolean;
  checked_in_at: string | null;
  checked_out_at: string | null;
};

export type AttendanceResponse = { role: string; data: AttendanceDay[] };

export type Homework = {
  id: number;
  subject_name: string | null;
  title: string;
  description: string | null;
  due_date: string;
  files: (string | null)[];
};

export type Dues = {
  bill_amount: Record<string, number>;
  total: number;
  titles: Record<string, string>;
  rates?: Record<string, number>;
};

export type LedgerEntry = {
  id: number;
  date: string;
  months: number[] | number;
  academic_year_name: string;
  classname: string;
  particulars: [string, number][];
  remarks?: string | null;
} & ({ debit_amount: number; credit_amount?: undefined; invoice_id?: undefined; mode?: undefined } | {
  credit_amount: number;
  debit_amount?: undefined;
  invoice_id: number;
  mode: number;
});

export type FeeHistory = { data: LedgerEntry[]; titles: Record<string, string> };

export type Receipt = {
  invoice: {
    invoice_id: number;
    date: string;
    student_name: string;
    guardian_name: string | null;
    class: string;
    payment_mode: string;
    payment_month: number | null;
    particulars: [string, number, number, number, number][];
    total_paid: number;
    total_due: number;
    total_discount: number;
    remarks: string | null;
    cashier: string | null;
  };
  particular_format: string[];
};

export type Page<T> = { next: string | null; previous: string | null; results: T[] };

export type Notice = {
  id: number;
  title: string;
  description: string | null;
  date: string;
  image: string | null;
};

export type CalendarEvent = {
  id: number;
  type: number;
  type_str: string;
  description: string;
  start_date: string;
  end_date: string | null;
  color_code: string | null;
};

export type Exam = { id: number; name: string; academic_year: number; academic_year_str: string };

export type SubjectInfo = {
  subject: string;
  order: number;
  type: number;
  criteria: { fm: number; pm: number; fm_th?: number; pm_th?: number; fm_pr?: number; pm_pr?: number };
};

export type SubjectMark = {
  subject: number;
  theory: number | null;
  practical: number | null;
  total: number | null;
  absent: boolean;
  result: boolean;
};

export type ResultSheet = {
  fm_total: number;
  subjects: number[];
  subjects_data: Record<string, SubjectInfo>;
  result: Record<string, SubjectMark>;
  classname: string;
};
