#!/usr/bin/env bash
#
# activate-release.sh <release-id> — runs ON THE VPS, invoked by the deploy workflow.
# ---------------------------------------------------------------------------
# Flips the `current` symlink to a freshly-shipped release, restarts the service,
# health-checks it, and AUTO-ROLLS-BACK to the previous release if the check fails.
# Mirrors the backend deploy.sh "code is reversible" ethos: a bad build never
# overwrites the running release — we only swap a symlink after health passes.
#
#   releases/<id>/   <- bundle just rsync'd here by the workflow
#   current -> releases/<id>   (this script repoints it)
#
# Env overrides: FRONTEND_DIR, SERVICE, HEALTH_URL, KEEP_RELEASES
# ---------------------------------------------------------------------------
set -Eeuo pipefail

FRONTEND_DIR="${FRONTEND_DIR:-/root/home/manish404/projects/smsys.frontend}"
SERVICE="${SERVICE:-smsys-frontend}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/hello}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
REL="${1:?usage: activate-release.sh <release-id>}"

# sudo only if we're not already root
SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"

cd "$FRONTEND_DIR"
NEW="releases/$REL"
[ -d "$NEW" ] || { echo "FATAL: $FRONTEND_DIR/$NEW not found"; exit 1; }

# remember the live release so we can roll back to it
PREV=""; [ -L current ] && PREV="$(readlink current || true)"

echo "==> Activating $NEW (was: ${PREV:-none})"
ln -sfn "$NEW" current
$SUDO systemctl restart "$SERVICE"

# health check with a few retries while the server boots
ok=""
for _ in 1 2 3 4 5; do
  sleep 2
  if curl -fsS --max-time 10 "$HEALTH_URL" >/dev/null; then ok=1; break; fi
done

if [ -z "$ok" ]; then
  echo "!!! Health check FAILED at $HEALTH_URL for $NEW"
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    echo "==> Rolling back to $PREV"
    ln -sfn "$PREV" current
    $SUDO systemctl restart "$SERVICE"
  fi
  exit 1
fi
echo "==> $NEW is live (health OK)"

# prune old releases — keep newest $KEEP_RELEASES, never touch the live one
CURR="$(readlink current)"
ls -1dt releases/*/ 2>/dev/null | sed 's:/*$::' | tail -n +$((KEEP_RELEASES+1)) | while read -r d; do
  [ "$d" = "$CURR" ] && continue
  echo "    pruning $d"
  rm -rf "$d"
done
