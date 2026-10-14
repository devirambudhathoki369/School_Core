# Server identity the newer panels (InBio*, PushOptionsFlag=1) expect to see.
# The ZK C# reference server sends these on every handshake; the legacy
# "GET OPTION FROM" firmware never reads them, so they stay out of that block.
SERVER_NAME = "ADMS"
SERVER_VERSION = "3.1.1"

# What an access panel is told to watch for new rows and upload.
#
# Attendance terminals take "TransFlag" listing THEIR tables (AttLog, OpLog,
# AttPhoto, EnrollUser...). An access panel has none of those. It takes
# "TransTables", and the vendor's DeviceModel spells out both the key and the
# value: `_transTables = "User\tTransaction"`, commented "data to check for new
# records and upload — needed to automatically upload users and access-control
# records".
#
# We sent TransFlag to everything and TransTables to nothing, so a panel was
# never asked to upload its Transaction table. It polled for commands
# faithfully and sat on its card events forever — the reason a tap at the
# reader produced a row on the device and nothing here.
AC_TRANS_TABLES = "User\tTransaction"
# Tab-separated, as the vendor writes it (_transTimes = "00:00\t14:30"). The
# semicolon form is what the attendance terminals have always been sent and is
# left alone for them.
AC_TRANS_TIMES = "00:00\t14:30"


def _is_acc(device):
    # Local to avoid importing the services layer into a pure string builder.
    return (getattr(device, "device_type", "") or "").strip().lower() == "acc"


def build_registered_response(device, registry_code):
    # An access panel gets EXACTLY what the vendor's own server sends one, and
    # nothing else. Captured from its ServerLog against a live InBio
    # (DeviceType=acc, PushOptionsFlag=1) — thirteen lines, in this order:
    #
    #   registry=ok / RegistryCode / ServerVersion / ServerName / PushProtVer
    #   ErrorDelay / RequestDelay / TransTimes / TransInterval / TransTables
    #   Realtime / SessionID / TimeoutSec
    #
    # We had been sending nine keys beyond that set — ATTLOGStamp, OPERLOGStamp,
    # ATTPHOTOStamp, BIODATAStamp, ERRORLOGStamp, Encrypt, ServerVer,
    # SupportPing and TimeZone. Every one of them is an attendance-terminal
    # concept, and TimeZone=0 in particular tells a panel its clock is UTC.
    # A firmware that skips keys it doesn't know is a claim we cannot test, so
    # the safer position is to say only what the reference server says.
    if _is_acc(device):
        return "\n".join(
            [
                "registry=ok",
                f"RegistryCode={registry_code}",
                f"ServerVersion={SERVER_VERSION}",
                f"ServerName={SERVER_NAME}",
                "PushProtVer=2.4.1",
                "ErrorDelay=120",
                "RequestDelay=30",
                "TransTimes=",
                "TransInterval=2",
                f"TransTables={AC_TRANS_TABLES}",
                f"Realtime={1 if device.real_time else 0}",
                f"SessionID={registry_code}",
                "TimeoutSec=10",
            ]
        )

    # Newer push firmware (pushver 3.x / PushOptionsFlag=1) completes a registry
    # handshake first, then expects this "registry=ok" options block instead of
    # the legacy "GET OPTION FROM" one. RequestDelay (not Delay) drives how
    # often it polls /iclock/getrequest for commands.
    if abs(device.timezone_min) >= 60:
        tz_hour = device.timezone_min // 60
    else:
        tz_hour = device.timezone_min

    lines = [
        "registry=ok",
        f"RegistryCode={registry_code}",
        f"ServerName={SERVER_NAME}",
        f"ServerVersion={SERVER_VERSION}",
        f"ATTLOGStamp={device.attlog_stamp}",
        f"OPERLOGStamp={device.operlog_stamp}",
        f"ATTPHOTOStamp={device.photo_stamp}",
        "BIODATAStamp=None",
        "ERRORLOGStamp=None",
        "ErrorDelay=30",
        "RequestDelay=10",
        f"TransTimes={AC_TRANS_TIMES if _is_acc(device) else '00:00;14:00'}",
        "TransInterval=1",
        # A panel gets TransTables (its own tables); a terminal keeps TransFlag.
        (
            f"TransTables={AC_TRANS_TABLES}"
            if _is_acc(device)
            else "TransFlag=TransData AttLog\tOpLog\tAttPhoto\tEnrollUser\tChgUser\tEnrollFP\tChgFP\tFPImag\tFACE\tUserPic\tBioPhoto"
        ),
        f"TimeZone={tz_hour}",
        f"Realtime={1 if device.real_time else 0}",
        "Encrypt=None",
        "ServerVer=2.4.2 1",
        # MachineType 8/9/10 panels read "PushVersion" and ignore "PushProtVer";
        # older ones do the reverse. Unknown keys are skipped line-by-line, so
        # sending both covers either firmware without having to detect the type.
        "PushProtVer=2.4.1",
        "PushVersion=2.4.1",
        f"SessionID={registry_code}",
        "TimeoutSec=60",
        "SupportPing=1",
    ]
    return "\n".join(lines)


def build_push_param_response(device, registry_code):
    # Answers GET/POST /iclock/push? — the config pull newer firmware makes
    # after registering (DevGetParam in the ZK C# reference). Without it the
    # panel 404s on its own config request and can stall before polling.
    #
    # TransTables used to be omitted here on the grounds that the device had
    # already been given its upload list as TransFlag. For a panel that was
    # never true: TransFlag lists tables it does not have, and TransTables is
    # the only key it reads. Omitting it is what kept its card events on the
    # device. The vendor sends it on every handshake (GetDeviceInitInfo).
    lines = [
        f"ServerVersion={SERVER_VERSION}",
        f"ServerName={SERVER_NAME}",
        "PushVersion=2.4.1",
        "ErrorDelay=30",
        "RequestDelay=10",
        f"TransTimes={AC_TRANS_TIMES if _is_acc(device) else '00:00;14:00'}",
        "TransInterval=1",
        f"Realtime={1 if device.real_time else 0}",
        *( [f"TransTables={AC_TRANS_TABLES}"] if _is_acc(device) else [] ),
        f"SessionID={registry_code}",
        "TimeoutSec=60",
        "MultiBioDataSupport=1:1:1:1:1:1:1:1:1:1",
        "MultiBioPhotoSupport=1:1:1:1:1:1:1:1:1:1",
    ]
    return "\n".join(lines)


def build_init_response(device):
    # The device parses this line-by-line; missing keys silently break it.
    if abs(device.timezone_min) >= 60:
        tz_hour = device.timezone_min // 60
    else:
        tz_hour = device.timezone_min

    lines = [
        f"GET OPTION FROM: {device.serial_number}",
        f"ATTLOGStamp={device.attlog_stamp}",
        f"OPERLOGStamp={device.operlog_stamp}",
        f"ATTPHOTOStamp={device.photo_stamp}",
        "BIODATAStamp=None",
        "ERRORLOGStamp=None",
        "ErrorDelay=30",
        "Delay=10",
        "TransTimes=00:00;14:00",
        "TransInterval=1",
        "TransFlag=TransData AttLog\tOpLog\tAttPhoto\tEnrollUser\tChgUser\tEnrollFP\tChgFP\tFPImag\tFACE\tUserPic\tBioPhoto",
        f"TimeZone={tz_hour}",
        f"Realtime={1 if device.real_time else 0}",
        "Encrypt=None",
        "ServerVer=2.4.2 1",
        "PushProtVer=2.2.14",
        "SupportPing=1",
    ]
    return "\n".join(lines)
