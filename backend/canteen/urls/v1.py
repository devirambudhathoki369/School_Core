from django.urls import path

from ..views.AccountViews import CanteenAccountView, CanteenReceiptView
from ..views.ManageAccessView import ManageCanteenAccessView
from ..views.PlanViews import CanteenEnrollmentView, CanteenMonthlyPostingView, CanteenPlanView
from ..views.ReportViews import CanteenDuesReminderView, CanteenReportView
from ..views.SaleViews import CanteenBuyerView, CanteenSaleView
from ..views.SetupViews import (
    CanteenCategoryView,
    CanteenClassesView,
    CanteenClassRateView,
    CanteenItemView,
    CanteenSettingsView,
)
from ..views.UserViews import CanteenOwnPasswordView, CanteenUserView

# /canteen + ...
urlpatterns = [
    # setup
    path("settings", CanteenSettingsView.as_view(), name="canteen settings"),
    path("categories", CanteenCategoryView.as_view(), name="canteen categories"),
    path("items", CanteenItemView.as_view(), name="canteen items"),
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
    # records
    path("reports", CanteenReportView.as_view(), name="canteen records"),
    path("dues-reminder", CanteenDuesReminderView.as_view(), name="app reminder to families who owe"),
    # who signs in to the canteen
    path("users", CanteenUserView.as_view(), name="canteen users"),
    path("my-password", CanteenOwnPasswordView.as_view(), name="a canteen user's own password"),
    # superadmin
    path("manage/access", ManageCanteenAccessView.as_view(), name="which schools have the canteen"),
]
