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
