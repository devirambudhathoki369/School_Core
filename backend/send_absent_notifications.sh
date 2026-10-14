#!/bin/bash
# Cron wrapper for the daily "marked absent today" push.
# Scheduled at 05:45 UTC (= 11:30 NPT) via root crontab — AFTER the morning
# punch window / in-time cutoff, so late punchers aren't wrongly notified.
#
# TRACKED in the repo on purpose: server-only cron scripts get wiped by a
# deploy's `git reset --hard` (see send_daily_collection.sh / config/gunicorn.py).
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 1

VENV=/root/home/manish404/.virtualenvs/smsysvenv/bin/python
# Pass through args (e.g. --date YYYY-MM-DD, --dry-run).
"$VENV" manage.py send_absent_notifications "$@"
