#!/usr/bin/env bash
set -uo pipefail

APP_NAME="${APP_NAME:-fdf-api}"
APP_DIR="${APP_DIR:-/opt/fdf-2026}"
APP_USER="${APP_USER:-fdf}"
APP_PORT="${PORT:-8080}"
DB_NAME="${DB_NAME:-fdf_2026}"
DB_USER="${DB_USER:-fdf_user}"
SERVICE_NAME="${SERVICE_NAME:-fdf-api.service}"

ok=true

say() {
  printf '%s\n' "$*"
}

section() {
  printf '\n== %s ==\n' "$*"
}

pass() {
  printf '[OK] %s\n' "$*"
}

warn() {
  printf '[WARN] %s\n' "$*"
}

fail() {
  ok=false
  printf '[FAIL] %s\n' "$*"
}

version_ge() {
  # Returns success if $1 >= $2 using sort -V.
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]
}

section "Sistema"
if [ -r /etc/os-release ]; then
  . /etc/os-release
  say "OS: ${PRETTY_NAME:-unknown}"
  if [ "${VERSION_ID:-}" = "22.04" ]; then
    pass "Ubuntu 22.04 detectado"
  else
    warn "Version objetivo esperada: Ubuntu 22.04; detectado: ${VERSION_ID:-unknown}"
  fi
else
  warn "No se pudo leer /etc/os-release"
fi

section "Usuario y rutas"
if command -v rsync >/dev/null 2>&1; then
  pass "rsync disponible"
elif [ "${INSTALL_PACKAGES:-false}" = "true" ]; then
  warn "rsync no esta instalado; INSTALL_PACKAGES=true permitiria instalarlo"
else
  fail "rsync no esta instalado"
fi

if id "$APP_USER" >/dev/null 2>&1; then
  pass "Usuario $APP_USER existe"
else
  warn "Usuario $APP_USER no existe"
fi

if [ -d "$APP_DIR" ]; then
  pass "Directorio $APP_DIR existe"
  ls -ld "$APP_DIR"
else
  warn "Directorio $APP_DIR no existe"
fi

section "Node.js"
if command -v node >/dev/null 2>&1; then
  node_version="$(node -v | sed 's/^v//')"
  say "node: $(command -v node) ($node_version)"
  if version_ge "$node_version" "20.0.0"; then
    pass "Node.js >= 20"
  else
    fail "Node.js >= 20 requerido"
  fi
else
  fail "node no esta instalado"
fi

if command -v npm >/dev/null 2>&1; then
  pass "npm disponible: $(npm -v)"
else
  fail "npm no esta instalado"
fi

section "PostgreSQL"
if command -v psql >/dev/null 2>&1; then
  pass "psql disponible: $(psql --version)"
else
  warn "psql no esta instalado o no esta en PATH"
fi

if systemctl list-unit-files postgresql.service >/dev/null 2>&1; then
  if systemctl is-active --quiet postgresql; then
    pass "postgresql.service activo"
  else
    warn "postgresql.service existe pero no esta activo"
  fi
else
  warn "postgresql.service no detectado"
fi

if command -v sudo >/dev/null 2>&1 && id postgres >/dev/null 2>&1; then
  if sudo -n -u postgres psql -tAc "select 1 from pg_roles where rolname='${DB_USER}'" 2>/dev/null | grep -q 1; then
    pass "Rol PostgreSQL $DB_USER existe"
  else
    warn "Rol PostgreSQL $DB_USER no detectado o sin permisos para consultarlo"
  fi
  if sudo -n -u postgres psql -tAc "select 1 from pg_database where datname='${DB_NAME}'" 2>/dev/null | grep -q 1; then
    pass "Base PostgreSQL $DB_NAME existe"
  else
    warn "Base PostgreSQL $DB_NAME no detectada o sin permisos para consultarla"
  fi
else
  warn "No se puede consultar PostgreSQL con sudo sin password"
fi

section "Nginx / proxy"
if command -v nginx >/dev/null 2>&1; then
  pass "nginx disponible: $(nginx -v 2>&1)"
  if systemctl is-active --quiet nginx; then
    pass "nginx activo"
  else
    warn "nginx instalado pero no activo"
  fi
else
  warn "nginx no instalado; puede existir otro proxy"
fi

section "Puerto"
if command -v ss >/dev/null 2>&1; then
  if ss -ltn "( sport = :$APP_PORT )" | tail -n +2 | grep -q .; then
    warn "Puerto $APP_PORT ya esta en uso"
    ss -ltnp "( sport = :$APP_PORT )" || true
  else
    pass "Puerto $APP_PORT libre"
  fi
else
  warn "ss no disponible para revisar puertos"
fi

section "systemd"
if systemctl list-unit-files "$SERVICE_NAME" >/dev/null 2>&1; then
  warn "Servicio $SERVICE_NAME ya existe"
  systemctl status "$SERVICE_NAME" --no-pager || true
else
  pass "Servicio $SERVICE_NAME no existe"
fi

section "Variables esperadas"
if [ -n "${DATABASE_URL:-}" ]; then
  pass "DATABASE_URL definida"
else
  warn "DATABASE_URL no definida en este shell"
fi

if [ -n "${FDF_API_TOKEN:-}" ]; then
  pass "FDF_API_TOKEN definida"
else
  warn "FDF_API_TOKEN no definida en este shell"
fi

if [ -n "${FDF_ADMIN_TOKEN:-}" ]; then
  pass "FDF_ADMIN_TOKEN definida"
else
  warn "FDF_ADMIN_TOKEN no definida en este shell"
fi

section "Resultado"
if [ "$ok" = true ]; then
  pass "Verificacion completada sin fallos bloqueantes"
  exit 0
fi

fail "Verificacion encontro fallos bloqueantes"
exit 1
