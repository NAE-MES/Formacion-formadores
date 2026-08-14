# HOWTO --- Instalación y puesta en marcha del Sistema FdF 2026

## 1. Requisitos

-   Cuenta Google destinada al proceso FdF.
-   Google Drive.
-   Google Sheets.
-   Google Forms.
-   Google Apps Script.

Archivos necesarios:

``` text
sheets/Sistema_FdF_2026_FINAL.xlsx
apps-script/Crear_Sistema_FdF_2026_FINAL.gs
apps-script/FdF_Ingestion.gs
config/fdf-2026-public-schema.json
```

## 2. Crear estructura en Google Drive

Crear:

``` text
FdF 2026/
├── 01_Convocatoria/
├── 02_Postulaciones/
├── 03_Requisitos_Habilitantes/
├── 04_Matriz_Calificacion/
├── 05_Validacion_Territorial/
├── 06_Listas_Seleccion/
├── 07_Notificacion_Aceptacion/
├── 08_Materiales_Iniciales/
├── 09_Evidencias_Participacion/
└── 10_Respaldo_Cierre/
```

No otorgar acceso público.

## 3. Subir y convertir la hoja

Subir `sheets/Sistema_FdF_2026_FINAL.xlsx` a Drive.

Abrir y seleccionar:

**Archivo → Guardar como Hojas de cálculo de Google**

Trabajar posteriormente con la versión Google Sheets.

## 4. Verificar hojas

Deben existir:

``` text
00_Instrucciones
01_Esquema_Respuestas
02_Postulantes
03_Admisibilidad
04_Evaluacion
05_Validacion
06_Ranking
07_Seleccionados
08_Reserva
09_Notificaciones
10_Catalogos
11_Config
12_Log
13_Formulario_Publico
14_Mapeo_Puntuacion
15_Matriz_Oficial
16_Resumen_Equipo_Tecnico
17_Control_Cambios
```

## 5. Revisar `11_Config`

Verificar:

``` text
Cupo_por_provincia = 4
Peso_vinculacion = 15
Peso_capacidades = 55
Peso_replica = 25
Peso_inclusion = 5
Umbral_prioritaria = 80
Umbral_reserva = 70
Umbral_condicionado = 60
```

Completar cuando corresponda:

``` text
Correo_FdF
Drive_FdF_ID
Plazo_subsanacion_dias
```

`Puntos_hombre` debe mantenerse sujeto a la definición oficial de la
discrepancia entre Anexo 1 y Anexo 2.

## 6. Instalar Apps Script

Desde Google Sheets:

**Extensiones → Apps Script**

Abrir `Código.gs`, eliminar su contenido y pegar el contenido de:

`apps-script/Crear_Sistema_FdF_2026_FINAL.gs`

Guardar.

Si tambien se instala la capa de ingestión Sprint 1, crear otro archivo
en Apps Script y pegar el contenido de:

`apps-script/FdF_Ingestion.gs`

La configuracion versionable de referencia esta en:

`config/fdf-2026-public-schema.json`

## 7. Generar Google Forms

Seleccionar la función:

`crearGoogleFormFdF_FINAL`

Pulsar **Ejecutar** y autorizar los permisos.

Después revisar `11_Config`, columnas E:F, donde aparecerán:

``` text
Formulario_ID
Edición
Público
```

Abrir `Edición`.

**No publicar todavía.**

## 8. Configurar carta aval

El script crea la pregunta FDF-17 como **Párrafo** en su posición
correcta porque Apps Script no permite crear directamente preguntas de
tipo **Carga de archivos**.

Cambiar manualmente la pregunta FDF-17 a **Carga de archivos**.

Configurar como obligatoria, con un archivo máximo y los formatos
admitidos según lo aprobado. Incorporar la orientación oficial sobre el
contenido de la carta.

## 9. Configurar CV

Repetir con:

`Adjunte su currículum vitae actualizado`

Cambiar manualmente la pregunta FDF-27 a **Carga de archivos** y
configurarla como obligatoria.

No crear preguntas nuevas para FDF-17 ni FDF-27.

## 9.1 Auditar formulario

Después de configurar las dos cargas de archivo, ejecutar:

``` text
auditarGoogleFormFdF_FINAL
```

Corregir cualquier observación antes de publicar.

## 10. Comprobar la restricción de carga

Google Forms puede exigir inicio de sesión con una cuenta Google para
cargar archivos.

Antes de publicar, verificar si esta condición es compatible con la
población objetivo. Si no lo es, utilizar el mecanismo alternativo
aprobado mediante el correo FdF.

