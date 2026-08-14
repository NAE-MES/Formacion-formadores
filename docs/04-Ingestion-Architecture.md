# 04 - Ingestion Architecture

## Flujo convergente

```text
Google Forms / Sheets
        |
OFFLINE_JSON ---- RAW ---- NORMALIZACION ---- POSTULANTE UNICO
        |
OFFLINE_MANUAL
```

## Canales soportados

- `GOOGLE_FORM`
- `OFFLINE_JSON`
- `OFFLINE_MANUAL`

## Adaptadores

- Google Forms/Sheets: transforma una fila o respuesta en pares `FDF-xx`.
- Offline JSON: valida `schema = FDF-2026-OFFLINE-1` y procesa `respuestas`.
- Offline manual: recibe una captura controlada por codigo `FDF-xx` para casos sin JSON.

## Validacion

La validacion usa la configuracion versionable de la capa publica:

- codigo reconocido;
- tipo de campo;
- obligatoriedad;
- opciones permitidas;
- estructura del payload;
- campos desconocidos como incidencia, no descarte silencioso.

## Idempotencia y duplicados

- Reimportar el mismo origen no crea otra `Submission`.
- Reimportar a la misma persona desde otro canal puede crear `DuplicateReview`.
- No se fusionan automaticamente coincidencias debiles.

## Persistencia Sprint 2

La capa de ingestión puede producir un plan de persistencia para Google Sheets:

- `02_Postulantes`
- `03_Admisibilidad`
- `12_Log`
- `18_Submissions_RAW`
- `19_Candidate_Responses`
- `20_Documentos`
- `21_Normalization_Issues`
- `22_Duplicate_Review`

El RAW se conserva en una hoja tecnica separada y los logs no deben copiar contenido completo de documentos personales.

## Flujo Apps Script

Funciones disponibles:

- `FdF_previsualizarImportacionGoogleSprint2`: lee el spreadsheet activo, importa a memoria y muestra un resumen sin escribir hojas.
- `FdF_ejecutarImportacionGoogleSprint2`: lee el spreadsheet activo, importa a memoria, evalua admisibilidad preliminar y persiste las hojas operativas.

La configuracion publica se reconstruye desde `13_Formulario_Publico` para evitar divergencia con el instrumento operativo.
