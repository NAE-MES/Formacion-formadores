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

## Fuera de alcance

- pruebas contra Google Forms real;
- envio de correos;
- ranking;
- puntuacion definitiva;
- datos personales reales.
