# 01 - Official Sources

## Orden de autoridad

1. `docs/oficiales/proceso-convocatoria-seleccion.pdf`
2. `docs/oficiales/anexo-1-matriz-calificacion.pdf`
3. Acuerdos posteriores formalmente comunicados por el Equipo Tecnico
4. `sheets/Sistema_FdF_2026_FINAL.xlsx`
5. Capa publica aprobada para Google Forms: hoja `13_Formulario_Publico`
6. Representaciones offline:
   - `docs/oficiales/formulario-postulacion-via-offline.pdf`
   - `docs/oficiales/formulario-postulacion-via-offline.html`

## Revisiones recibidas el 20/08/2026

Se recibieron en `revision/` dos documentos revisados por UGP/Equipo Tecnico:

- `REv_ET_19082026. Proceso de convocatoria y selección para FdF.docx`
- `REv_ET_19082026. Anexo 1. Matriz de evaluación FdF- Act.2.3.2.docx`

Impacto documentado:

- El Anexo 1 elimina `INAENE` de las caracteristicas del atributo
  `Vinculacion institucional activa`. No cambia porcentajes ni puntuaciones
  automaticas de la matriz configurada.
- El documento principal explicita reglas operativas para la propuesta
  provincial: cupo de 4 personas por provincia, maximo 2 por municipio y
  maximo 2 por institucion, lista de reserva y criterios de desempate que
  requieren revision del Equipo Tecnico.

Estas reglas se versionan en `config/fdf-2026-selection-policy.json` como
analisis operativo. La aprobacion final sigue correspondiendo al Equipo
Tecnico.

## Artefactos tecnicos existentes

- `apps-script/Crear_Sistema_FdF_2026_FINAL.gs`: generacion, auditoria y publicacion controlada del Google Form final.
- `docs/tecnico/analisis-cambios-documentos-aprobados-fdf.pdf`: analisis tecnico de cambios.
- `docs/tecnico/url-google-form.txt`: enlace publico registrado para referencia operacional.

## Observaciones

- La fuente publica operativa contiene 43 campos `FDF-01` a `FDF-43`.
- El HTML offline exporta JSON con `schema = FDF-2026-OFFLINE-1`.
- Los codigos `FDF-xx` son identificadores internos de configuracion y procesamiento.
