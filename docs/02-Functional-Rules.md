# 02 - Functional Rules

## Decisiones establecidas

- Google Forms es la via principal.
- Existe una via alternativa completa por correo mediante formulario offline y adjuntos.
- Ambas vias tienen igual validez una vez registradas.
- La evaluacion no puede depender del canal de postulacion.
- INAENE fue eliminado de las opciones de `Tipo de institucion`.
- INAENE puede mantenerse donde aparezca oficialmente como actor de articulacion.
- La pregunta sobre representacion de provincia, municipio o institucion dentro de la cohorte regional fue eliminada.
- `FDF-22` es una pregunta de parrafo y no una carga de evidencia.
- Carta Aval es opcional operativamente desde la decision del Equipo Tecnico
  del 19/08/2026; su ausencia se traza, pero no bloquea el ciclo.
- Curriculum Vitae sigue siendo documento requerido.
- En la via offline, formulario y CV se reciben por correo; Carta Aval se
  recibe si aplica.
- El HTML offline puede generar JSON para procesamiento automatico.
- Los codigos `FDF-xx` no deben mostrarse al postulante como contenido visible.
- No se deben mostrar publicamente puntos, ponderaciones, atributos internos ni textos como `No puntua`.
- La aprobacion final de la lista corresponde al Equipo Tecnico.

## Reglas no implementadas en Sprint 1

- Motor completo de puntuacion.
- Ranking provincial.
- Aplicacion definitiva de cupos.
- Reglas de desempate.
- Reglas definitivas de subsanacion.
- Notificaciones.
- Decisiones automaticas del Equipo Tecnico.

## Regla de no reinterpretacion

Cuando una fuente sea ambigua o contradiga otra fuente, la implementacion debe registrar el caso en `docs/OPEN-ISSUES.md` y continuar solo con componentes que no dependan de esa decision.
