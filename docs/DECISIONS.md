# Decisions

## 2026-08-13 - Mantener stack Apps Script / Google Sheets

Decision: implementar Sprint 1 como logica JavaScript compatible con Apps Script, con pruebas locales Node para funciones puras.

Justificacion: el repositorio existente no contiene backend ni aplicacion separada; Google Workspace es la arquitectura ya adoptada.

Impacto: no se cambia el runtime productivo. Las pruebas locales son herramienta de desarrollo.

## 2026-08-13 - Configuracion versionable derivada de la capa publica

Decision: crear configuracion JSON versionable a partir de `13_Formulario_Publico`, sin modificar textos, opciones ni obligatoriedad.

Justificacion: Sprint 1 necesita validar canales sin acoplar el dominio a encabezados arbitrarios de Google Sheets.

Impacto: los importadores usan codigos `FDF-xx` y mapeo de columnas configurable.

## 2026-08-13 - Admisibilidad preliminar no final

Decision: implementar Sprint 2 como evaluacion preliminar de completitud documental y declaraciones habilitantes, con estado `READY_FOR_TECHNICAL_REVIEW`, `BLOCKED_BY_MISSING_REQUIREMENTS` o `REQUIRES_MANUAL_REVIEW`.

Justificacion: las reglas de subsanacion, revision cualitativa y aprobacion final no deben inventarse ni automatizarse sin decision oficial.

Impacto: la implementacion prepara admisibilidad operativa y trazable, pero no emite una decision final `ADMISIBLE`/`NO_ADMISIBLE`.

## 2026-08-14 - Google Form congelado y backend API como destino operativo

Decision: no modificar el Google Form existente. La respuesta del formulario se enviara al backend API mediante un trigger Apps Script `onFormSubmit`.

Justificacion: el formulario ya esta publicado/en uso y no debe alterarse. El backend permite trazabilidad, persistencia en base de datos y frontend de gestion sin depender del Google Sheet como sistema operativo.

Impacto: Google Sheets queda como origen tecnico del evento/respaldo. La ingesta operativa sera `POST /api/submissions/google-form`. La variante offline conserva `POST /api/submissions/offline-json`.

## 2026-08-19 - Carta aval opcional operativamente

Decision: la carta aval institucional deja de ser requisito bloqueante para
continuar el ciclo, porque no todas las personas postulantes estan vinculadas
a una institucion que pueda emitirla.

Justificacion: decision funcional comunicada por el Equipo Tecnico. La ausencia
de carta aval debe quedar trazada, pero no debe impedir la admisibilidad
preliminar cuando el resto de requisitos bloqueantes se cumple.

Impacto: `FDF-17` queda como carga documental opcional en la configuracion
operativa. El chequeo `CARTA_AVAL_RECEIVED` pasa a severidad informativa. La
matriz tecnica no cambia automaticamente: la carta puede usarse como evidencia
contextual si existe, pero su ausencia no modifica puntajes por regla automatica.

## 2026-08-20 - Puntuacion de genero segun Anexo 1

Decision: para `FDF-35` se adopta el valor definido en
`docs/oficiales/anexo-1-matriz-calificacion.pdf`: `Mujer = 10`,
`Hombre = 5`, `No aporta informacion = 0`.

Justificacion: el Anexo 1 es la matriz oficial de calificacion y tiene mayor
jerarquia para reglas de puntuacion que el Anexo 2/formulario publico. La
referencia previa del Anexo 2 a `Hombre = 10` queda tratada como discrepancia
superada para efectos del motor de evaluacion.

Impacto: se cierra `OI-001`. El motor automatico de evaluacion podra aplicar
la regla de genero desde Anexo 1 cuando se implemente la puntuacion tecnica.

## 2026-08-20 - Motor automatico de puntuacion tecnica

Decision: implementar puntuacion automatica preliminar para los 4 criterios del
Anexo 1, usando solo respuestas cerradas y reglas versionadas en
`config/fdf-2026-evaluation-baseline.json`.

Justificacion: el Anexo 1 define una matriz suficiente para calcular atributos
0/5/10 y ponderarlos por criterio. Automatizar este calculo reduce trabajo
manual sin sustituir la revision tecnica.

Impacto: cada postulacion valida queda con criterios tecnicos calculados y
`total_score` ponderado. Los textos cualitativos se mantienen como evidencia y
no se puntuan automaticamente. El resultado no implementa ranking, cupos,
desempates, seleccion ni decision final del Equipo Tecnico.

## 2026-08-20 - Validacion tecnica del resultado automatico

Decision: agregar una capa de validacion tecnica sobre `evaluation_results`
para que el Equipo Tecnico pueda marcar el resultado calculado como pendiente,
en revision, validado o requerido de ajuste.

Justificacion: el motor automatico reduce trabajo operativo, pero la revision
tecnica debe poder asumir o cuestionar formalmente el resultado antes de
construir ranking o propuestas de seleccion.

Impacto: se agregan `validation_status`, `validation_note`, `validated_at` y
`validated_by` al resumen de evaluacion. Cada recalculo o ajuste de criterio
devuelve la validacion a pendiente. La validacion no cambia puntajes, no aplica
cupos y no equivale a decision final del Equipo Tecnico.
