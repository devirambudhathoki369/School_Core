import { useQuery } from '@tanstack/react-query';

import { type BsMonth, monthEnd, monthStart } from '@/lib/format';
import { api } from './client';
import type {
  AttendanceResponse,
  CalendarEvent,
  ClassMap,
  Dues,
  Exam,
  FeeHistory,
  Homework,
  Notice,
  Page,
  Receipt,
  ResultSheet,
  StudentProfile,
  StudentRecord,
} from './types';

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: () => api<StudentProfile>('/auth/profile'),
    staleTime: 10 * 60_000,
  });
}

/** The ids every other request is scoped by: student, school, class, year. */
export function useMe() {
  const profile = useProfile();
  const school = profile.data?.school;
  const record = useQuery({
    queryKey: ['student', school],
    queryFn: () => api<StudentRecord>('/api/students', { params: { school } }),
    enabled: !!school,
    staleTime: 10 * 60_000,
  });
  const classes = useQuery({
    queryKey: ['classes', school],
    queryFn: () => api<ClassMap>('/api/classes', { params: { school } }),
    enabled: !!school,
    staleTime: 60 * 60_000,
  });
  const p = profile.data;
  const classId = record.data?.class_info?.id ?? p?.class_info;
  const me = p
    ? {
        studentId: p.id,
        schoolId: p.school,
        classId,
        yearId: record.data?.class_info?.academic_year,
        className: classId ? classes.data?.[String(classId)]?.[0] : undefined,
        profile: p,
        record: record.data,
      }
    : undefined;
  return {
    me,
    isLoading: profile.isLoading || record.isLoading,
    error: profile.error ?? record.error,
    refetch: () => Promise.all([profile.refetch(), record.refetch(), classes.refetch()]),
  };
}

export type Me = NonNullable<ReturnType<typeof useMe>['me']>;

export function useAttendance(month: BsMonth) {
  return useQuery({
    queryKey: ['attendance', month.year, month.month],
    queryFn: () =>
      api<AttendanceResponse>('/api/attendance/me', {
        method: 'POST',
        body: { start_date: monthStart(month), end_date: monthEnd(month) },
      }),
  });
}

export function useDues(me: Me | undefined) {
  return useQuery({
    queryKey: ['dues', me?.studentId, me?.yearId],
    queryFn: () =>
      api<Dues>('/api/ledgers', {
        params: { school: me!.schoolId, student: me!.studentId, class: me!.classId, academic_year: me!.yearId },
      }),
    enabled: !!me?.yearId && !!me?.classId,
  });
}

export function useFeeHistory(me: Me | undefined) {
  return useQuery({
    queryKey: ['fee-history', me?.studentId],
    queryFn: () => api<FeeHistory>('/api/payments', { params: { school: me!.schoolId, student: me!.studentId } }),
    enabled: !!me,
  });
}

export function useReceipt(schoolId: number | undefined, invoiceId: number) {
  return useQuery({
    queryKey: ['receipt', invoiceId],
    queryFn: () => api<Receipt>('/api/payments', { params: { school: schoolId, id: invoiceId } }),
    enabled: !!schoolId && Number.isFinite(invoiceId),
  });
}

export function useHomework(me: Me | undefined) {
  return useQuery({
    queryKey: ['homework', me?.classId],
    queryFn: () => api<Homework[]>('/api/homeworks', { params: { school: me!.schoolId, class_info: me!.classId } }),
    enabled: !!me?.classId,
  });
}

export function useNotices(me: Me | undefined) {
  return useQuery({
    queryKey: ['notices', me?.schoolId],
    queryFn: () => api<Page<Notice>>('/api/notices', { params: { school: me!.schoolId } }),
    enabled: !!me,
  });
}

export function useEvents(me: Me | undefined) {
  return useQuery({
    queryKey: ['events', me?.schoolId],
    queryFn: () => api<Page<CalendarEvent>>('/api/calendar_events', { params: { school: me!.schoolId } }),
    enabled: !!me,
  });
}

export function useExams(me: Me | undefined) {
  return useQuery({
    queryKey: ['exams', me?.yearId],
    queryFn: () => api<Exam[]>('/api/exams', { params: { school: me!.schoolId, academic_year: me!.yearId } }),
    enabled: !!me?.yearId,
  });
}

export function useResult(me: Me | undefined, examId: number | undefined) {
  return useQuery({
    queryKey: ['result', examId, me?.classId],
    queryFn: () =>
      api<ResultSheet | null>('/api/exams/results', {
        params: { school: me!.schoolId, class_info: me!.classId, exam: examId, academic_year: me!.yearId },
      }),
    enabled: !!me?.yearId && !!examId,
    retry: false,
  });
}
