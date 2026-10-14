DEVICE_TYPE_ACC = "acc"


def is_access_control(device):
    """
    True for access-control panels (InBio and friends).

    They announce themselves as DeviceType=acc on their first cdata call;
    attendance terminals send "att" or nothing at all. Deliberately a plain
    function rather than a Device property so this feature stays independent
    of any pending model/migration work on Device.
    """
    return (getattr(device, "device_type", "") or "").strip().lower() == DEVICE_TYPE_ACC


def panel_card_no(card):
    """
    A card number in the base an access panel actually stores it in: HEX.

    We hold cards as the decimal number printed on the badge and reported by
    the reader (13993287). An access panel keeps them in hex, and takes them
    in hex too -- so "CardNo=13993287" is read as 0x13993287, a different card
    entirely, and the badge matches nothing. Every read then lands in the
    panel's transaction table as eventtype=27 with pin=0 ("unregistered
    personnel"), the door stays shut, and the punch has no person attached by
    the time it reaches us.

    Confirmed on PQU8260900014 two ways: the panel's own transaction table
    reports cardno=d58547 for the badge our records call 13993287, and ZKTeco's
    ZKBio CVSecurity enrols that same badge as "mulcarduser ... CardNo=d58518"
    (= 13993240). Both are the hex of the decimal we hold.

    Attendance terminals are NOT affected and must never be converted -- they
    take the decimal we already send. Callers gate this on is_access_control().

    A blank or non-numeric value is returned untouched: there is nothing to
    convert and guessing would be worse than leaving it alone.
    """
    card = (str(card) if card is not None else "").strip()
    if not card or not card.isdigit():
        return card
    return format(int(card), "x")


class Commands:
    """
    Command templates for access-control panels (DeviceType=acc, e.g. InBio260
    Pro Plus).

    These panels speak the same push transport as the attendance terminals --
    they poll /iclock/getrequest and post to /iclock/cdata -- but they do NOT
    understand the attendance command set. Sending an attendance terminal's
    "DATA UPDATE USERINFO PIN=..." to one is answered with Return=-629 and the
    command is dropped, which is why an enrolled user could sit in our table
    while the panel reported user_count=0.

    Formats below are taken from ZKTeco's own C# AC Push demo (Access/Commands.cs
    in the vendor SDK archive kept at the repo root), not reverse-engineered.
    """

    # Enrol / update a person. InBio panels take SuperAuthorize+Disable where
    # the generic access firmware takes Privilege.
    UPDATE_USER_INBIO = (
        "DATA UPDATE user "
        "CardNo={card}\tPin={pin}\tPassword={password}\tGroup={group}\t"
        "StartTime={start_time}\tEndTime={end_time}\tName={name}\t"
        "SuperAuthorize={super_authorize}\tDisable={disable}\r\n"
    )

    # Grant the person a door + timezone. Without this a user exists on the
    # panel but is refused at the reader, so it must follow every enrolment.
    UPDATE_USER_AUTHORIZE = (
        "DATA UPDATE userauthorize "
        "Pin={pin}\tAuthorizeTimezoneId={timezone_id}\tAuthorizeDoorId={door_id}\r\n"
    )

    # Where an InBio panel ACTUALLY keeps a card. "DATA UPDATE user CardNo=.."
    # is accepted (ret=0) and then discarded: after enrolling all 620 users of
    # school 32 that way the panel read its own user table back with CardNo=0
    # on every one of them. ZKTeco's ZKBio CVSecurity does not use that field
    # either — it sends `user` with CardNo EMPTY and puts the badge here.
    # Cleared first, because the table is one-person-many-cards: updating
    # without deleting leaves the previous badge working alongside the new one.
    DELETE_MUL_CARD_USER = "DATA DELETE mulcarduser Pin={pin}\r\n"
    UPDATE_MUL_CARD_USER = (
        "DATA UPDATE mulcarduser "
        "Pin={pin}\tCardNo={card}\tLossCardFlag=0\tCardType=0\r\n"
    )

    # mulcarduser is behind a feature switch; the vendor demo sets it
    # immediately before every card it uploads (UCUser.UploadMuilCardUser).
    # Sent once per sync rather than once per user — it is device-wide state.
    ENABLE_MUL_CARD_USER = "SET OPTIONS MulCardUserFunOn=1\r\n"

    DELETE_USER = "DATA DELETE user Pin={pin}\r\n"

    # Ask the panel to report its user table. It answers on /iclock/querydata
    # with the row count in the query string — the only way to learn what an
    # access panel actually holds, since it never volunteers counters the way
    # an attendance terminal does in its INFO= poll.
    QUERY_USER = "DATA QUERY tablename=user,fielddesc=*,filter=*\r\n"

    # The access-control equivalent of "DATA QUERY ATTLOG". Attendance
    # terminals keep punches in an ATTLOG table; access panels keep them in
    # `transaction`, and answer an ATTLOG query with -629 — which is why Pull
    # Logs did nothing on a panel. Delivered on /iclock/querydata like any
    # other table.
    QUERY_TRANSACTION = "DATA QUERY tablename=transaction,fielddesc=*,filter=*\r\n"

    # Timezone 1 is the built-in always-open rule. The vendor demo spells this
    # out where it issues an access level -- "timezoneID 2-50, default 1 is
    # 24-hour access" (UCUser.UploadAccessLevel) -- and starts every timezone
    # it defines itself at 2 for exactly that reason. So 1 needs no definition
    # pushed alongside it; anything else would.
    DEFAULT_TIMEZONE_ID = 1

    # AuthorizeDoorId is a BITMASK over the controller's doors, not a door
    # number: door 1 = 1, door 2 = 2, door 3 = 4, door 4 = 8. The demo builds
    # it by adding those weights per ticked door and reads it back through
    # Convert.ToString(DoorID, 2) (UCAcessLevel), and its own sample access
    # level carries 15 -- all four doors.
    #
    # This was 1, which authorises door 1 ALONE. On a multi-door controller
    # like the InBio260 that leaves everyone unauthorised at any reader wired
    # to door 2: enrolled, present in the panel's user table, and refused at
    # the door with no attendance event ever raised. 15 grants every door the
    # controller has, and bits for doors it doesn't have are simply ignored.
    ALL_DOORS = 15
    DEFAULT_DOOR_ID = ALL_DOORS

    # "no expiry" window the panel accepts for an unrestricted user.
    DEFAULT_START_TIME = 0
    DEFAULT_END_TIME = 0
