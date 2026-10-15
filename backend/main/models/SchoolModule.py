"""
Which facilities (modules) each school has: payroll, exams, accounting,
library, inventory, hostel, extra billing.

    SchoolAdmin 1 ──── 0..* SchoolModule 0..* ──── 1 Module

A school has many modules and a module is had by many schools; SchoolModule is
that many-to-many, one row per (school, module) -- the grant.

The set of modules is data, so it is rows, not a column per module on the
school: adding a facility later is a catalog row and its grants, not another
column, and "which schools have X" is one indexed lookup.
"""

from django.db.models import (
    CASCADE,
    PROTECT,
    CharField,
    ForeignKey,
    Model,
    UniqueConstraint,
)
from django.db.models.signals import post_save
from django.dispatch import receiver

#
from .BaseModel import BaseModel
from .SchoolAdmin import SchoolAdmin
from ..constants.school_modules import DEFAULT_ON


class Module(Model):
    """
    The catalog of modules, keyed by the code the application uses.

    Its rows come from constants/school_modules.MODULES -- kept in step on every
    `migrate` (main/apps.py: sync_module_catalog), the way Django keeps its own
    content types -- so the code defines a module and the database can hold
    the school's grants of it to that definition.
    """

    code = CharField(max_length=24, primary_key=True)
    name = CharField(max_length=60)

    def __str__(self) -> str:
        return self.name


class SchoolModule(BaseModel):
    """
    A school's grant of one module.

    One row per (school, module), ever. The school HAS the module while its row
    is active. Taking it away is the soft delete every record here gets
    (`is_active` False), and giving it back reactivates the same row -- so
    `created_at` is when it was first given, and HistoryLog records each switch
    with who made it. A school with no row for a module never had it.

    Integrity lives in the database, not only here: a grant names a real
    school and a real module (foreign keys), and a pair once (unique) -- a raw
    insert, a restore or a shell cannot write a typo the application would
    then read as "not granted".

    Switching a module off deletes nothing in it. Its records stay, are still
    in the school's export, and come back as they were when it is switched on.
    """

    # The grants go with their school. No index of its own: the unique
    # (school, module) index below leads with school_id and serves every
    # lookup -- the gate, the profiles, the lists all ask by school.
    school = ForeignKey(SchoolAdmin, on_delete=CASCADE, related_name="modules", db_index=False)
    # A module cannot be dropped from the catalog while any school holds it.
    # No index either: nothing looks grants up by module first, and the catalog
    # row it would speed up deleting is never deleted.
    module = ForeignKey(Module, on_delete=PROTECT, related_name="grants", db_index=False)

    class Meta:
        constraints = [
            UniqueConstraint(fields=["school", "module"], name="school_module_once"),
        ]

    def __str__(self) -> str:
        return f"{self.school_id}:{self.module_id}"


@receiver(post_save, sender=SchoolAdmin, dispatch_uid="school_module_defaults")
def grant_default_modules(sender, instance, created, raw=False, **kwargs):
    """A new school starts with the modules every school has had (DEFAULT_ON),
    however it is added -- the school form then applies what was chosen.

    Not on a fixture load (`raw`): a restored school brings its own rows."""
    if created and not raw:
        for code in sorted(DEFAULT_ON):
            SchoolModule.objects.create(school=instance, module_id=code)
