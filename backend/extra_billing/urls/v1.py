from django.urls import path

from ..views.ManageAccessView import ManageExtraBillingAccessView
from ..views.PartyViews import BillingPartyView, PartyChargeView
from ..views.PaymentViews import ExtraPaymentView
from ..views.PostingViews import ExtraPostingView
from ..views.ReportViews import ExtraReportView
from ..views.TitleViews import BillingTitleView

# /extra-billing + ...
urlpatterns = [
    # setup
    path("parties", BillingPartyView.as_view(), name="people billed besides students"),
    path("charges", PartyChargeView.as_view(), name="what a party pays monthly"),
    path("titles", BillingTitleView.as_view(), name="extra billing charge heads"),
    # money
    path("postings", ExtraPostingView.as_view(), name="raise extra bills"),
    path("payments", ExtraPaymentView.as_view(), name="collect and receipt"),
    # records
    path("reports", ExtraReportView.as_view(), name="extra billing records"),
    # superadmin
    path(
        "manage/access",
        ManageExtraBillingAccessView.as_view(),
        name="which schools have extra billing",
    ),
]
