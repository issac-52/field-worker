#!/usr/bin/env bash
# Run via SSM as root. FIELDWORK_ROOT/health timing are overridable for local regression tests.
set -Eeuo pipefail
source_jar=${1:?JAR path required}
release=${2:?release identifier required}
[[ "$release" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid release identifier' >&2; exit 2; }
[[ -s "$source_jar" ]] || { echo 'JAR is missing or empty' >&2; exit 2; }
root=${FIELDWORK_ROOT:-/opt/field-work}
attempts=${HEALTH_ATTEMPTS:-60}
interval=${HEALTH_INTERVAL:-2}
mkdir -p "$root/app" "$root/releases"
exec 9>"$root/releases/deploy.lock"
flock -n 9 || { echo 'Another deployment is running' >&2; exit 1; }
current="$root/app/fieldwork.jar"
staged="$root/app/.fieldwork-$release.jar"
backup="$root/releases/before-$release.jar"
[[ ! -e "$backup" ]] || { echo 'Release identifier already used' >&2; exit 1; }
had_previous=false
if [[ -f "$current" ]]; then
  cp -pL "$current" "$backup"
  had_previous=true
fi
# Copy before stopping the service; no partial JAR is ever visible at the runtime path.
install -o root -g fieldwork -m 640 "$source_jar" "$staged"
rollback() {
  code=$?
  trap - ERR INT TERM
  set +e
  echo 'Deployment failed; restoring previous application JAR (database migrations are NOT rolled back).' >&2
  systemctl stop fieldwork
  if "$had_previous"; then
    cp -p "$backup" "$staged" && mv -f "$staged" "$current" && systemctl start fieldwork
  else
    rm -f "$current" "$staged"
  fi
  exit "${code:-1}"
}
trap rollback ERR
trap 'false' INT TERM
systemctl stop fieldwork
mv -f "$staged" "$current"
systemctl start fieldwork
healthy=false
for ((i=0; i<attempts; i++)); do
  if systemctl is-active --quiet fieldwork && \
      curl --fail --silent --show-error --connect-timeout 2 --max-time 3 http://127.0.0.1:8080/api/health \
      | python3 -c 'import json,sys; sys.exit(0 if json.load(sys.stdin).get("status") == "ok" else 1)'; then
    healthy=true
    break
  fi
  sleep "$interval"
done
"$healthy" || { echo 'Backend health check failed' >&2; false; }
printf '%s\n' "$release" > "$root/releases/current-release"
trap - ERR INT TERM
echo "Deployed release $release; local backend health passed."
