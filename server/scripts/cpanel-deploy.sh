#!/bin/bash
# Deploys server/ from this repository to the Node app that cPanel runs.
#
# cPanel > Git Version Control > Manage > "Deploy HEAD Commit" runs it (through
# /.cpanel.yml) after the repository has been updated from GitHub.
#
# What it does:
#   1. replaces <app>/src and <app>/scripts with the repository's copies;
#   2. runs "npm install" only when package-lock.json changed since the last
#      successful install (so a code-only update never touches node_modules);
#   3. asks Passenger to restart the app by replacing <app>/tmp/restart.txt.
#
# It never touches <app>/.env, <app>/node_modules (except step 2) or the logs.
# Everything it does is written to <app>/deploy.log.
#
# Overrides, for testing: KIMU_APP_DIR, KIMU_NPM.
set -eu

APP="${KIMU_APP_DIR:-/home/unguka/kimu-api/server}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # <repository>/server
LOG="$APP/deploy.log"

if [ ! -f "$APP/.env" ] || [ ! -d "$APP/node_modules" ]; then
  echo "Refusing to deploy: $APP does not look like the running app (no .env or node_modules)." >&2
  exit 1
fi
if [ ! -f "$HERE/src/index.js" ] || [ ! -f "$HERE/package.json" ]; then
  echo "Refusing to deploy: $HERE is not the server folder of the repository." >&2
  exit 1
fi

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*" | tee -a "$LOG"; }
COMMIT="$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo unknown)"
log "deploy of commit $COMMIT started"

# 1. Code. Copy next to the live folder, then swap, so a failed copy leaves the
#    running code alone; removing the old folder drops files deleted upstream.
for dir in src scripts; do
  rm -rf "$APP/$dir.new"
  cp -R "$HERE/$dir" "$APP/$dir.new"
  rm -rf "$APP/$dir"
  mv "$APP/$dir.new" "$APP/$dir"
done
log "code copied (src, scripts)"

# 2. Libraries, only when the lock file changed.
if cmp -s "$HERE/package-lock.json" "$APP/package-lock.json"; then
  cp "$HERE/package.json" "$APP/package.json"
  log "libraries unchanged, npm not run"
else
  NPM="${KIMU_NPM:-/opt/alt/alt-nodejs22/root/usr/bin/npm}"
  [ -x "$NPM" ] || NPM="$(command -v npm || true)"
  if [ -z "$NPM" ]; then
    log "WARNING: package-lock.json changed but npm was not found; libraries NOT updated. The app may fail to start."
  else
    # Keep the current files so a failed install can be undone; the next
    # deploy then tries again.
    cp "$APP/package.json" "$APP/package.json.prev"
    cp "$APP/package-lock.json" "$APP/package-lock.json.prev"
    cp "$HERE/package.json" "$HERE/package-lock.json" "$APP/"
    if ( cd "$APP" && PATH="$(dirname "$NPM"):$PATH" "$NPM" install --omit=dev --no-audit --no-fund ) >> "$LOG" 2>&1; then
      log "libraries installed"
    else
      cp "$APP/package.json.prev" "$APP/package.json"
      cp "$APP/package-lock.json.prev" "$APP/package-lock.json"
      log "WARNING: npm install failed (details above); the old libraries are still in place and the next deploy will retry."
    fi
    rm -f "$APP/package.json.prev" "$APP/package-lock.json.prev"
  fi
fi

# 3. Restart: Passenger restarts the app when this file's modified time changes.
mkdir -p "$APP/tmp"
rm -f "$APP/tmp/restart.txt"
: > "$APP/tmp/restart.txt"
log "restart requested; check stderr.log if the site does not come back"
