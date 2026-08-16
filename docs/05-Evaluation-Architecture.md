# 05 - Evaluation Architecture

## Estado

Motor completo de puntuacion pendiente. No se implementa ranking, cupos ni
decision final.

Existe una capa preliminar de admisibilidad operativa para verificar
requisitos bloqueantes y casos que requieren revision manual antes de la
evaluacion tecnica.

## Restricciones

- No calcular criterios no aprobados.
- No resolver contradicciones.
- No convertir campos ambiguos en reglas definitivas.
- Mantener resultados de evaluacion separados del RAW y del dato normalizado.

## Preparacion tecnica

La ingestión deja respuestas normalizadas por `FDF-xx`, lo que permite agregar posteriormente evaluaciones por criterio sin redisenar los canales de entrada.

## Admisibilidad preliminar operativa

Configuracion: `config/fdf-2026-eligibility-baseline.json`.

Entidad persistida: `eligibility_assessments`.

Estados operativos:

- `READY_FOR_TECHNICAL_REVIEW`
- `BLOCKED_BY_MISSING_REQUIREMENTS`
- `REQUIRES_MANUAL_REVIEW`

La evaluacion preliminar usa solo datos normalizados y documentos asociados.
No lee el canal de origen para decidir el resultado, salvo trazabilidad.

Checks soportados:

- `FIELD_EQUALS`
- `FIELD_NOT_EQUALS`
- `DOCUMENT_PRESENT`

Cada calculo registra `ELIGIBILITY_ASSESSED`. Cada ajuste administrativo
registra `ELIGIBILITY_REVIEW_UPDATED`.

Restriccion: estos estados no equivalen a aprobacion, seleccion ni exclusion
final por el Equipo Tecnico.
