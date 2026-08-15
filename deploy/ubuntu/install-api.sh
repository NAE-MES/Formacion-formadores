#!/usr/bin/env bash
set -euo pipefail

APP_NAME="${APP_NAME:-fdf-api}"
APP_DIR="${APP_DIR:-/opt/fdf-2026}"
APP_USER="${APP_USER:-fdf}"
APP_PORT="${PORT:-8080}"
DB_NAME="${DB_NAME:-fdf_2026}"
DB_USER="${DB_USER:-fdf_user}"
SERVICE_NAME="${SERVICE_NAME:-fdf-api.service}"
CREATE_DB="${CREATE_DB:-false}"
INSTALL_PACKAGES="${INSTALL_PACKAGES:-false}"
REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Este script debe ejecutarse con root/sudo en el servidor." >&2
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Falta variable requerida: $name" >&2
    exit 1
  fi
}

ensure_packages() {
  if [ "$INSTALL_PACKAGES" != "true" ]; then
    echo "INSTALL_PACKAGES=false: no se instalaran paquetes del sistema."
    return
  fi

  apt-get update
  apt-get install -y ca-certificates curl build-essential postgresql-client rsync
}

ensure_user() {
  if id "$APP_USER" >/dev/null 2>&1; then
    echo "Usuario $APP_USER ya existe."
  else
    useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
  fi
}

ensure_app_dir() {
  if ! command -v rsync >/dev/null 2>&1; then
    echo "rsync no esta instalado. Instale rsync o ejecute con INSTALL_PACKAGES=true." >&2
    exit 1
  fi

  mkdir -p "$APP_DIR"
  rsync -a --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    "$REPO_DIR/" "$APP_DIR/"
  chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
}

ensure_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "node no esta instalado. Instale Node.js 20+ o ejecute con INSTALL_PACKAGES=true y prepare NodeSource/manualmente." >&2
    exit 1
  fi

  local version
  version="$(node -v | sed 's/^v//')"
  local min="20.0.0"
  if [ "$(printf '%s\n%s\n' "$min" "$version" | sort -V | head -n1)" != "$min" ]; then
    echo "Node.js >= 20 requerido. Detectado: $version" >&2
    exit 1
  fi
}

install_node_dependencies() {
  cd "$APP_DIR/backend"
  if [ -f package-lock.json ]; then
    sudo -u "$APP_USER" npm ci --omit=dev
  else
    sudo -u "$APP_USER" npm install --omit=dev
  fi
}

ensure_database() {
  if [ "$CREATE_DB" != "true" ]; then
    echo "CREATE_DB=false: no se crearan roles/bases PostgreSQL."
    return
  fi

  require_env DB_PASSWORD
  local escaped_password
  escaped_password="$(printf "%s" "$DB_PASSWORD" | sed "s/'/''/g")"

  sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='${DB_USER}'" | grep -q 1 ||
    sudo -u postgres psql -c "create role ${DB_USER} login password '${escaped_password}'"

  sudo -u postgres psql -tAc "select 1 from pg_database where datname='${DB_NAME}'" | grep -q 1 ||
    sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
}

apply_schema() {
  require_env DATABASE_URL
  psql "$DATABASE_URL" -f "$APP_DIR/backend/db/schema.sql"
}

write_env_file() {
  require_env DATABASE_URL
  require_env FDF_API_TOKEN
  require_env FDF_ADMIN_TOKEN

  install -m 0750 -o "$APP_USER" -g "$APP_USER" -d /etc/fdf-2026
  cat > /etc/fdf-2026/api.env <<EOF
PORT=${APP_PORT}
DATABASE_URL=${DATABASE_URL}
FDF_API_TOKEN=${FDF_API_TOKEN}
FDF_ADMIN_TOKEN=${FDF_ADMIN_TOKEN}
EOF
  chown "$APP_USER":"$APP_USER" /etc/fdf-2026/api.env
  chmod 0640 /etc/fdf-2026/api.env
}

write_systemd_unit() {
  cat > "/etc/systemd/system/${SERVICE_NAME}" <<EOF
[Unit]
Description=FdF 2026 API
After=network.target postgresql.service

[Service]
WorkingDirectory=${APP_DIR}/backend
EnvironmentFile=/etc/fdf-2026/api.env
ExecStart=$(command -v npm) start
Restart=always
RestartSec=5
User=${APP_USER}
Group=${APP_USER}

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  systemctl restart "$SERVICE_NAME"
}

main() {
  need_root
  require_env DATABASE_URL
  require_env FDF_API_TOKEN
  require_env FDF_ADMIN_TOKEN

  "$(dirname "${BASH_SOURCE[0]}")/check-server.sh" || {
    echo "La verificacion detecto fallos. Revise el reporte antes de instalar." >&2
    exit 1
  }

  ensure_packages
  ensure_user
  ensure_node
  ensure_database
  ensure_app_dir
  install_node_dependencies
  apply_schema
  write_env_file
  write_systemd_unit

  systemctl status "$SERVICE_NAME" --no-pager
  echo "Instalacion completada. Verifique /health a traves del proxy/dominio configurado."
}

main "$@"
