# 06 - Ranking Architecture

## Estado

Implementada una vista de ranking preliminar no vinculante.

No se implementan:

- cupos;
- desempates funcionales;
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

La vista administrativa permite seleccionar evaluaciones visibles y actualizar
masivamente su estado de validacion tecnica usando el endpoint existente de
validacion individual. Esta accion no cambia puntajes ni aplica cupos.

Tambien permite marcar una lista propuesta manual con estados operativos:

- `NOT_PROPOSED`
- `PROPOSED`
- `RESERVE`
- `REMOVED`

Estos estados pertenecen a `proposal_entries` y no equivalen a decision final.

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

No se implementan reglas de desempate. Si dos postulaciones tienen el mismo
puntaje, comparten la misma posicion preliminar. El orden visual interno entre
puntajes iguales no representa prioridad funcional.

## Restricciones

- El ranking preliminar no modifica puntajes.
- El ranking preliminar no modifica admisibilidad.
- El ranking preliminar no cambia estados documentales ni incidencias.
- El ranking preliminar no aplica cupos.
- El ranking preliminar no genera decisiones finales.
- El ranking preliminar no sustituye la revision ni aprobacion del Equipo
  Tecnico.
- La validacion masiva desde ranking solo actualiza el estado de validacion
  tecnica del resultado; no aprueba la lista final.
- La lista propuesta es una herramienta de trabajo; no sustituye la aprobacion
  formal del Equipo Tecnico.
