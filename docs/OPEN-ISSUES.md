# Open Issues

## OI-001 - Puntuacion de genero pendiente de cierre

Fuentes: `README.md`, Anexo 1, Anexo 2.

Conflicto: existe referencia a discrepancia entre la puntuacion de `Hombre` en Anexo 1 y Anexo 2.

Impacto: motor de evaluacion de inclusion/genero. No afecta la ingestión Sprint 1.

Estado: pendiente de decision del Equipo Tecnico.

## OI-002 - Plazo exacto de subsanacion

Fuentes: documentos oficiales y configuracion operativa.

Conflicto: el plazo se describe como breve, pero no queda cerrado como parametro definitivo.

Impacto: admisibilidad y gestion documental Sprint 2.

Estado: pendiente de decision del Equipo Tecnico.

## OI-003 - Codigos FDF en HTML offline

Fuentes: regla funcional de no mostrar codigos al postulante y `docs/oficiales/formulario-postulacion-via-offline.html`.

Observacion: los codigos `FDF-xx` aparecen como atributos tecnicos `data-code` y `name`. No se observan como texto visible principal, pero pueden verse inspeccionando el HTML.

Impacto: no bloquea ingestión. Cualquier cambio al HTML offline esta fuera del alcance de Sprint 1.

Estado: pendiente de criterio del Equipo Tecnico/operacional si se requiere ocultamiento tecnico adicional.

## OI-004 - Errata visible en FDF-17

Fuentes: `13_Formulario_Publico` y formulario offline.

Observacion: el texto publico de FDF-17 contiene `carfo`.

Impacto: instrumento publico. No se corrige en Sprint 1 porque implicaria cambiar texto funcional visible.

Estado: pendiente de decision/correccion oficial.

## OI-005 - Terminologia final de estados de admisibilidad

Fuentes: roadmap tecnico, README/HOWTO y documentos oficiales.

Observacion: Sprint 2 usa estados operativos preliminares para no sustituir la decision del Equipo Tecnico ni cerrar reglas de subsanacion.

Impacto: antes de operar admisibilidad final debe aprobarse la nomenclatura definitiva y su efecto sobre evaluacion.

Estado: pendiente de decision del Equipo Tecnico.

## OI-006 - Google Form publicado y texto visible de FDF-17

Fuentes: Google Form publicado, `config/fdf-2026-public-schema.json` y decision
del 19/08/2026.

Observacion: operativamente `FDF-17` deja de bloquear en el backend. Si el
Google Form publicado mantiene la carga de carta aval como obligatoria o sigue
mostrando `(Campo obligatorio)`, las personas sin carta no podran enviar por la
via principal o veran un texto contradictorio.

Impacto: afecta la captura por Google Forms antes de llegar al API. No afecta
la ingesta backend ni la via offline cuando el payload llega sin carta.

Estado: pendiente de ajuste operativo del Google Form por el responsable del
instrumento, si se autoriza modificar esa configuracion visible.
