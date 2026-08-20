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

## Evaluacion tecnica manual

Configuracion: `config/fdf-2026-evaluation-baseline.json`.

Entidades persistidas:

- `criterion_evaluations`
- `evaluation_results`

La version actual solo captura revision humana por criterio. No calcula
puntuacion desde respuestas, no genera ranking, no aplica cupos y no registra
decision final. Los porcentajes se conservan como metadatos oficiales del
catalogo para orientar al revisor interno, no se muestran al postulante.

Criterios configurados:

- `INSTITUTIONAL_LINK`
- `TRAINING_AND_TECHNICAL_CAPACITY`
- `TERRITORIAL_REPLICATION_POTENTIAL`
- `INCLUSION_GENDER_SUSTAINABILITY`

Estados operativos de evaluacion:

- `NOT_STARTED`
- `IN_PROGRESS`
- `COMPLETED`
- `NEEDS_REVIEW`

Cada actualizacion de criterio registra `CRITERION_EVALUATION_UPDATED`. Cada
refresco del resumen operativo registra `EVALUATION_RESULT_UPDATED`.

Restriccion: el resumen operativo solo indica avance de captura. No representa
seleccion, orden de merito ni recomendacion final.

## Admisibilidad preliminar operativa

Configuracion: `config/fdf-2026-eligibility-baseline.json`.

Entidad persistida: `eligibility_assessments`.

Estados operativos:

- `READY_FOR_TECHNICAL_REVIEW`
- `BLOCKED_BY_MISSING_REQUIREMENTS`
- `REQUIRES_MANUAL_REVIEW`

La evaluacion preliminar usa solo datos normalizados y documentos asociados.
No lee el canal de origen para decidir el resultado, salvo trazabilidad.

Desde la decision del 19/08/2026, la ausencia de Carta Aval no bloquea la
admisibilidad preliminar. Queda registrada como chequeo informativo y como
estado documental no aportado/no recibido segun corresponda. Curriculum Vitae
continua como requisito documental bloqueante.

Checks soportados:

- `FIELD_EQUALS`
- `FIELD_NOT_EQUALS`
- `DOCUMENT_PRESENT`

Cada calculo registra `ELIGIBILITY_ASSESSED`. Cada ajuste administrativo
registra `ELIGIBILITY_REVIEW_UPDATED`.

Restriccion: estos estados no equivalen a aprobacion, seleccion ni exclusion
final por el Equipo Tecnico.
