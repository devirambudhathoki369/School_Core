from django.db import transaction
from django.utils import timezone
from ..models.Device import DeviceCommand
import secrets


class CommandQueue:

    @staticmethod
    def enqueue(device, content):
        return DeviceCommand.objects.create(
            device=device,
            cmd_id=secrets.token_hex(8),
            cmd_content=content,
        )

    @staticmethod
    def pop_pending(device, limit=10):
        with transaction.atomic():
            qs = (
                DeviceCommand.objects.select_for_update(skip_locked=True)
                .filter(device=device, status=DeviceCommand.STATUS_PENDING)
                .order_by("created_at")[:limit]
            )
            cmds = list(qs)
            if cmds:
                ids = [c.pk for c in cmds]
                DeviceCommand.objects.filter(pk__in=ids).update(
                    status=DeviceCommand.STATUS_SENT,
                    sent_at=timezone.now(),
                )
            return cmds

    @staticmethod
    def enqueue_pull_attlog(device, start=None, end=None):
        """
        Queue a ZKTeco-push `DATA QUERY ATTLOG` command so the device re-uploads
        the attendance logs it still has in storage.

        On its next /getrequest poll the device receives this command and replies
        by POSTing the matching ATTLOG records to /cdata, where `ingest_attlog`
        stores them idempotently (bulk_create(ignore_conflicts=True) on the
        (user, punch_time, status, verify) unique key). That makes this safe to
        run repeatedly: it backfills punches the server missed while it was
        offline without ever duplicating ones it already has.

        `start`/`end` are device-local "YYYY-MM-DD HH:MM:SS" strings bounding the
        query window (the device clock runs Nepal time).
        """
        cmd = "DATA QUERY ATTLOG"
        if start:
            cmd += f" StartTime={start}"
        if end:
            cmd += f"\tEndTime={end}"
        cmd += "\r\n"
        return CommandQueue.enqueue(device, cmd)

    # A command's result must not outgrow the row it is written on. Only a
    # query reconciliation is ever long, and one of those is all we need.
    MAX_RETURN_INFO = 4000

    @staticmethod
    def mark_done(cmd_id, return_code, raw_line):
        if return_code >= 0:
            new_status = DeviceCommand.STATUS_DONE
        else:
            new_status = DeviceCommand.STATUS_FAILED

        # A DATA QUERY finishes twice, from two directions and in either order:
        # the panel acknowledges the command on /devicecmd, and uploads the
        # table itself to /querydata. Both land within the same second on
        # different workers. Replacing return_info outright meant whichever
        # arrived second erased the other — in practice the short "Return=31"
        # line wiping out the reconciliation that says WHO those 31 are. So
        # append instead, and keep it idempotent so a re-sent upload doesn't
        # stack duplicates.
        cmd = DeviceCommand.objects.filter(cmd_id=cmd_id).first()
        if cmd is None:
            return
        raw_line = raw_line or ""
        existing = cmd.return_info or ""
        if not existing:
            info = raw_line
        elif raw_line and raw_line not in existing:
            info = f"{existing}\n{raw_line}"
        else:
            info = existing

        DeviceCommand.objects.filter(cmd_id=cmd_id).update(
            status=new_status,
            return_code=return_code,
            return_info=info[: CommandQueue.MAX_RETURN_INFO],
            finished_at=timezone.now(),
        )
