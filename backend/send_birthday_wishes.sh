#!/bin/bash
# Cron wrapper for the daily birthday push (students + staff).
# Scheduled at 02:30 UTC (= 08:15 NPT) via root crontab.
#
# TRACKED in the repo on purpose: server-only cron scripts get wiped by a
# deploy's `git reset --hard` (see send_daily_collection.sh / config/gunicorn.py).
# Keeping it here means deploys re-create it instead of deleting it.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 1

VENV=/root/home/manish404/.virtualenvs/smsysvenv/bin/python
# Pass through args (e.g. --dry-run).
"$VENV" manage.py send_birthday_wishes "$@"
