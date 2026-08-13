# Sistema FdF 2026

Sistema de apoyo al proceso de convocatoria, evaluación y selección de
participantes para la **Formación de Formadores (FdF) 2026**.

La solución utiliza Google Workspace y toma como fuente funcional
oficial los documentos aprobados del proceso FdF: el proceso de
convocatoria y selección, el Anexo 1 (Matriz de calificación) y el Anexo
2 (Formulario de postulación).

> Las reglas implementadas deben mantenerse alineadas con los documentos
> oficiales.

## Objetivo

Digitalizar y automatizar:

**Postulación → Admisibilidad → Evaluación → Validación → Ranking
provincial → Propuesta de selección → Aprobación → Seleccionados /
Reserva → Notificación**

La herramienta apoya el proceso; no sustituye las decisiones del equipo
evaluador ni del Equipo Técnico.

## Arquitectura

-   **Google Forms:** captura de postulaciones según el Anexo 2.
-   **Google Sheets:** respuestas, expedientes, admisibilidad,
    evaluación, validación, ranking, seleccionados, reserva,
    notificaciones, configuración y trazabilidad.
-   **Google Apps Script:** automatización de formulario, procesamiento,
    controles, cálculos, ranking y notificaciones.
-   **Google Drive:** repositorio documental.
-   **Correo FdF:** comunicaciones oficiales y gestión de recursos
    asociados.

## Estructura recomendada del repositorio

``` text
fdf-2026/
├── README.md
├── HOWTO.md
├── docs/
│   ├── oficiales/
│   │   ├── proceso-convocatoria-seleccion.pdf
│   │   ├── anexo-1-matriz-calificacion.pdf
│   │   └── anexo-2-formulario-postulacion.pdf
│   └── tecnico/
│       └── analisis-cambios-documentos-aprobados-fdf.pdf
├── sheets/
│   └── Sistema_FdF_2026_V2_OFICIAL.xlsx
└── apps-script/
    └── Crear_Sistema_FdF_2026_V2_OFICIAL.gs
```

## Hojas del sistema

-   `00_Instrucciones`: reglas generales.
-   `01_Respuestas_Forms`: respuestas originales de Forms.
-   `02_Postulantes`: expedientes normalizados.
-   `03_Admisibilidad`: requisitos habilitantes y documentos.
-   `04_Evaluacion`: matriz oficial de calificación.
-   `05_Validacion`: validaciones institucionales/territoriales.
-   `06_Ranking`: ranking provincial.
-   `07_Seleccionados`: propuesta/lista de seleccionados.
-   `08_Reserva`: reserva provincial.
-   `09_Notificaciones`: comunicaciones.
-   `10_Catalogos`: provincias, regiones y catálogos.
-   `11_Config`: parámetros.
-   `12_Log`: trazabilidad.
-   `13_Formulario_Config`: configuración del Forms.
-   `14_Matriz_Oficial`: representación del Anexo 1.

## Matriz oficial

  Criterio                                               Peso
  ----------------------------------------------- -----------
  Vinculación institucional                              15 %
  Capacidades formativas y experiencia técnica           55 %
  Potencial de réplica territorial                       25 %
  Enfoque de inclusión, género o sostenibilidad           5 %
  **TOTAL**                                         **100 %**

### Ponderaciones internas

**Vinculación institucional (15 %):** - Vinculación institucional
activa: 40 %. - Pertinencia del rol institucional: 30 %. - Respaldo
institucional: 30 %.

**Capacidades formativas y experiencia técnica (55 %):** -
Formación/docencia/facilitación: 35 %. - Acompañamiento
empresarial/desarrollo territorial: 35 %. - Conocimiento del ecosistema
NAE: 20 %. - Metodologías/materiales formativos: 10 %.

**Potencial de réplica territorial (25 %):** - Convocatoria/articulación
territorial: 35 %. - Compromiso de multiplicación: 35 %. -
Disponibilidad: 20 %. - Comunicación/seguimiento: 10 %.

**Inclusión, género o sostenibilidad (5 %):** - Juventudes: 40 %. -
Representación de mujeres: 30 %. - Experiencia/interés en género e
inclusión: 30 %.

## Clasificación

    Puntuación Clasificación
  ------------ -------------------------------------------------------
       80--100 Selección prioritaria
        70--79 Elegible / lista de reserva
        60--69 Elegible condicionado a cupos o necesidad territorial
         \< 60 No recomendado

## Cupos

Se seleccionan **4 formadores por provincia**, incluida Isla de la
Juventud: **64 a nivel provincial**.

**Ranking provincial → 4 candidatos propuestos → Reservas provinciales →
Consolidación → Aprobación del Equipo Técnico**

No se seleccionan simplemente los primeros 64 de un ranking nacional.

## Evidencias documentales

El expediente incluye, entre otras: - carta aval institucional; -
currículum vitae actualizado.

Estados operativos sugeridos: `RECIBIDO`, `PENDIENTE DE SUBSANACIÓN`,
`VALIDADO`, `NO SUBSANADO`.

## Identificador interno

Formato recomendado:

``` text
FDF-2026-0001
FDF-2026-0002
...
```

Relaciona postulación, documentos, admisibilidad, evaluación,
validación, ranking y notificaciones.

## Pendientes oficiales

### Puntuación de género

Existe una discrepancia: - Anexo 1: Hombre = 5 puntos. - Anexo 2: Hombre
= 10 puntos.

La regla permanece parametrizada hasta definición oficial.

### Plazo de subsanación

Los documentos prevén un plazo breve para subsanación, pero su duración
exacta debe configurarse cuando sea aprobada.

## Principio de mantenimiento

**Documento/regla oficial → Matriz/configuración → Google Forms → Google
Sheets → Apps Script**

No modificar unilateralmente reglas directamente en el código.

## Seguridad

-   Utilizar cuentas institucionales.
-   Aplicar permisos por función.
-   Evitar acceso público a documentos.
-   Mantener trazabilidad y respaldos.
-   Recopilar únicamente información necesaria.
-   Conservar evidencias según el período aprobado.

## Estado

**Versión:** FdF 2026 V2 OFICIAL\
**Base funcional:** documentos aprobados del 11/08/2026.
