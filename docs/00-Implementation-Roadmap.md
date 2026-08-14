# 00 --- Implementation Roadmap

## Sistema de Convocatoria, Evaluación y Selección --- Formación de Formadores (FdF) 2026

**Estado:** Inicio de implementación\
**Fecha de referencia:** 13 de agosto de 2026\
**Documento rector de implementación:** este roadmap no sustituye el
Procedimiento, el Anexo 1 ni los instrumentos oficiales aprobados.

------------------------------------------------------------------------

## 1. Objetivo

Implementar la solución informática que soporte de extremo a extremo el
proceso de postulación, admisibilidad, evaluación, clasificación,
selección, lista de reserva, aprobación y notificación de las personas
postulantes al programa de Formación de Formadores (FdF).

La solución debe admitir dos vías de postulación:

1.  **Vía principal:** Google Forms.
2.  **Vía alternativa completa:** formulario offline remitido por correo
    electrónico junto con sus adjuntos.

Ambas vías deben converger en un único modelo de postulante y utilizar
exactamente las mismas reglas de admisibilidad, evaluación y selección.

> **Principio rector:** la evaluación y el resultado de una postulación
> no pueden depender de la vía por la que fue recibida.

------------------------------------------------------------------------

## 2. Fuentes de verdad

La implementación debe construirse únicamente a partir de los documentos
e instrumentos oficiales suministrados al proyecto.

Orden de referencia:

1.  Procedimiento actualizado de convocatoria y selección.
2.  Anexo 1 con criterios, porcentajes y reglas de evaluación.
3.  Acuerdos posteriores formalmente comunicados por el Equipo Técnico.
4.  `Sistema_FdF_2026_FINAL.xlsx`, como matriz operativa y de
    configuración.
5.  Formulario Google generado desde la capa pública aprobada.
6.  Variantes offline PDF/HTML, que reproducen la misma capa pública.

### Regla de no reinterpretación

Codex no debe:

-   inventar criterios;
-   modificar porcentajes;
-   cambiar textos oficiales;
-   añadir o eliminar preguntas;
-   cambiar opciones de respuesta;
-   resolver contradicciones documentales por iniciativa propia;
-   mostrar al postulante puntos, ponderaciones, atributos internos o
    textos como «No puntúa»;
-   convertir decisiones funcionales pendientes en reglas de software.

Cuando exista una contradicción o un dato no determinado, debe
registrarse como **bloqueo funcional** y solicitar decisión.

------------------------------------------------------------------------

## 3. Estado de partida

### 3.1 Instrumentos de postulación

Se dispone de:

-   Google Forms como vía principal;
-   PDF rellenable como vía alternativa;
-   HTML offline como vía alternativa;
-   exportación JSON desde el HTML offline para facilitar la importación
    automática.

Los instrumentos se encuentran en revisión del equipo.

### 3.2 Decisiones ya incorporadas

-   INAENE fue eliminado únicamente de las opciones de **Tipo de
    institución**.
-   INAENE puede mantenerse donde aparezca como actor de articulación si
    así consta en el instrumento oficial.
-   Se eliminó la pregunta relativa a si la participación contribuiría a
    la representación de provincia, municipio o institución dentro de la
    cohorte regional.
-   `FDF-22` es una pregunta de texto/párrafo; no solicita carga de
    evidencia.
-   Por Google Forms son obligatorias las cargas de Carta Aval y
    Currículum Vitae.
-   En la vía offline, formulario, Carta Aval y CV se remiten por
    correo; el HTML puede generar además un JSON para procesamiento
    automático.
-   Los identificadores `FDF-xx` son internos y no deben mostrarse al
    postulante.
-   La aprobación final de la lista corresponde al Equipo Técnico.
-   Debe generarse un documento resumen para el Equipo Técnico con las
    personas propuestas y los principales elementos que sustentan su
    selección.

### 3.3 Decisiones todavía no cerradas

Toda regla marcada como pendiente en la matriz oficial debe permanecer
parametrizada o bloqueada. En particular, no debe codificarse como
definitiva ninguna contradicción todavía pendiente de aprobación del
Equipo Técnico.

------------------------------------------------------------------------

## 4. Arquitectura funcional

