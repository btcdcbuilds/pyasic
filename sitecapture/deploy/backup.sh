#!/usr/bin/env bash
# Back up the SiteCapture database and files to ./backups/<timestamp>/.
# Run from sitecapture/deploy:  sudo ./backup.sh
# Copy the backups folder off the server (e.g. rsync to another machine);
# a backup on the same disk doesn't survive losing the VPS.
set -euo pipefail
cd "$(dirname "$0")"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="backups/$stamp"
mkdir -p "$out"

docker compose --env-file .env exec -T db pg_dump -U sitecapture -Fc sitecapture > "$out/db.dump"
docker compose --env-file .env run --rm --no-deps -v "$(pwd)/$out:/backup" --entrypoint \
  tar app -czf /backup/data.tar.gz -C /data .

echo "Backup written to $(pwd)/$out"
ls -lh "$out"
