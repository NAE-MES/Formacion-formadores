# 10 - Ubuntu 22.04 Deployment

## Paquetes base

Servidor objetivo: Ubuntu 22.04.

Requisitos:

- Node.js 20 o superior
- PostgreSQL 14 o superior
- Nginx o proxy equivalente
- systemd

## Variables de entorno

```text
PORT=8080
DATABASE_URL=postgres://fdf_user:CHANGE_ME@127.0.0.1:5432/fdf_2026
FDF_API_TOKEN=CHANGE_ME_LONG_RANDOM_TOKEN
```

No guardar estos valores reales en Git.

## Base de datos

Crear base y usuario segun politica del servidor. Luego ejecutar:

```bash
psql "$DATABASE_URL" -f backend/db/schema.sql
```

## Instalacion

```bash
cd backend
npm install
npm test
npm run check
```

## Ejecucion manual

```bash
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
