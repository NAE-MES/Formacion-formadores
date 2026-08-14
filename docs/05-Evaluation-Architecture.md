# 05 - Evaluation Architecture

## Estado

Pendiente. No se implementa motor completo de puntuacion en Sprint 1.

## Restricciones

- No calcular criterios no aprobados.
- No resolver contradicciones.
- No convertir campos ambiguos en reglas definitivas.
- Mantener resultados de evaluacion separados del RAW y del dato normalizado.

## Preparacion tecnica

La ingestión deja respuestas normalizadas por `FDF-xx`, lo que permite agregar posteriormente evaluaciones por criterio sin redisenar los canales de entrada.
