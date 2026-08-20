# 05 - Evaluation Architecture

## Estado

Motor automatico de puntuacion tecnica implementado para los 4 criterios del
Anexo 1. No se implementa ranking, cupos ni decision final.

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

## Evaluacion tecnica automatica

Configuracion: `config/fdf-2026-evaluation-baseline.json`.

El motor calcula exclusivamente los criterios y atributos definidos en
`docs/oficiales/anexo-1-matriz-calificacion.pdf`:

- `INSTITUTIONAL_LINK`
- `TRAINING_AND_TECHNICAL_CAPACITY`
- `TERRITORIAL_REPLICATION_POTENTIAL`
- `INCLUSION_GENDER_SUSTAINABILITY`

Cada criterio se calcula desde sus atributos internos con respuestas cerradas
`FDF-xx`. Los textos cualitativos (`FDF-22`, `FDF-24`, `FDF-31`, `FDF-38`)
quedan como evidencia de revision humana, pero no se puntuan automaticamente.

El puntaje de cada criterio se guarda en escala 0-100. El `total_score` se
calcula como promedio ponderado por el peso oficial del criterio.

La regla de genero queda cerrada por decision del 2026-08-20: `Mujer = 10`,
`Hombre = 5`, `No aporta informacion = 0`, tomando como fuente aplicable el
Anexo 1.

Si una respuesta no existe o no coincide con una opcion puntuable del Anexo 1,
el criterio queda `NEEDS_REVIEW` y no se calcula `total_score` hasta completar
la revision.

La puntuacion automatica se ejecuta tras cada ingesta valida y puede
recalcularse desde la API administrativa con:

- `POST /api/admin/submissions/:submission_id/evaluation/auto-score`
- `PATCH /api/admin/evaluation-results/:evaluation_result_id/validation`

Restriccion: el resultado automatico es puntaje tecnico operativo. No
representa ranking, seleccion, cupo ni decision final.

## Validacion tecnica de la evaluacion automatica

La validacion tecnica es una capa de revision sobre `evaluation_results`. No
modifica por si misma los puntajes ni representa aprobacion final de la lista.

Estados de validacion soportados:

- `PENDING_TECHNICAL_VALIDATION`
- `IN_TECHNICAL_REVIEW`
- `VALIDATED_BY_TECHNICAL_TEAM`
- `REQUIRES_SCORE_ADJUSTMENT`

Cada recalculo automatico o ajuste manual de criterios deja la validacion en
`PENDING_TECHNICAL_VALIDATION`, porque cambia la base que debe revisar el
Equipo Tecnico.

La actualizacion de validacion registra
`EVALUATION_TECHNICAL_VALIDATION_UPDATED` con actor, fecha, estado previo,
estado nuevo y motivo.

## Evaluacion tecnica manual

Configuracion: `config/fdf-2026-evaluation-baseline.json`.

Entidades persistidas:

- `criterion_evaluations`
- `evaluation_results`

La revision humana por criterio se mantiene. Un revisor puede ajustar estado,
puntaje, sintesis y nota interna de un criterio cuando corresponda. Cada ajuste
recalcula el resumen operativo.

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

Restriccion: el resumen operativo y el `total_score` no representan seleccion,
orden de merito ni recomendacion final.

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
