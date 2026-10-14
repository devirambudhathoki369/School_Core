from django.db.models import ForeignKey, CASCADE, SET_NULL

#
from main.models.FiscalYears import FiscalYear


class AccountingEconomicYear(FiscalYear):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    previous_ey = ForeignKey(
        "self",
        on_delete=SET_NULL,
        null=True,
        blank=True,
        related_name="next_eys",
    )

    def __str__(self):
        return f"{self.school.name} > {self.name}"
