// The shapes of /api/mobile/v1/, named for the app. They come from
// `schema.d.ts`, which is generated from the server's OpenAPI schema
// (`npm run api-types`; see src/api/README.md), so a change on the server
// shows up here as a type error instead of a broken screen.
import type { components } from './schema';

type S = components['schemas'];

export type Role = S['RoleEnum'];
export type School = S['SchoolOut'];
export type SchoolLookup = S['SchoolLookupOut'];
export type Tokens = S['TokensOut'];
export type Me = S['MeOut'];
export type Child = S['MeChildOut'];
export type SignedIn = S['SignedInOut'];
export type CodeSent = S['CodeSentOut'];
export type PhoneSession = S['PhoneSessionOut'];
export type PhoneList = S['PhoneListOut'];

// a child's screens (parents and students)
export type StudentHome = S['StudentHomeOut'];
export type DayMark = S['DayMarkOut'];
export type AttendanceMonth = S['AttendanceMonthOut'];
export type FeesDue = S['FeesDueOut'];
export type FeeHistory = S['FeeHistoryOut'];
export type FeeEntry = S['FeeEntryOut'];
export type Receipt = S['ReceiptOut'];
export type Homework = S['HomeworkOut'];
export type HomeworkList = S['HomeworkListOut'];
export type ExamList = S['ExamListOut'];
export type ExamResult = S['ExamResultOut'];
export type Timetable = S['TimetableOut'];
export type Notice = S['NoticeOut'];
export type NoticeList = S['NoticeListOut'];
export type Calendar = S['CalendarOut'];
export type CalendarEvent = S['CalendarEventOut'];
export type FileLink = S['FileOut'];

// staff
export type StaffToday = S['StaffTodayOut'];
export type StaffClasses = S['StaffClassesOut'];
export type StaffClass = S['StaffClassOut'];
export type ClassDay = S['ClassDayOut'];
export type RosterRow = S['RosterRowOut'];
export type StaffHomework = S['StaffHomeworkOut'];
export type StaffHomeworkList = S['StaffHomeworkListOut'];
export type HandIns = S['HandInsOut'];
export type StaffHandIn = S['StaffHandInOut'];

// school admin
export type Dashboard = S['DashboardOut'];
export type StudentList = S['StudentListOut'];
export type StudentRow = S['StudentRowOut'];
export type AdminStudent = S['AdminStudentOut'];
export type Dues = S['DuesOut'];
export type Collections = S['CollectionsOut'];
export type StaffDay = S['StaffDayOut'];
export type LinkList = S['LinkListOut'];
export type Link = S['LinkOut'];
export type FamilyCode = S['FamilyCodeOut'];

/** Every list answer: one page and where the next starts. */
export type Page<T> = { items: T[]; next_cursor: string | null };
