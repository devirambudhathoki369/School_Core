from accounting.models.AccountingEconomicYear import AccountingEconomicYear


def ensure_accounting_year(school):
    """Give an accounting-enabled school its first working books period.

    Subsequent years are created only by the accounting closing workflow. This
    helper handles the initial school setup, where asking an operator to create
    another copy of the Economic Year is needless configuration.
    """
    economic_year = getattr(school, "economic_year", None)
    if not economic_year:
        return None
    existing = AccountingEconomicYear.objects.filter(
        school=school, closed=False
    ).order_by("-start_date", "-id").first()
    if existing:
        return existing
    return AccountingEconomicYear.objects.create(
        school=school,
        name=economic_year.name,
        start_date=economic_year.start_date,
        end_date=economic_year.end_date,
        remarks="Created automatically from the school's Economic Year",
    )
