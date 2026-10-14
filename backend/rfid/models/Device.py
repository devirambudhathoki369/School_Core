from django.db import models


class Device(models.Model):
    STATE_OFFLINE = "offline"
    STATE_ONLINE = "online"
    STATE_CONNECTING = "connecting"
    STATE_CHOICES = [
        (STATE_OFFLINE, "Offline"),
        (STATE_ONLINE, "Online"),
        (STATE_CONNECTING, "Connecting"),
    ]

    # How this device talks to us.
    #   zk_push : ZKTeco terminal speaking the push protocol at /iclock/* — it
    #             polls us, keeps its own user table, verifies badges locally.
    #   uhf     : a dumb UHF reader (UHF5E Pro) wired to an ESP32 that POSTs
    #             JSON to /rfid/scan. No on-device users, no verification, no
    #             network stack of its own — the controller speaks for it.
    KIND_ZK_PUSH = "zk_push"
    KIND_UHF = "uhf"
    KIND_CHOICES = [
        (KIND_ZK_PUSH, "ZKTeco push terminal"),
        (KIND_UHF, "UHF reader (Wiegand -> controller)"),
    ]

    # Which way through the gate a scan on this reader means. Gates usually get
    # one reader per direction; a single-reader site just leaves this on IN.
    DIRECTION_IN = "in"
    DIRECTION_OUT = "out"
    DIRECTION_CHOICES = [
        (DIRECTION_IN, "In"),
        (DIRECTION_OUT, "Out"),
    ]

    serial_number = models.CharField(max_length=32, unique=True)
    alias = models.CharField(max_length=64, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    firmware = models.CharField(max_length=64, blank=True)
    push_version = models.CharField(max_length=16, blank=True)
    device_type = models.CharField(max_length=32, blank=True)
    push_comm_key = models.CharField(max_length=64, blank=True)
    timezone_min = models.IntegerField(default=0)
    real_time = models.BooleanField(default=True)
    state = models.CharField(
        max_length=16, choices=STATE_CHOICES, default=STATE_OFFLINE
    )
    last_seen = models.DateTimeField(null=True, blank=True)

    attlog_stamp = models.CharField(max_length=32, default="None")
    operlog_stamp = models.CharField(max_length=32, default="None")
    photo_stamp = models.CharField(max_length=32, default="None")

    user_count = models.IntegerField(default=0)
    fp_count = models.IntegerField(default=0)
    face_count = models.IntegerField(default=0)
    trans_count = models.IntegerField(default=0)

    school = models.ForeignKey("main.SchoolAdmin", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    # --- UHF / controller-fronted readers ---------------------------------
    # Defaults keep every existing row behaving exactly as before.
    reader_kind = models.CharField(
        max_length=16, choices=KIND_CHOICES, default=KIND_ZK_PUSH
    )
    direction = models.CharField(
        max_length=8, choices=DIRECTION_CHOICES, default=DIRECTION_IN
    )
    # Shared secret the controller presents as X-Reader-Key. Per-device so one
    # school's ESP32 can't post scans for another's gate.
    reader_key = models.CharField(max_length=64, blank=True)

    def __str__(self):
        return f"{self.alias or self.serial_number} [{self.school.name}]"


# Admin
from django.contrib import admin


class DeviceAdmin(admin.ModelAdmin):
    list_select_related = ("school",)
    list_display = (
        "id",
        "alias",
        "school",
        "state",
        "last_seen",
        "ip_address",
    )


# Device Commands


class DeviceCommand(models.Model):
    STATUS_PENDING = "pending"
    STATUS_SENT = "sent"
    STATUS_DONE = "done"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_SENT, "Sent"),
        (STATUS_DONE, "Done"),
        (STATUS_FAILED, "Failed"),
    ]

    device = models.ForeignKey(
        Device, on_delete=models.CASCADE, related_name="commands"
    )
    cmd_id = models.CharField(max_length=16, unique=True)
    cmd_content = models.TextField()
    status = models.CharField(
        max_length=10, choices=STATUS_CHOICES, default=STATUS_PENDING
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    return_code = models.IntegerField(null=True, blank=True)
    return_info = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["device", "status", "created_at"])]

    def __str__(self):
        snippet = self.cmd_content[:40]
        return f"C:{self.cmd_id}:{snippet} [{self.status}]"
