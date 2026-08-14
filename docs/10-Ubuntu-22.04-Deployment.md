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
```

`check-server.sh` no modifica el servidor.

`install-api.sh` solo debe ejecutarse despues de revisar la salida del
check.

Antes de ejecutar en el servidor:

```bash
bash -n deploy/ubuntu/check-server.sh
bash -n deploy/ubuntu/install-api.sh
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