## 11. Revisar contra el Anexo 2

Comprobar: - títulos y textos; - opciones; - preguntas obligatorias; -
carta aval; - CV; - número de identificación; - región, provincia y
municipio; - género y edad; - consentimiento; - disponibilidad; -
compromiso de multiplicación; - autorización de validación.

## 12. Ejecutar prueba integral

Crear al menos tres postulaciones ficticias:

1.  Expediente completo, puntuación alta.
2.  Expediente completo, puntuación media.
3.  Documento pendiente o condición no habilitante.

## 13. Verificar respuestas

Comprobar `01_Esquema_Respuestas`.

No utilizar esta hoja para edición manual de expedientes.

## 14. Verificar región

Comprobar:

**Provincia → Región calculada → Región declarada**

Ejemplo: `Holguín → Oriente`.

Las discrepancias deben quedar marcadas para revisión.

## 15. Verificar admisibilidad

En `03_Admisibilidad` comprobar: - consentimiento; - vínculo
institucional; - carta aval; - CV; - disponibilidad; - compromiso de
multiplicación; - veracidad; - autorización para validación.

Los expedientes incompletos subsanables permanecen pendientes hasta
aplicar el plazo aprobado.

## 16. Probar evaluación

En `04_Evaluacion` los atributos calificables utilizan 10, 5 o 0.

Máximos:

``` text
C1 = 15
C2 = 55
C3 = 25
C4 = 5
TOTAL = 100
```

Asignando 10 a todos los atributos, el resultado debe ser **100
puntos**.

## 17. Probar clasificación

``` text
80–100  → Selección prioritaria
70–79   → Elegible / reserva
60–69   → Elegible condicionado
< 60    → No recomendado
```

## 18. Probar ranking provincial

En `06_Ranking`, para cada provincia:

``` text
Posición 1
Posición 2
Posición 3
Posición 4
----------------
Seleccionados propuestos
```

Los candidatos siguientes conforman la reserva según las reglas
aprobadas.

## 19. Empates

El sistema debe identificar los empates.

No resolver automáticamente desempates que requieran valoración
cualitativa. Aplicar los criterios aprobados y registrar la decisión.

## 20. Validación

En `05_Validacion` registrar: - postulante; - tipo de validación; -
institución; - validador; - resultado; - observaciones; - fecha.

## 21. Aprobación

El ranking genera inicialmente una **PROPUESTA DE SELECCIÓN**.

Después de la revisión del Equipo Técnico registrar **APROBADO**.

Solo entonces la selección se considera definitiva.

## 22. Seleccionados y reserva

Revisar: - `07_Seleccionados` - `08_Reserva`

## 23. Notificaciones

Registrar en `09_Notificaciones`: - ID; - correo; - tipo; - estado; -
fecha; - asunto; - detalle.

## 24. Trazabilidad

Las operaciones automatizadas relevantes se registran en `12_Log`.

No eliminar esta hoja.

## 25. Prueba de aceptación

Verificar el flujo completo:

``` text
FORMULARIO
    ↓
RESPUESTA
    ↓
EXPEDIENTE
    ↓
ADMISIBILIDAD
    ↓
EVALUACIÓN
    ↓
VALIDACIÓN
    ↓
RANKING PROVINCIAL
    ↓
PROPUESTA DE SELECCIÓN
    ↓
APROBACIÓN
    ↓
SELECCIONADOS / RESERVA
    ↓
NOTIFICACIÓN
```

## 26. Publicación

Antes de publicar:

1.  Revisar configuración.
2.  Eliminar respuestas ficticias.
3.  Verificar documentos.
4.  Verificar permisos de Drive.
5.  Verificar correo FdF.
6.  Comprobar enlace público.
7.  Realizar una última postulación de prueba.
8.  Ejecutar `auditarGoogleFormFdF_FINAL`.
9.  Ejecutar `publicarGoogleFormFdF_FINAL` cuando la auditoría no reporte errores.
10. Distribuir el enlace oficial.

## 27. Fechas configuradas

``` text
Apertura:      14/08/2026
Cierre:        23/08/2026
Evaluación:    24/08/2026 – 28/08/2026
Notificación:  04/09/2026
```

Cualquier modificación aprobada debe reflejarse en `11_Config`.

## 28. Regla fundamental

``` text
1. Decisión metodológica
2. Documento/regla aprobada
3. Configuración
4. Implementación
5. Prueba
6. Producción
```

La herramienta implementa el proceso aprobado y no debe convertirse en
una fuente independiente de reglas.
