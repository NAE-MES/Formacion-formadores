# 09 - Backend API Architecture

## Decision

El Google Form existente queda congelado. No se modifican preguntas,
opciones, textos, cargas, publicacion ni estructura publica.

La operacion se mueve progresivamente a un backend API con base de datos.

## Flujo objetivo

```text
Google Form existente
        |
Apps Script onFormSubmit
        |
POST /api/submissions/google-form
        |
Backend API
        |
PostgreSQL
        |
Frontend de gestion
```

La via offline se mantiene como ingesta JSON directa:

```text
HTML/PDF offline + JSON
        |
POST /api/submissions/offline-json
        |
Backend API
        |
PostgreSQL
```

## Restricciones

- No tocar el Google Form.
- No cambiar el PDF/HTML offline en esta fase.
- No implementar ranking, cupos ni decisiones finales.
- No guardar secretos en Git.
- No guardar datos personales reales en pruebas.

## Backend inicial

Ubicacion: `backend/`

Stack:

- Node.js 20+
- HTTP nativo de Node para minimizar dependencias
- PostgreSQL para produccion
- `pg` como driver de base de datos
- `node:test` para pruebas unitarias/API

Endpoints iniciales:

- `GET /health`
- `POST /api/submissions/google-form`
- `POST /api/submissions/offline-json`

Autenticacion:

- Bearer token mediante `FDF_API_TOKEN`.

## Apps Script bridge

Archivo: `apps-script/FdF_Api_Bridge.gs`

Funcion principal:

- `FdF_onFormSubmitToApi(e)`

Requiere Script Properties:

- `FDF_API_URL`
- `FDF_API_TOKEN`

Debe instalarse como trigger de envio de formulario. No modifica el Form.
