# 10 - Ubuntu 22.04 Deployment

## Paquetes base

Servidor objetivo: Ubuntu 22.04.

Requisitos:

- Node.js 20 o superior
- PostgreSQL 14 o superior
- Nginx o proxy equivalente
- systemd

## Servidor compartido

Como el servidor puede alojar otras aplicaciones, el despliegue debe ser
conservador:

1.  Verificar primero.
2.  No instalar paquetes si ya existen.
3.  No crear base/usuario PostgreSQL si ya hay una politica definida.
4.  No tocar configuraciones Nginx existentes automaticamente.

Scripts disponibles:

```bash
deploy/ubuntu/check-server.sh
deploy/ubuntu/install-api.sh
deploy/ubuntu/clean-operational-data.sh
deploy/ubuntu/install-db-backups.sh
```

`check-server.sh` no modifica el servidor.

`install-api.sh` solo debe ejecutarse despues de revisar la salida del
check.

`clean-operational-data.sh` elimina datos operativos de prueba, pero
conserva la estructura de la base y los usuarios administrativos
registrados en `admin_users`.

`install-db-backups.sh` instala una salva diaria de PostgreSQL con
systemd timer y guarda los respaldos fuera del proyecto.

Antes de ejecutar en el servidor:

```bash
bash -n deploy/ubuntu/check-server.sh
bash -n deploy/ubuntu/install-api.sh
bash -n deploy/ubuntu/clean-operational-data.sh
bash -n deploy/ubuntu/install-db-backups.sh
```

## Variables de entorno

```text
PORT=8080
DATABASE_URL=postgres://fdf_user:CHANGE_ME@127.0.0.1:5432/fdf_2026
FDF_API_TOKEN=CHANGE_ME_LONG_RANDOM_TOKEN
APP_DIR=/opt/fdf-2026
APP_USER=fdf
SERVICE_NAME=fdf-api.service
```

No guardar estos valores reales en Git.

## Base de datos

Crear base y usuario segun politica del servidor. Luego ejecutar:

```bash
psql "$DATABASE_URL" -f backend/db/schema.sql
```

Si se desea que el script intente crear usuario/base:

```bash
CREATE_DB=true DB_PASSWORD='CAMBIAR' deploy/ubuntu/install-api.sh
```

En servidor compartido se recomienda mantener `CREATE_DB=false` y usar
credenciales creadas por el administrador del servidor.

## Instalacion

```bash
deploy/ubuntu/check-server.sh
```

Si el diagnostico es correcto:

```bash
sudo DATABASE_URL="$DATABASE_URL" \
  FDF_API_TOKEN="$FDF_API_TOKEN" \
  APP_DIR=/opt/fdf-2026 \
  APP_USER=fdf \
  PORT=8080 \
  deploy/ubuntu/install-api.sh
```

Por defecto:

- no instala paquetes del sistema (`INSTALL_PACKAGES=false`);
- no crea base ni usuario PostgreSQL (`CREATE_DB=false`);
- copia el repo a `APP_DIR`;
- ejecuta `npm ci --omit=dev`;
- aplica `backend/db/schema.sql`;
- crea/actualiza el servicio systemd.

## Ejecucion manual sin instalar servicio

```bash
cd backend
npm ci
npm test
npm run check
PORT=8080 DATABASE_URL="$DATABASE_URL" FDF_API_TOKEN="$FDF_API_TOKEN" npm start
```

## systemd

Ejemplo de unidad:

```ini
[Unit]
Description=FdF 2026 API
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/fdf-2026/backend
Environment=PORT=8080
Environment=DATABASE_URL=postgres://fdf_user:CHANGE_ME@127.0.0.1:5432/fdf_2026
Environment=FDF_API_TOKEN=CHANGE_ME_LONG_RANDOM_TOKEN
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
User=fdf

[Install]
WantedBy=multi-user.target
```

## Nginx

Configurar TLS y proxy hacia `127.0.0.1:8080`. El endpoint publico que usara Apps Script sera:

```text
https://TU_DOMINIO/api/submissions/google-form
```

## Verificacion

```bash
curl https://TU_DOMINIO/health
```

Para pruebas de ingesta, usar datos sinteticos.

## Limpieza de datos de prueba

Para limpiar datos operativos antes de comenzar una etapa real de
recepcion, ejecutar en el servidor:

```bash
cd /home/ituser/formacion-formadores
sudo CONFIRM_CLEAN_FDF_2026=YES deploy/ubuntu/clean-operational-data.sh
```

Por defecto el script crea una salva previa en:

```text
/var/backups/fdf-2026/postgres
```

Tablas limpiadas:

- `admin_sessions`
- `audit_events`
- `evaluation_results`
- `criterion_evaluations`
- `eligibility_assessments`
- `normalization_issues`
- `documents`
- `candidate_responses`
- `submission_raws`
- `submissions`
- `candidates`

No se limpia `admin_users`.

## Salvas diarias de base de datos

Para configurar salvas diarias:

```bash
cd /home/ituser/formacion-formadores
sudo deploy/ubuntu/install-db-backups.sh
```

Configuracion por defecto:

- directorio: `/var/backups/fdf-2026/postgres`
- hora: 02:15 del servidor
- retencion: 30 dias
- timer: `fdf-db-backup.timer`
- servicio: `fdf-db-backup.service`

Comandos utiles:

```bash
systemctl list-timers fdf-db-backup.timer
sudo systemctl start fdf-db-backup.service
sudo journalctl -u fdf-db-backup.service -n 50 --no-pager
sudo ls -lh /var/backups/fdf-2026/postgres
```
