# 06 - Ranking Architecture

## Estado

Implementada una vista de ranking preliminar no vinculante y una capa de
analisis de politica provincial.

No se implementan:

- seleccion automatica;
- decision final;
- notificaciones;
- aprobacion de lista.

La aprobacion final corresponde al Equipo Tecnico.

## Alcance del ranking preliminar

El ranking preliminar se construye desde datos ya persistidos:

- postulante normalizado;
- admisibilidad preliminar;
- evaluacion tecnica;
- validacion tecnica del resultado;
- incidencias operativas abiertas.

Endpoint JSON:

- `GET /api/admin/preliminary-ranking`

Exportacion CSV:

- `GET /api/admin/preliminary-ranking.csv`

Exportaciones PDF:

- `GET /api/admin/preliminary-ranking.pdf`
- `GET /api/admin/proposal-summary.pdf`
- `GET /api/admin/selection-policy-analysis.pdf`

La vista administrativa permite seleccionar evaluaciones visibles y actualizar
masivamente su estado de validacion tecnica usando el endpoint existente de
validacion individual. Esta accion no cambia puntajes ni aplica cupos.

Tambien permite marcar una lista propuesta manual con estados operativos:

- `NOT_PROPOSED`
- `PROPOSED`
- `RESERVE`
- `REMOVED`

Estos estados pertenecen a `proposal_entries` y no equivalen a decision final.

## Analisis de politica provincial

La politica versionada vive en `config/fdf-2026-selection-policy.json`.

Endpoint JSON:

- `GET /api/admin/selection-policy-analysis`

Exportacion CSV:

- `GET /api/admin/selection-policy-analysis.csv`

El analisis aplica sobre el ranking preliminar ya filtrado:

- cupo de 4 personas por provincia;
- maximo 2 personas de un mismo municipio;
- maximo 2 personas de una misma institucion;
- clasificacion por rangos de puntaje definidos en el procedimiento;
- alertas de empate tecnico para revision del Equipo Tecnico.

El resultado agrega campos operativos como `policy_recommendation`,
`policy_recommendation_label`, `score_band`, `policy_alerts` y
`province_policy_position`.

La politica no cambia `proposal_entries`, no aprueba personas y no resuelve
desempates cualitativos automaticamente.

## Inclusion preliminar

Una postulacion queda marcada como incluida preliminarmente solo si:

- tiene `total_score`;
- la evaluacion tecnica esta `COMPLETED`;
- la validacion tecnica esta `VALIDATED_BY_TECHNICAL_TEAM`;
- la admisibilidad esta `READY_FOR_TECHNICAL_REVIEW`;
- no tiene incidencias operativas abiertas.

Si no cumple esos requisitos, se mantiene visible en la tabla con un motivo
operativo de no inclusion.

## Ordenamiento

El orden principal es `total_score` descendente.

Si dos postulaciones tienen el mismo puntaje, comparten la misma posicion
preliminar. El analisis provincial marca el empate como alerta porque los
criterios cualitativos de desempate requieren decision tecnica.

## Restricciones

- El ranking preliminar no modifica puntajes.
- El ranking preliminar no modifica admisibilidad.
- El ranking preliminar no cambia estados documentales ni incidencias.
- El ranking preliminar no aplica cupos de forma persistente.
- El analisis provincial calcula recomendaciones y alertas, pero no modifica
  estados ni aprueba la lista final.
- El ranking preliminar no genera decisiones finales.
- El ranking preliminar no sustituye la revision ni aprobacion del Equipo
  Tecnico.
- La validacion masiva desde ranking solo actualiza el estado de validacion
  tecnica del resultado; no aprueba la lista final.
- La lista propuesta es una herramienta de trabajo; no sustituye la aprobacion
  formal del Equipo Tecnico.
