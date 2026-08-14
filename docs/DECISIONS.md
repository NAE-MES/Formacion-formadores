# Decisions

## 2026-08-13 - Mantener stack Apps Script / Google Sheets

Decision: implementar Sprint 1 como logica JavaScript compatible con Apps Script, con pruebas locales Node para funciones puras.

Justificacion: el repositorio existente no contiene backend ni aplicacion separada; Google Workspace es la arquitectura ya adoptada.

Impacto: no se cambia el runtime productivo. Las pruebas locales son herramienta de desarrollo.

## 2026-08-13 - Configuracion versionable derivada de la capa publica

Decision: crear configuracion JSON versionable a partir de `13_Formulario_Publico`, sin modificar textos, opciones ni obligatoriedad.

Justificacion: Sprint 1 necesita validar canales sin acoplar el dominio a encabezados arbitrarios de Google Sheets.

Impacto: los importadores usan codigos `FDF-xx` y mapeo de columnas configurable.