``` text
                         POSTULACIONES
                              │
              ┌───────────────┴───────────────┐
              │                               │
        Google Forms                  Vía offline/correo
              │                    HTML/PDF + adjuntos
              │                         + JSON
              └───────────────┬───────────────┘
                              ▼
                    INGESTIÓN / REGISTRO RAW
                              │
                              ▼
                  VALIDACIÓN Y NORMALIZACIÓN
                              │
                              ▼
                     POSTULANTE ÚNICO
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
          DOCUMENTACIÓN               ADMISIBILIDAD
                 │                         │
                 └────────────┬────────────┘
                              ▼
                         EVALUACIÓN
                              │
                              ▼
                    PUNTUACIÓN OFICIAL
                              │
                              ▼
                    RANKING POR PROVINCIA
                              │
                 ┌────────────┼────────────┐
                 ▼            ▼            ▼
           PROPUESTOS       RESERVA     RESTANTES
                 │
                 ▼
          EQUIPO TÉCNICO
                 │
                 ▼
         APROBACIÓN FINAL
                 │
                 ▼
           NOTIFICACIONES
```

------------------------------------------------------------------------

## 5. Principios técnicos

### 5.1 Separación RAW / normalizado / evaluación

Nunca se debe perder o sobrescribir la respuesta original.

La solución mantendrá, como mínimo:

-   **RAW:** dato exactamente recibido.
-   **Normalizado:** dato transformado al modelo común.
-   **Evaluación:** resultados derivados de reglas.
-   **Decisión:** resultado de clasificación/aprobación.
-   **Auditoría:** quién, cuándo y por qué se produjo cada cambio.

### 5.2 Configuración antes que código

Criterios, pesos, cupos, parámetros y reglas susceptibles de decisión
institucional deben residir en configuración identificable y auditable,
no dispersos como constantes dentro del código.

### 5.3 Trazabilidad

Cada postulante debe disponer de un identificador interno único.

Debe ser posible reconstruir:

-   vía de entrada;
-   respuesta original;
-   documentos recibidos;
-   normalización realizada;
-   reglas aplicadas;
-   puntuación por criterio;
-   puntuación total;
-   posición en ranking;
-   condición de seleccionado/reserva;
-   revisiones manuales;
-   aprobación final.

### 5.4 Idempotencia

Reimportar una respuesta ya procesada no debe crear un postulante
duplicado.

### 5.5 Revisión humana

El sistema asiste la decisión; no sustituye las competencias del Equipo
Técnico.

------------------------------------------------------------------------

# 6. Roadmap de implementación

## Sprint 0 --- Baseline y protección de fuentes

### Objetivo

Preparar el repositorio antes de desarrollar lógica funcional.

### Tareas

-   Inventariar los archivos oficiales disponibles.
-   Identificar claramente fuentes públicas, internas y de evaluación.
-   Crear estructura de documentación técnica.
-   Documentar decisiones congeladas y pendientes.
-   Crear modelo inicial de configuración.
-   Establecer convenciones de identificadores y trazabilidad.
-   Preparar datos de prueba sintéticos.
-   No modificar los instrumentos oficiales.

### Entregables

``` text
docs/
  00-Implementation-Roadmap.md
  01-Official-Sources.md
  02-Functional-Rules.md
  03-Data-Model.md
  04-Ingestion-Architecture.md
  05-Evaluation-Architecture.md
  06-Ranking-Architecture.md
  07-Audit-and-Traceability.md
  08-Test-Strategy.md
  DECISIONS.md
  OPEN-ISSUES.md
```

### Criterio de salida

Fuentes y reglas identificadas sin contradicciones resueltas
unilateralmente.

------------------------------------------------------------------------

## Sprint 1 --- Modelo unificado e ingestión

### Objetivo

Conseguir que una postulación termine en el mismo modelo
independientemente de su origen.

### Orígenes

#### Google

``` text
Google Forms
    ↓
Google Sheets
    ↓
Importador Google
```

#### Offline

``` text
Correo
 ├── formulario PDF
 ├── Carta Aval
 ├── CV
 └── JSON, cuando proceda
        ↓
Importador Offline
```

### Componentes

-   adaptador Google Forms/Sheets;
-   importador JSON offline;
-   registro manual controlado para postulaciones offline sin JSON;
-   almacenamiento RAW;
-   normalizador;
-   detector de duplicados;
-   generación de identificador interno;
-   asociación documental;
-   registro de origen.

### Modelo mínimo de origen

``` text
submission_id
candidate_id
source_channel
source_reference
received_at
raw_payload
normalization_status
created_at
updated_at
```

`source_channel` debe distinguir al menos:

