"""One optional scheduler, with durable claims to avoid repeat message sends.

Schedules use Nepal time. Missed slots are not replayed; failed jobs require
operator review, since retrying a partially sent batch can send duplicates.
"""
import fcntl
import logging
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import sys
import threading
from datetime import datetime
from zoneinfo import ZoneInfo

LOG = logging.getLogger("schoolcore.scheduler")
ZONE = ZoneInfo("Asia/Kathmandu")
# flag, hour (None = every hour), minute, command
JOBS = (
    ("ENABLE_BIRTHDAY_PUSH", 8, 15, ("manage.py", "send_birthday_wishes")),
    ("ENABLE_BIRTHDAY_SMS", 8, 30, ("manage.py", "send_birthday_sms")),
    ("ENABLE_ABSENT_PUSH", 11, 30, ("manage.py", "send_absent_notifications")),
    ("ENABLE_COLLECTION_SMS", 18, 0, ("backend/scripts/send_daily_collection.py",)),
    *(("ENABLE_SMS_DELIVERY_SYNC", None, minute, ("manage.py", "sync_sms_delivery", "--apply"))
      for minute in (0, 15, 30, 45)),
)


def due_jobs(now, environment):
    for flag, hour, minute, command in JOBS:
        if environment.get(flag, "false").lower() != "true":
            continue
        if (hour is None or now.hour == hour) and now.minute == minute:
            yield flag, now.strftime("%Y-%m-%dT%H:%M"), command


def claim(connection, name, slot):
    with connection:
        result = connection.execute(
            "INSERT OR IGNORE INTO runs (name, slot) VALUES (?, ?)", (name, slot)
        )
        # Only keep the last 30 days of claims.
        connection.execute("DELETE FROM runs WHERE slot < date('now', '-30 days')")
    return result.rowcount == 1


def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    state = Path("/data/scheduler")
    state.mkdir(parents=True, exist_ok=True)
    # flock is released by the OS on exit; never run two senders on this volume.
    with (state / "scheduler.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit("Another scheduler already owns this state volume.")
        stop = threading.Event()
        for signum in (signal.SIGTERM, signal.SIGINT):
            signal.signal(signum, lambda *_: stop.set())
        with sqlite3.connect(state / "runs.sqlite3") as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS runs (name TEXT, slot TEXT, PRIMARY KEY (name, slot))")
            enabled = sorted({flag for flag, *_ in JOBS if os.environ.get(flag, "false").lower() == "true"})
            LOG.info("Timezone: %s; enabled jobs: %s", ZONE, ", ".join(enabled) or "none")
            while not stop.is_set():
                for name, slot, command in due_jobs(datetime.now(ZONE), os.environ):
                    if stop.is_set() or not claim(connection, name, slot):
                        continue
                    LOG.info("Starting %s (%s)", name, slot)
                    child = subprocess.Popen([sys.executable, *command], cwd="/app")
                    while child.poll() is None and not stop.wait(1):
                        pass
                    if child.poll() is None:
                        child.terminate()
                        try:
                            child.wait(timeout=20)
                        except subprocess.TimeoutExpired:
                            child.kill()
                            child.wait()
                    LOG.log(logging.INFO if child.returncode == 0 else logging.ERROR,
                            "%s finished with exit code %s; no automatic retry", name, child.returncode)
                stop.wait(10)


if __name__ == "__main__":
    main()
