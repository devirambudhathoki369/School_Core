#!/bin/bash
# Cron wrapper for the daily shareholder "Today's Collection Point" SMS.
# Scheduled at 12:15 UTC (= 18:00 NPT) via root crontab.
#
# This file is TRACKED in the repo on purpose: it used to be a server-only
# script and a deploy's `git reset --hard` wiped it, silently stopping the
# daily SMS (same failure that hit config/gunicorn.py). Keeping it in the repo
# means deploys re-create it instead of deleting it.
#
# cd into the app dir so the python script finds ./shareholders.json.
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 1

VENV=/root/home/manish404/.virtualenvs/smsysvenv/bin/python
# Pass through any args (e.g. a Nepali date "YYYY-MM-DD" to re-send a missed day).
"$VENV" backend/scripts/send_daily_collection.py "$@"
