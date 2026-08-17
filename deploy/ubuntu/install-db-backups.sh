#!/usr/bin/env bash
set -euo pipefail

APP_ENV_FILE="${APP_ENV_FILE:-/etc/fdf-2026/api.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/fdf-2026/postgres}"
BACKUP_USER="${BACKUP_USER:-fdf}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMER_NAME="${TIMER_NAME:-fdf-db-backup.timer}"
SERVICE_NAME="${SERVICE_NAME:-fdf-db-backup.service}"
SCRIPT_PATH="${SCRIPT_PATH:-/usr/local/sbin/fdf-db-backup.sh}"

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Este script debe ejecutarse con root/sudo en el servidor." >&2
    exit 1
  fi
}

validate_inputs() {
  if [ ! -f "$APP_ENV_FILE" ]; then
    echo "No existe el archivo de entorno: $APP_ENV_FILE" >&2
    exit 1
  fi

  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "pg_dump no esta instalado. Instale postgresql-client antes de continuar." >&2
    exit 1
  fi

  if ! id "$BACKUP_USER" >/dev/null 2>&1; then
    echo "No existe el usuario de salvas: $BACKUP_USER" >&2
    exit 1
  fi
}

install_backup_script() {
  install -d -m 0750 -o "$BACKUP_USER" -g "$BACKUP_USER" "$BACKUP_DIR"

  cat > "$SCRIPT_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail

APP_ENV_FILE="${APP_ENV_FILE}"
BACKUP_DIR="${BACKUP_DIR}"
RETENTION_DAYS="${RETENTION_DAYS}"

if [ ! -f "\$APP_ENV_FILE" ]; then
  echo "No existe el archivo de entorno: \$APP_ENV_FILE" >&2
  exit 1
fi

set -a
. "\$APP_ENV_FILE"
set +a

if [ -z "\${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL no esta definida en \$APP_ENV_FILE" >&2
  exit 1
fi

install -d -m 0750 "\$BACKUP_DIR"

stamp="\$(date -u +%Y%m%dT%H%M%SZ)"
target="\$BACKUP_DIR/fdf_2026_\${stamp}.dump"
latest="\$BACKUP_DIR/latest.dump"

tmp="\$(mktemp "\$BACKUP_DIR/.fdf_2026_\${stamp}.XXXXXX")"
cleanup() {
  rm -f "\$tmp"
}
trap cleanup EXIT

pg_dump --format=custom --no-owner --no-acl "\$DATABASE_URL" > "\$tmp"
chmod 0640 "\$tmp"
mv "\$tmp" "\$target"
ln -sfn "\$(basename "\$target")" "\$latest"

find "\$BACKUP_DIR" -type f -name 'fdf_2026_*.dump' -mtime +"$RETENTION_DAYS" -delete

echo "Salva creada: \$target"
EOF

  chown root:"$BACKUP_USER" "$SCRIPT_PATH"
  chmod 0750 "$SCRIPT_PATH"
}

install_systemd_units() {
  cat > "/etc/systemd/system/${SERVICE_NAME}" <<EOF
[Unit]
Description=FdF 2026 PostgreSQL daily backup
After=network.target postgresql.service

[Service]
Type=oneshot
User=${BACKUP_USER}
Group=${BACKUP_USER}
ExecStart=${SCRIPT_PATH}
EOF

  cat > "/etc/systemd/system/${TIMER_NAME}" <<EOF
[Unit]
Description=FdF 2026 PostgreSQL daily backup timer

[Timer]
OnCalendar=*-*-* 02:15:00
Persistent=true
RandomizedDelaySec=15m
Unit=${SERVICE_NAME}

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable --now "$TIMER_NAME"
}

main() {
  need_root
  validate_inputs
  install_backup_script
  install_systemd_units
  systemctl list-timers "$TIMER_NAME" --no-pager
  echo "Salvas configuradas en $BACKUP_DIR con retencion de $RETENTION_DAYS dias."
}

main "$@"
