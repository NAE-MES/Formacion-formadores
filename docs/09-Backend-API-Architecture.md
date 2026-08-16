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
- `GET /admin`
- `GET /api/admin/summary`
- `GET /api/admin/submissions`
- `GET /api/admin/submissions/:submission_id`
- `PATCH /api/admin/documents/:document_id/status`
- `POST /api/admin/documents/:document_id/open`
- `PATCH /api/admin/issues/:normalization_issue_id/review`

Autenticacion:

- Bearer token mediante `FDF_API_TOKEN`.
- Usuario y contrasena administrativos mediante `FDF_ADMIN_USERNAME` y
  `FDF_ADMIN_PASSWORD`.
- Sesion administrativa por cookie `HttpOnly`, `Secure`, `SameSite=Lax`.
- Bearer token administrativo separado mediante `FDF_ADMIN_TOKEN` solo como
  via tecnica de emergencia.
- Los endpoints de ingesta fallan cerrado si `FDF_API_TOKEN` no esta
  configurado en el backend.
- Los endpoints administrativos fallan cerrado si `FDF_ADMIN_TOKEN` no esta
  configurado en el backend.
- El token no debe guardarse en Git ni en celdas visibles del Spreadsheet.
- En Google Apps Script debe almacenarse como Script Property.
- La publicacion externa debe hacerse por HTTPS a traves del proxy
  institucional.
- El firewall del servidor interno debe permitir el puerto de la API solo
  desde el proxy autorizado.

## Apps Script bridge

Archivo: `apps-script/FdF_Api_Bridge.gs`

Funcion principal:

- `FdF_onFormSubmitToApi(e)`

Requiere Script Properties:

- `FDF_API_URL`
- `FDF_API_TOKEN`

Debe instalarse como trigger de envio de formulario. No modifica el Form.

## Puesta en produccion del Form publicado

La conexion con el Form publicado se hace sin modificar la encuesta:

1. Mantener intactos preguntas, opciones, textos y cargas del Google Form.
2. Configurar `FDF_API_URL` y `FDF_API_TOKEN` en Script Properties.
3. Instalar un trigger de tipo `On form submit` hacia
   `FdF_onFormSubmitToApi`.
4. Ejecutar una prueba con una respuesta sintetica o controlada.
5. Revisar `23_API_Bridge_Log` y el backend para confirmar ingestion.

Si una fila ya recibida necesita reenviarse por una correccion tecnica del
bridge, se puede usar `FdF_reenviarFilaActivaAApi` o
`FdF_reenviarUltimaRespuestaAApi`. El backend reprocesa la misma combinacion
`source_channel + source_reference`, conserva un nuevo RAW y actualiza la
normalizacion sin crear otra postulacion.

## Panel administrativo inicial

Ruta: `/admin`

Alcance:

- resumen de conteos;
- listado de postulaciones recibidas;
- busqueda y filtro por estado de normalizacion;
- detalle de postulante, respuestas normalizadas, documentos asociados e
  incidencias.
- revision operativa de estado de documentos;
- apertura de referencias documentales desde el repositorio original;
- seguimiento operativo de incidencias de normalizacion.

Restricciones:

- no expone el RAW completo en la UI inicial;
- no descarga ni almacena fisicamente documentos de Drive en el servidor;
- no implementa ranking, cupos ni decision final;
- no permite modificar respuestas ni documentos en esta fase;
- no convierte estados operativos en decisiones de admisibilidad,
  seleccion o ranking;
- requiere sesion administrativa activa para leer o modificar datos.

Estados operativos de documentos:

- `RECEIVED`
- `VALIDATED`
- `REJECTED`
- `NEEDS_REVIEW`

Estados operativos de incidencias:

- `OPEN`
- `ACKNOWLEDGED`
- `RESOLVED`
- `NEEDS_SOURCE_REVIEW`

Cada cambio administrativo registra un evento en `audit_events` sin guardar
CV, carta aval ni datos personales completos dentro del log tecnico.
La accion de abrir una referencia documental tambien queda auditada como
`DOCUMENT_OPENED`.