``` text
GOOGLE_FORM
OFFLINE_JSON
OFFLINE_MANUAL
```

### Criterios de aceptación

-   una respuesta Google puede importarse;
-   un JSON offline puede importarse;
-   una postulación offline sin JSON puede registrarse;
-   las tres terminan en el mismo modelo;
-   reimportar no duplica;
-   el RAW permanece intacto;
-   puede conocerse siempre el origen.

------------------------------------------------------------------------

## Sprint 2 --- Gestión documental y admisibilidad

### Objetivo

Determinar si la postulación cumple los requisitos previos para ser
evaluada.

### Componentes

-   control de Carta Aval;
-   control de CV;
-   estado documental;
-   reglas de admisibilidad;
-   observaciones;
-   revisión manual cuando corresponda;
-   registro de subsanaciones si finalmente forman parte del
    procedimiento aprobado.

### Estados sugeridos

Los nombres definitivos deben validarse contra los documentos oficiales,
pero la arquitectura debe permitir distinguir como mínimo:

``` text
RECIBIDA
EN_REVISION
PENDIENTE
ADMISIBLE
NO_ADMISIBLE
```

### Regla

**Admisibilidad y puntuación son procesos diferentes.**

Un postulante no debe convertirse en admisible por obtener una
puntuación alta.

------------------------------------------------------------------------

## Sprint 3 --- Motor de evaluación

### Objetivo

Implementar de forma reproducible las reglas del Anexo 1.

### Diseño

El motor debe calcular cada criterio de forma independiente.

Ejemplo conceptual:

``` text
evaluar(postulante, configuracion)
    ├── criterio_01()
    ├── criterio_02()
    ├── criterio_03()
    ├── ...
    └── resultado
```

### Resultado

Debe almacenar:

``` text
criterion_id
raw_value
normalized_value
score
weight
weighted_score
rule_version
calculated_at
manual_override
override_reason
```

### Requisitos

-   no calcular criterios no aprobados;
-   no inventar valores ausentes;
-   permitir revisión humana donde la regla lo requiera;
-   conservar explicación del cálculo;
-   versionar las reglas;
-   recalcular de forma determinista.

### Criterio de aceptación

Dado el mismo postulante y la misma versión de reglas, el resultado debe
ser idéntico.

------------------------------------------------------------------------

## Sprint 4 --- Ranking provincial y cupos

### Objetivo

Construir la clasificación que servirá de base a la propuesta de
selección.

### Funciones

-   filtrar postulantes admisibles;
-   agrupar por provincia;
-   ordenar por puntuación;
-   aplicar cupos aprobados;
-   identificar propuestos;
-   construir lista de reserva;
-   gestionar empates según la regla oficial;
-   registrar casos que requieren decisión humana.

### Regla fundamental

El ranking **no modifica la puntuación**.

### Salida conceptual

``` text
Provincia
Posición
Candidate ID
Puntuación
Estado de propuesta
Motivo
```

### Cupos

La configuración actualmente contempla la selección de **4 formadores
por provincia**, sujeto a que esta regla permanezca vigente en la
versión oficial aplicable.

------------------------------------------------------------------------

## Sprint 5 --- Consola de revisión

### Objetivo

Permitir revisar el proceso sin manipular directamente datos RAW ni
fórmulas internas.

### Funciones

-   listado de postulantes;
-   filtros por provincia y estado;
-   ficha individual;
-   documentación;
-   admisibilidad;
-   desglose de puntuación;
-   observaciones;
-   incidencias;
-   revisión manual;
-   trazabilidad.

No implementar una interfaz compleja antes de estabilizar el motor.

------------------------------------------------------------------------

## Sprint 6 --- Documento para el Equipo Técnico

### Objetivo

Generar automáticamente el documento que sustenta la propuesta de
selección.

Debe incluir, como mínimo:

-   provincia;
-   persona propuesta;
-   institución;
-   elementos relevantes del perfil;
-   resultado de evaluación;
-   posición;
-   elementos principales que sustentan la propuesta;
-   condición propuesta;
-   observaciones relevantes.

El formato final deberá acordarse con el Equipo Técnico.

------------------------------------------------------------------------

## Sprint 7 --- Aprobación final

### Objetivo

Registrar formalmente la decisión del Equipo Técnico.

Debe diferenciarse entre:

``` text
resultado_calculado
propuesta
decision_final
```

La decisión final nunca debe sobrescribir el cálculo original.

