# 07 - Audit and Traceability

## Eventos auditables

Cada operacion relevante debe registrar:

- accion;
- entidad;
- identificador de entidad;
- fecha/hora;
- canal/origen;
- actor o proceso;
- valor anterior cuando aplique;
- valor nuevo cuando aplique;
- motivo cuando aplique.

## Seguridad

Los eventos no deben guardar CV, Carta Aval ni datos personales completos. Para trazabilidad tecnica se usan referencias, hashes y codigos internos.

## Eventos Sprint 1

- `SUBMISSION_IMPORTED`
- `SUBMISSION_REIMPORTED`
- `NORMALIZATION_ISSUE_RECORDED`
- `DUPLICATE_REVIEW_CREATED`
- `DOCUMENT_ASSOCIATED`
- `ELIGIBILITY_ASSESSED`
