from .Commands import Commands, is_access_control, panel_card_no
from .DeviceCommandQueueReg import CommandQueue


def profile_name(profile):
    """
    First/middle/last exactly as entered, collapsed to one string.

    Deliberately not .capitalize()'d the way the enrolment serializer does it —
    that lowercases everything after the first letter and turns "B.k" into
    "b.k". The name on the panel is cosmetic (the PIN and card are what it
    matches on), so a sync leaves it reading the way the school typed it.
    """
    parts = [
        (getattr(profile, "first_name", "") or "").strip(),
        (getattr(profile, "middle_name", "") or "").strip(),
        (getattr(profile, "last_name", "") or "").strip(),
    ]
    return " ".join(p for p in parts if p)


class UsersSyncReg:

    @staticmethod
    def _acc_add_commands(u):
        """
        Enrolment pair for an access-control panel.

        Four commands, not one:
          - "DATA UPDATE user" creates the person,
          - "DATA DELETE/UPDATE mulcarduser" puts the badge on them (the `user`
            row's CardNo is accepted and then dropped — the panel reads that
            column back as 0),
          - "DATA UPDATE userauthorize" is what actually lets the badge open a
            door. Enrol without it and the panel stores the user but refuses
            them at the reader.
        """
        pin = u.get("pin")
        # HEX, because that is the base the panel stores and matches cards in.
        # Sent as decimal the badge matches nothing and every tap is logged as
        # an unregistered card -- see panel_card_no().
        card = panel_card_no(u.get("card"))
        return [
            Commands.UPDATE_USER_INBIO.format(
                card=card or 0,
                pin=pin,
                password=u.get("password", "") or "",
                group=u.get("group", 1),
                start_time=u.get("start_time", Commands.DEFAULT_START_TIME),
                end_time=u.get("end_time", Commands.DEFAULT_END_TIME),
                name=u.get("name") or "",
                super_authorize=u.get("super_authorize", 0),
                disable=u.get("disable", 0),
            ),
        ] + ([
            Commands.DELETE_MUL_CARD_USER.format(pin=pin),
            Commands.UPDATE_MUL_CARD_USER.format(pin=pin, card=card),
        ] if card else []) + [
            Commands.UPDATE_USER_AUTHORIZE.format(
                pin=pin,
                timezone_id=u.get("timezone_id", Commands.DEFAULT_TIMEZONE_ID),
                door_id=u.get("door_id", Commands.DEFAULT_DOOR_ID),
            ),
        ]

    @staticmethod
    def add_users(device, users):
        """
        Bulk create commands for new users with RFID cards.
        """
        commands = []
        # mulcarduser is behind a device-wide feature switch, so it has to be
        # on before the first card lands. Once per sync, not once per user.
        if is_access_control(device) and users:
            commands.append(Commands.ENABLE_MUL_CARD_USER)
        for u in users:
            if is_access_control(device):
                commands.extend(UsersSyncReg._acc_add_commands(u))
                continue
            pin = u.get("pin")
            name = u.get("name")
            card = u.get("card")
            cmd = f"DATA UPDATE USERINFO PIN={pin}\tName={name}\tPri=0\t"
            if card:
                cmd += f"Card={card}\t"
            cmd += f"Passwd=0\tGroup=0\tTZ=0\r\n"
            commands.append(cmd)
        return [CommandQueue.enqueue(device, c) for c in commands]

    @staticmethod
    def update_cards(device, users):
        """
        Bulk update commands on RFID card numbers changed.
        """
        # Access panels have no card-only update: "DATA UPDATE user" is an
        # upsert keyed on Pin, so sending it without Name would blank the name
        # already on the panel. Re-send the full enrolment instead -- callers
        # pass the same {pin, name, card} payload either way.
        if is_access_control(device):
            return UsersSyncReg.add_users(device, users)

        commands = []
        for u in users:
            pin = u.get("pin")
            card = u.get("card")
            if not pin:
                continue
            cmd = f"DATA UPDATE USERINFO PIN={pin}"
            if card:
                cmd += f"\tCard={card}"
            cmd += "\r\n"
            commands.append(cmd)
        return [CommandQueue.enqueue(device, c) for c in commands]

    @staticmethod
    def delete_users(device, users):
        """
        Bulk delete commands for users.
        """
        commands = []
        for u in users:
            pin = u.get("pin")
            if not pin:
                continue
            if is_access_control(device):
                commands.append(Commands.DELETE_USER.format(pin=pin))
                continue
            cmd = f"DATA DELETE USER PIN={pin}\r\n"
            commands.append(cmd)
        return [CommandQueue.enqueue(device, c) for c in commands]
