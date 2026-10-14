from django.db import models

from .Device import Device


class UnknownScan(models.Model):
    """
    A tag the reader saw that we couldn't resolve to a Student/Staff.

    The UHF reader is a dumb slave — it has no on-device user table to verify
    against, so it happily emits the EPC of *any* Gen2 tag in range, including
    ones we've never enrolled. Rather than 404-ing those into the void, we keep
    the newest sighting per (device, epc) so cards can be enrolled by simply
    walking one past the gate and binding it from the admin panel.

    Deliberately NOT a BaseModel: these are high-churn, low-value rows and we
    don't want every sighting spraying HistoryLog entries.
    """

    device = models.ForeignKey(
        Device, on_delete=models.CASCADE, related_name="unknown_scans"
    )
    epc = models.CharField(max_length=64, db_index=True)
    bits = models.IntegerField(default=0)
    reader_id = models.CharField(max_length=64, blank=True)
    seen_count = models.IntegerField(default=1)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)
    # flipped once the EPC gets bound to a profile, so the enrollment screen can
    # hide it without losing the audit trail of what was seen at the gate.
    resolved = models.BooleanField(default=False)

    class Meta:
        unique_together = ("device", "epc")
        indexes = [
            models.Index(fields=["device", "resolved", "-last_seen"]),
        ]

    def __str__(self):
        return f"{self.epc} x{self.seen_count} [{self.device}]"
