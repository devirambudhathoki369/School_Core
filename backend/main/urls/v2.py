from django.urls import path

from ..views.ClassViews import ClassViews
from ..views.FeeViews import FeeView
from ..views.exams.ResultViews import ResultView

urlpatterns = [
    path("classes", ClassViews.as_view(), name="classes"),
    path("fees", FeeView.as_view(), name="fees"),
    path("exams/results", ResultView.as_view(), name="exam results"),
]
