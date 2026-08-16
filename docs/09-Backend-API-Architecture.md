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

La misma via puede operarse desde el panel administrativo:

```text
Admin UI
        |
POST /api/admin/submissions/offline-json
        |
Mismo importador OFFLINE_JSON
        |
PostgreSQL
```

Para casos recibidos por correo sin JSON exportado:

```text
Admin UI
        |
POST /api/admin/submissions/offline-manual
        |
Importador OFFLINE_MANUAL
        |
Mismo modelo normalizado
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
- `POST /api/admin/submissions/offline-json`
- `POST /api/admin/submissions/offline-manual`
- `POST /api/admin/submissions/:submission_id/eligibility/recalculate`
- `PATCH /api/admin/eligibility/:eligibility_assessment_id/review`
- `PATCH /api/admin/documents/:document_id/status`
- `POST /api/admin/documents/:document_id/open`
- `PATCH /api/admin/issues/:normalization_issue_id/review`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:username`

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

Funciones operativas:

- `FdF_verificarApiBridgeConfig`
- `FdF_probarConexionApi`
- `FdF_instalarTriggerApiBridge`
- `FdF_reenviarUltimaRespuestaAApi`
- `FdF_reenviarFilaActivaAApi`
- `FdF_reenviarErroresApiBridge`

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

`FdF_reenviarErroresApiBridge` permite reintentar errores registrados en
`23_API_Bridge_Log` cuando la referencia corresponde a una fila de Google
Sheets. El puente usa `LockService` para evitar ejecuciones simultaneas del
trigger sobre el mismo proyecto.

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
- admisibilidad preliminar operativa calculada desde respuestas normalizadas
  y documentos asociados.
- carga administrativa de JSON offline con referencias de Carta Aval y CV
  recibidos por correo.
- registro manual controlado para postulaciones offline recibidas sin JSON.

Restricciones:

- no expone el RAW completo en la UI inicial;
- no descarga ni almacena fisicamente documentos de Drive en el servidor;
- no implementa ranking, cupos ni decision final;
- no permite modificar respuestas ni documentos en esta fase;
- no convierte estados operativos en decisiones de admisibilidad,
  seleccion o ranking;
- requiere sesion administrativa activa para leer o modificar datos.

Roles administrativos:

- `ADMIN`: gestiona usuarios y puede ejecutar todas las acciones operativas.
- `REVIEWER`: revisa documentos, incidencias y admisibilidad preliminar.
- `INTAKE`: registra entradas offline JSON/manual y consulta expedientes.
- `VIEWER`: consulta expedientes y abre referencias documentales auditadas.

Los endpoints de escritura validan rol en el backend; la UI solo oculta o
deshabilita controles como ayuda operativa.

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

Estados operativos de admisibilidad preliminar:

- `READY_FOR_TECHNICAL_REVIEW`
- `BLOCKED_BY_MISSING_REQUIREMENTS`
- `REQUIRES_MANUAL_REVIEW`

Cada cambio administrativo registra un evento en `audit_events` sin guardar
CV, carta aval ni datos personales completos dentro del log tecnico.
La accion de abrir una referencia documental tambien queda auditada como
`DOCUMENT_OPENED`.
El recalculo de admisibilidad registra `ELIGIBILITY_ASSESSED`; la revision
manual registra `ELIGIBILITY_REVIEW_UPDATED`.

## Ingesta JSON offline desde admin

El cuerpo aceptado por el endpoint administrativo es:

```json
{
  "sourceReference": "correo-offline-001",
  "payload": {
    "schema": "FDF-2026-OFFLINE-1",
    "exportedAt": "2026-08-16T10:00:00.000Z",
    "respuestas": {
      "FDF-01": "..."
    }
  },
  "documents": [
    {
      "document_type": "CARTA_AVAL",
      "original_name": "carta.pdf",
      "storage_reference": "drive://referencia-o-ruta",
      "status": "RECEIVED"
    },
    {
      "document_type": "CURRICULUM_VITAE",
      "original_name": "cv.pdf",
      "storage_reference": "drive://referencia-o-ruta",
      "status": "RECEIVED"
    }
  ]
}
```

El `payload` se conserva como RAW. Las referencias documentales se guardan en
`documents`; no se copian archivos al servidor en esta fase.

Los JSON rechazados por version o estructura tambien generan una `submission`
tecnica con `normalization_status = REJECTED` para poder conservar RAW e
incidencias de validacion en PostgreSQL.

## Registro offline manual

El registro manual se usa solo cuando el correo incluye formulario offline/PDF
y adjuntos, pero no incluye JSON exportado.

El cuerpo aceptado por el endpoint administrativo es:

```json
{
  "sourceReference": "correo-manual-001",
  "registrationNote": "Formulario recibido por correo sin JSON",
  "responses": {
    "FDF-01": "..."
  },
  "documents": [
    {
      "document_type": "CARTA_AVAL",
      "original_name": "carta.pdf",
      "storage_reference": "drive://referencia-o-ruta",
      "status": "RECEIVED"
    },
    {
      "document_type": "CURRICULUM_VITAE",
      "original_name": "cv.pdf",
      "storage_reference": "drive://referencia-o-ruta",
      "status": "RECEIVED"
    }
  ]
}
```

La captura manual se valida con la misma capa publica y produce las mismas
entidades: `Candidate`, `Submission`, `SubmissionRaw`, `CandidateResponse`,
`Document`, `NormalizationIssue`, `DuplicateReview` y auditoria. El canal
queda como `OFFLINE_MANUAL` solo para trazabilidad.
