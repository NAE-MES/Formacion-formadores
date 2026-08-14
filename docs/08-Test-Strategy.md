# 08 - Test Strategy

## Sprint 1

Las pruebas unitarias usan datos sinteticos y no dependen de servicios externos.

Casos cubiertos:

- importar respuesta Google valida;
- importar JSON offline valido;
- registrar postulacion offline manual;
- producir el mismo modelo normalizado desde canales diferentes;
- rechazar/registrar JSON con version desconocida;
- detectar campo desconocido;
- detectar opcion invalida;
- reimportar sin duplicar;
- detectar posible duplicado entre canales;
- conservar RAW;
- asociar documentos;
- registrar incidencias de normalizacion.

## Sprint 2

Casos cubiertos:

- evaluar una postulacion lista para revision tecnica;
- bloquear preliminarmente cuando faltan documentos requeridos;
- marcar revision manual por vinculo institucional negativo sin rechazo final automatico;
- generar plan de persistencia para hojas operativas sin perder RAW ni documentos.

## Fuera de alcance

- pruebas contra Google Forms real;
- envio de correos;
- ranking;
- puntuacion definitiva;
- datos personales reales.