------------------------------------------------------------------------

## Sprint 8 --- Notificaciones

### Objetivo

Preparar y controlar las comunicaciones posteriores a la aprobación.

Posibles grupos:

-   seleccionados;
-   lista de reserva;
-   restantes/no seleccionados;
-   incidencias específicas.

Las notificaciones solo deben producirse después de la aprobación
correspondiente.

------------------------------------------------------------------------

## Sprint 9 --- QA y cierre operacional

### Pruebas mínimas

-   importación Google;
-   importación JSON;
-   alta manual offline;
-   duplicados;
-   campos vacíos;
-   documentos faltantes;
-   inadmisibilidad;
-   puntuaciones límite;
-   empates;
-   provincias con menos candidatos que cupos;
-   provincias con más candidatos que cupos;
-   reimportación;
-   recálculo;
-   modificación de configuración;
-   override manual;
-   trazabilidad;
-   generación del documento del Equipo Técnico.

### Requisito

No utilizar datos personales reales en las pruebas automatizadas.

------------------------------------------------------------------------

# 7. Modelo de estados

El flujo debe soportar, conceptualmente:

``` text
RECIBIDA
   ↓
VALIDADA
   ↓
EN_REVISION
   ↓
ADMISIBLE / NO_ADMISIBLE
   ↓
EVALUADA
   ↓
CLASIFICADA
   ↓
PROPUESTA / RESERVA
   ↓
APROBADA
   ↓
NOTIFICADA
```

La nomenclatura exacta se ajustará a la terminología oficial.

------------------------------------------------------------------------

# 8. Gestión de cambios

Durante la implementación pueden llegar observaciones del Equipo
Técnico.

Todo cambio debe clasificarse como:

``` text
DOCUMENTAL
FORMULARIO_PUBLICO
REGLA_ADMISIBILIDAD
REGLA_EVALUACION
REGLA_RANKING
OPERACIONAL
TECNICO
```

Cada cambio debe registrar:

-   origen;
-   fecha;
-   decisión;
-   artefactos afectados;
-   versión;
-   pruebas necesarias.

No modificar silenciosamente una regla ya implementada.

------------------------------------------------------------------------

# 9. Seguridad y protección de datos

La solución manejará información personal y documentación de
postulantes.

Debe aplicarse:

-   mínimo privilegio;
-   acceso restringido;
-   separación entre datos públicos y datos internos;
-   no exponer documentos mediante enlaces públicos;
-   no registrar contenido sensible innecesario en logs;
-   trazabilidad de operaciones;
-   protección de credenciales y secretos;
-   exclusión de datos reales del repositorio Git.

------------------------------------------------------------------------

# 10. Estrategia de desarrollo con Codex

Codex trabajará por sprint.

Para cada sprint debe seguir este ciclo:

``` text
1. Leer fuentes oficiales.
2. Leer documentación técnica existente.
3. Identificar ambigüedades.
4. Actualizar OPEN-ISSUES.md si procede.
5. Proponer plan de implementación.
6. Implementar.
7. Crear/actualizar tests.
8. Ejecutar tests.
9. Actualizar documentación.
10. Resumir cambios, riesgos y pendientes.
```

No iniciar automáticamente el sprint siguiente sin cerrar los criterios
de aceptación del actual.

------------------------------------------------------------------------

# 11. Primer objetivo de implementación

El primer objetivo técnico será:

> **Implementar el modelo unificado de postulaciones y la capa de
> ingestión sin implementar todavía el ranking.**

Al finalizar el Sprint 1 debe ser posible demostrar:

``` text
Respuesta Google ───┐
                    ├──► Postulante normalizado
JSON offline ───────┤
                    │
Registro manual ────┘
```

con trazabilidad completa y sin duplicación.

------------------------------------------------------------------------

# 12. Definición de terminado

El sistema estará listo para operación cuando:

-   ambas vías de postulación converjan correctamente;
-   las reglas oficiales estén versionadas;
-   la admisibilidad esté implementada;
-   la puntuación sea reproducible;
-   el ranking provincial sea verificable;
-   la lista de reserva sea reproducible;
-   el Equipo Técnico pueda revisar la propuesta;
-   la aprobación quede registrada;
-   puedan generarse las salidas requeridas;
-   exista trazabilidad completa;
-   los casos críticos estén cubiertos por pruebas;
-   no existan contradicciones funcionales abiertas que afecten el
    resultado.
