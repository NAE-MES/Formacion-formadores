# 03 - Data Model

## Modelo implementado en Sprint 1

El modelo converge tres canales de entrada hacia un postulante unico:

- `Candidate`
- `Submission`
- `SubmissionRaw`
- `CandidateResponse`
- `Document`
- `NormalizationIssue`
- `DuplicateReview`
- `AuditEvent`

## Identificadores

- `submission_id`: hash estable derivado de `source_channel`, `source_reference` y payload RAW canonicalizado.
- `candidate_id`: hash estable derivado de identidad normalizada fuerte, principalmente numero de identificacion cuando existe.
- `source_reference`: identificador del origen. Ejemplos:
  - Google: timestamp/row id/respuesta externa si esta disponible.
  - Offline JSON: hash del payload exportado.
  - Offline manual: referencia controlada del correo o registro operativo.

## Separacion de datos

- RAW: se conserva exactamente como fue recibido.
- Normalizado: valores transformados por codigo `FDF-xx`.
- Evaluacion: pendiente para Sprint 3.
- Decision final: pendiente para Sprint 7.
- Auditoria: eventos tecnicos sin copiar CV, Carta Aval ni datos personales completos.

## Preparacion para fases posteriores

El modelo reserva extension para:

- `CriterionEvaluation`
- `EvaluationResult`
- `RankingEntry`
- `FinalDecision`
- `Notification`

Estas entidades no se implementan funcionalmente en Sprint 1.

## Extension Sprint 2

Sprint 2 incorpora:

- `EligibilityAssessment`: evaluacion preliminar de completitud documental y declaraciones habilitantes configuradas.

Esta evaluacion usa el alcance `PRELIMINARY_OPERATIONAL_READINESS` y no representa una aprobacion final del Equipo Tecnico.
