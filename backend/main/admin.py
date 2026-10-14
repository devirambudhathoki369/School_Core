from django.contrib import admin

#
from .models.history_log.HistoryLog import HistoryLog, HistoryLogAdmin
from .models.FiscalYears import EconomicYear, AcademicYear, AcademicYearMapping
from .models.BusStation import BusStation
from .models.Section import Section
from .models.Fee import FeeTitle, Fee
from .models.Student import (
    Student,
    StudentGuardianInfo,
    StudentOtherInfo,
    StudentTransportationInfo,
    StudentDiscountInfo,
)
from .models.Alerts import BusTrackOnAlertInfo, BusTrackOnAlertInfoAdmin
from .models.Staff import Staff
from .models.SchoolFoundation import SchoolFoundation
from .models.SchoolAdmin import SchoolAdmin, SchoolImage
from .models.Course import Course
from .models.Subject import Subject
from .models.Ledger import LedgerPosting, StudentLedger
from .models.Invoice import StudentInvoice, CashReceiptTitle, StaffInvoice
from .models.ClassInfo import ClassInfo
from .models.ClassPeriod import ClassPeriod
from .models.Attendance import ClassAttendance, StudentAttendance
from .models.Notice import Notice
from .models.NewsEvent import NewsEvent, NewsEventImage
from .models.CalendarEvent import CalendarEvent
from .models.Homework import Homework, HomeworkSubmission

#
from .models.exams.Exam import Exam
from .models.exams.GradingRules import GradingRules
from .models.exams.Result import ClassResult, StudentResult
from .models.exams.Schedule import ExamSchedule
from .models.exams.SubjectAssignment import SubjectAssignment
from .models.exams.ExtraActivity import ExtraActivity, ExtraActivityEntry
from .models.exams.Certificate import CharacterCertificate

#
from .models.SMSTemplate import SMSTemplate

#

from .models.superadmin.NoticeSA import NoticeSA

# Register your models here.
admin.site.register(HistoryLog, HistoryLogAdmin)
# academic year
admin.site.register(EconomicYear)
admin.site.register(AcademicYear)
admin.site.register(AcademicYearMapping)
# student
admin.site.register(Student)
admin.site.register(StudentGuardianInfo)
admin.site.register(StudentOtherInfo)
admin.site.register(StudentTransportationInfo)
admin.site.register(StudentDiscountInfo)
admin.site.register(BusTrackOnAlertInfo, BusTrackOnAlertInfoAdmin)
# staff
admin.site.register(Staff)
admin.site.register(StaffInvoice)
# profiles
admin.site.register(SchoolFoundation)
admin.site.register(SchoolAdmin)
admin.site.register(SchoolImage)
admin.site.register(ClassInfo)
admin.site.register(ClassPeriod)
# accounts in 'account' app [admin-account, superadmin-account]
# fee
admin.site.register(FeeTitle)
admin.site.register(Fee)
# ledgers
admin.site.register(LedgerPosting)
admin.site.register(StudentLedger)
admin.site.register(StudentInvoice)
admin.site.register(CashReceiptTitle)
# others
admin.site.register(BusStation)
admin.site.register(Course)
admin.site.register(Subject)
admin.site.register(Section)
admin.site.register(ClassAttendance)
admin.site.register(StudentAttendance)
admin.site.register(Notice)
admin.site.register(NewsEvent)
admin.site.register(NewsEventImage)
admin.site.register(CalendarEvent)
admin.site.register(Homework)
admin.site.register(HomeworkSubmission)
# exams
admin.site.register(Exam)
admin.site.register(GradingRules)
admin.site.register(ClassResult)
admin.site.register(StudentResult)
admin.site.register(ExamSchedule)
admin.site.register(SubjectAssignment)
admin.site.register(ExtraActivity)
admin.site.register(ExtraActivityEntry)
admin.site.register(CharacterCertificate)
# SMS
admin.site.register(SMSTemplate)
#
admin.site.register(NoticeSA)
