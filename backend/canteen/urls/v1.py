from django.urls import path

from ..views.AccountViews import CanteenAccountView, CanteenReceiptView
from ..views.ManageAccessView import ManageCanteenAccessView
from ..views.FacilityViews import CanteenFacilityUsersView, CanteenFacilityView
from ..views.PlanViews import (
    CanteenEnrollmentView,
    CanteenManualPostingView,
    CanteenMonthlyPostingView,
    CanteenPlanView,
)
from ..views.ProfileViews import CanteenClassOptionsView, CanteenProfileView, CanteenStudentSearchView
from ..views.ReportViews import CanteenDuesReminderView, CanteenReportView
from ..views.SaleViews import CanteenBuyerView, CanteenSaleView
from ..views.SetupViews import (
    CanteenCategoryView,
    CanteenClassesView,
    CanteenClassRateView,
    CanteenItemView,
    CanteenUnitView,
    CanteenSettingsView,
)
from ..views.UserViews import CanteenOwnPasswordView, CanteenUserView

# /canteen + ...
urlpatterns = [
    # setup
    path("settings", CanteenSettingsView.as_view(), name="canteen settings"),
    path("categories", CanteenCategoryView.as_view(), name="canteen categories"),
    path("units", CanteenUnitView.as_view(), name="canteen units"),
    path("items", CanteenItemView.as_view(), name="canteen items"),
    path("facilities", CanteenFacilityView.as_view(), name="canteen facilities and their class amounts"),
    path("facility-users", CanteenFacilityUsersView.as_view(), name="students ticked on a facility"),
    path("class-rates", CanteenClassRateView.as_view(), name="a monthly item's rate per class"),
    path("classes", CanteenClassesView.as_view(), name="the school's classes as canteen rates key them"),
    # the counter
    path("buyers", CanteenBuyerView.as_view(), name="canteen buyer lookup"),
    path("sales", CanteenSaleView.as_view(), name="canteen sales"),
    # the canteen's own billing
    path("accounts", CanteenAccountView.as_view(), name="canteen accounts"),
    path("receipts", CanteenReceiptView.as_view(), name="canteen receipts"),
    path("plans", CanteenPlanView.as_view(), name="canteen use types"),
    path("enrollments", CanteenEnrollmentView.as_view(), name="regular users of a use type"),
    path("monthly-posting", CanteenMonthlyPostingView.as_view(), name="monthly posting to canteen accounts"),
    path("manual-posting", CanteenManualPostingView.as_view(), name="posting by hand to one person"),
    # one person's own canteen page: billing, payments, every transaction
    path("profile", CanteenProfileView.as_view(), name="a person's canteen profile"),
    path("student-search", CanteenStudentSearchView.as_view(), name="the payment page's student search"),
    path("class-options", CanteenClassOptionsView.as_view(), name="what the payment search's class picker offers"),
    # records
    path("reports", CanteenReportView.as_view(), name="canteen records"),
    path("dues-reminder", CanteenDuesReminderView.as_view(), name="app reminder to families who owe"),
    # who signs in to the canteen
    path("users", CanteenUserView.as_view(), name="canteen users"),
    path("my-password", CanteenOwnPasswordView.as_view(), name="a canteen user's own password"),
    # superadmin
    path("manage/access", ManageCanteenAccessView.as_view(), name="which schools have the canteen"),
]
