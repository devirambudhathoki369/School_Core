CLASS_DETAILS_FIELDS = (
    "education_level",
    "grade",
    "faculty",
    "course",
    "section",
    "year",
    "semester",
)
FOREIGN_CLASS_INFO_FIELDS = tuple(
    (f"class_info__{field}" for field in CLASS_DETAILS_FIELDS)
)
FOREIGN_CLASS_DETAILS_FIELDS = ("course", "section")
CHOICES_CLASS_DETAILS_FIELDS = (
    "education_level",
    "faculty",
    "grade",
    "year",
    "semester",
)
