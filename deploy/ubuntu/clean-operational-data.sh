#!/usr/bin/env bash
set -euo pipefail

APP_ENV_FILE="${APP_ENV_FILE:-/etc/fdf-2026/api.env}"
BACKUP_BEFORE_CLEAN="${BACKUP_BEFORE_CLEAN:-true}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/fdf-2026/postgres}"

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Este script debe ejecutarse con root/sudo en el servidor." >&2
    exit 1
  fi
}

load_env() {
  if [ ! -f "$APP_ENV_FILE" ]; then
    echo "No existe el archivo de entorno: $APP_ENV_FILE" >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  . "$APP_ENV_FILE"
  set +a

  if [ -z "${DATABASE_URL:-}" ]; then
    echo "DATABASE_URL no esta definida en $APP_ENV_FILE" >&2
    exit 1
  fi
}

backup_database() {
  if [ "$BACKUP_BEFORE_CLEAN" != "true" ]; then
    echo "BACKUP_BEFORE_CLEAN=false: no se realizara salva previa."
    return
  fi

  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "pg_dump no esta instalado. No se puede hacer la salva previa." >&2
    exit 1
  fi

  install -d -m 0750 "$BACKUP_DIR"
  local stamp target
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  target="$BACKUP_DIR/fdf_2026_before_clean_${stamp}.dump"
  pg_dump --format=custom --no-owner --no-acl "$DATABASE_URL" > "$target"
  chmod 0640 "$target"
  echo "Salva previa creada: $target"
}

confirm_clean() {
  if [ "${CONFIRM_CLEAN_FDF_2026:-}" != "YES" ]; then
    cat >&2 <<'EOF'
Operacion destructiva detenida.

Este script elimina datos operativos de FdF 2026 y conserva usuarios/admin.
Para ejecutarlo realmente use:

  sudo CONFIRM_CLEAN_FDF_2026=YES deploy/ubuntu/clean-operational-data.sh

EOF
    exit 1
  fi
}

clean_database() {
  if ! command -v psql >/dev/null 2>&1; then
    echo "psql no esta instalado." >&2
    exit 1
  fi

  psql "$DATABASE_URL" <<'SQL'
begin;

truncate table
  admin_sessions,
  audit_events,
  evaluation_results,
  criterion_evaluations,
  eligibility_assessments,
  normalization_issues,
  documents,
  candidate_responses,
  submission_raws,
  submissions,
  candidates
restart identity cascade;

commit;
SQL

  echo "Datos operativos eliminados. La estructura y admin_users fueron conservados."
}

main() {
  need_root
  load_env
  confirm_clean
  backup_database
  clean_database
}

main "$@"
