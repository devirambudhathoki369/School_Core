from .BaseModel import BaseModel, CustomCharField, _allow_empty

from django.db.models import ForeignKey, DecimalField, CASCADE

location_configs = {"max_digits": 18, "decimal_places": 15}


class BusStation(BaseModel):
    station = CustomCharField(min_length=2, max_length=25)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    fee = DecimalField(max_digits=7, decimal_places=2)  # upto 9999.99/10k
    latitude = DecimalField(**location_configs, **_allow_empty)
    longitude = DecimalField(**location_configs, **_allow_empty)

    def __str__(self) -> str:
        return f"{self.school.name} > Bus Station : {self.station}"
