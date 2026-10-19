#!/usr/bin/env bash
# Install or update SiteCapture on an Ubuntu/Debian VPS.
# Run from sitecapture/deploy:  sudo ./install.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run with sudo." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker (official convenience script from get.docker.com)..."
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
fi
docker compose version >/dev/null

if [ ! -f .env ]; then
  cp .env.example .env
  read -rp "Domain for SiteCapture (DNS A record must point here): " domain
  read -rp "Admin email: " admin_email
  while :; do
    read -rsp "Admin password (10+ characters): " admin_pw; echo
    [ "${#admin_pw}" -ge 10 ] && break
    echo "Too short."
  done
  db_pw="$(openssl rand -hex 24)"
  sed -i \
    -e "s|^SITECAPTURE_DOMAIN=.*|SITECAPTURE_DOMAIN=${domain}|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${db_pw}|" \
    -e "s|^SITECAPTURE_ADMIN_EMAIL=.*|SITECAPTURE_ADMIN_EMAIL=${admin_email}|" \
    .env
  # Password may contain sed-special characters, so write it separately.
  grep -v '^SITECAPTURE_ADMIN_PASSWORD=' .env > .env.tmp
  printf 'SITECAPTURE_ADMIN_PASSWORD=%s\n' "$admin_pw" >> .env.tmp
  mv .env.tmp .env
  chmod 600 .env
  echo "Wrote .env. Add API keys to it later with: sudo nano $(pwd)/.env"
fi

docker compose --env-file .env up -d --build
echo
echo "Started. Open https://$(grep '^SITECAPTURE_DOMAIN=' .env | cut -d= -f2) once DNS has propagated."
echo "Logs: sudo docker compose -f $(pwd)/docker-compose.yml logs -f app"
