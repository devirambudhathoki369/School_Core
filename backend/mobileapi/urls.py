from django.urls import path

from .schema import MobileSchemaView
from .views import school, staff, students
from .views.auth import (
    FamilyCodeView,
    ParentCodeView,
    ParentVerifyView,
    PasswordSignInView,
    RefreshView,
    SchoolLookupView,
)
from .views.me import CloseAccountView, MeView, SessionDetailView, SessionsView, SignOutEverywhereView, SignOutView

urlpatterns = [
    path("schema", MobileSchemaView.as_view(), name="schema"),
    # sign-in (phase 1)
    path("schools/<str:code>", SchoolLookupView.as_view(), name="school"),
    path("auth/signin", PasswordSignInView.as_view(), name="signin"),
    path("auth/parent/code", ParentCodeView.as_view(), name="parent-code"),
    path("auth/parent/verify", ParentVerifyView.as_view(), name="parent-verify"),
    path("auth/parent/family-code", FamilyCodeView.as_view(), name="parent-family-code"),
    path("auth/refresh", RefreshView.as_view(), name="refresh"),
    path("auth/signout", SignOutView.as_view(), name="signout"),
    path("auth/signout-all", SignOutEverywhereView.as_view(), name="signout-all"),
    path("me", MeView.as_view(), name="me"),
    path("me/sessions", SessionsView.as_view(), name="sessions"),
    path("me/sessions/<uuid:session_id>", SessionDetailView.as_view(), name="session"),
    path("me/close-account", CloseAccountView.as_view(), name="close-account"),
    # parents and students (phase 3)
    path("students/<int:student_id>/home", students.StudentHomeView.as_view(), name="student-home"),
    path("students/<int:student_id>/attendance", students.StudentAttendanceView.as_view(), name="student-attendance"),
    path("students/<int:student_id>/fees", students.StudentFeesView.as_view(), name="student-fees"),
    path("students/<int:student_id>/fees/history", students.StudentFeeHistoryView.as_view(), name="student-fee-history"),
    path("students/<int:student_id>/receipts/<int:receipt_id>", students.StudentReceiptView.as_view(),
         name="student-receipt"),
    path("students/<int:student_id>/homework", students.StudentHomeworkView.as_view(), name="student-homework"),
    path("students/<int:student_id>/homework/<int:homework_id>/hand-in", students.StudentHandInView.as_view(),
         name="student-hand-in"),
    path("students/<int:student_id>/results", students.StudentResultsView.as_view(), name="student-results"),
    path("students/<int:student_id>/results/<int:exam_id>", students.StudentExamResultView.as_view(),
         name="student-result"),
    path("students/<int:student_id>/timetable", students.StudentTimetableView.as_view(), name="student-timetable"),
    path("notices", school.NoticesView.as_view(), name="notices"),
    path("calendar", school.CalendarView.as_view(), name="calendar"),
    # staff (phase 4)
    path("staff/today", staff.StaffTodayView.as_view(), name="staff-today"),
    path("staff/classes", staff.StaffClassesView.as_view(), name="staff-classes"),
    path("staff/classes/<int:class_id>/attendance", staff.ClassAttendanceDayView.as_view(), name="staff-class-day"),
    path("staff/homework", staff.StaffHomeworkView.as_view(), name="staff-homework"),
    path("staff/homework/<int:homework_id>/hand-ins", staff.HandInsView.as_view(), name="staff-hand-ins"),
    path("staff/homework/<int:homework_id>/hand-ins/<int:hand_in_id>", staff.HandInDetailView.as_view(),
         name="staff-hand-in"),
    path("staff/me/attendance", staff.StaffOwnAttendanceView.as_view(), name="staff-own-attendance"),
]
