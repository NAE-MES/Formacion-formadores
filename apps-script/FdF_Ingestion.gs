/**
 * FdF 2026 - Sprint 1 ingestion model.
 *
 * Compatible with Google Apps Script and Node-based unit tests.
 * This file does not implement scoring, ranking, notifications or
 * Team Technical decisions.
 */

const FDF_SOURCE_CHANNELS = Object.freeze({
  GOOGLE_FORM: 'GOOGLE_FORM',
  OFFLINE_JSON: 'OFFLINE_JSON',
  OFFLINE_MANUAL: 'OFFLINE_MANUAL',
});

const FDF_DOCUMENT_TYPES = Object.freeze({
  CARTA_AVAL: 'CARTA_AVAL',
  CURRICULUM_VITAE: 'CURRICULUM_VITAE',
  FORMULARIO_OFFLINE: 'FORMULARIO_OFFLINE',
});

function FdF_createIngestionRepository() {
  return {
    candidates: [],
    submissions: [],
    submissionRaws: [],
    candidateResponses: [],
    documents: [],
    normalizationIssues: [],
    duplicateReviews: [],
    eligibilityAssessments: [],
    auditEvents: [],
  };
}

function FdF_importGoogleSubmission(input, config, repository) {
  return FdF_importSubmission_({
    sourceChannel: FDF_SOURCE_CHANNELS.GOOGLE_FORM,
    sourceReference: input.sourceReference || FdF_googleSourceReference_(input),
    receivedAt: input.receivedAt,
    actor: input.actor || 'GOOGLE_IMPORTER',
    rawPayload: input,
    responses: FdF_googleResponses_(input, config),
    documents: input.documents || [],
  }, config, repository);
}

function FdF_importOfflineJson(payload, config, repository, options) {
  const opts = options || {};
  const sourceReference = opts.sourceReference || FdF_hash_('offline-json:' + FdF_canonicalJson_(payload));

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return FdF_rejectedImport_(
      FDF_SOURCE_CHANNELS.OFFLINE_JSON,
      sourceReference,
      opts.receivedAt,
      payload,
      'INVALID_STRUCTURE',
      'Offline JSON payload must be an object.',
      repository
    );
  }

  if (payload.schema !== config.offline_json_schema) {
    return FdF_rejectedImport_(
      FDF_SOURCE_CHANNELS.OFFLINE_JSON,
      sourceReference,
      opts.receivedAt || payload.exportedAt,
      payload,
      'UNKNOWN_SCHEMA_VERSION',
      'Unsupported offline JSON schema: ' + String(payload.schema || ''),
      repository
    );
  }

  if (!payload.respuestas || typeof payload.respuestas !== 'object' || Array.isArray(payload.respuestas)) {
    return FdF_rejectedImport_(
      FDF_SOURCE_CHANNELS.OFFLINE_JSON,
      sourceReference,
      opts.receivedAt || payload.exportedAt,
      payload,
      'INVALID_STRUCTURE',
      'Offline JSON must include respuestas as an object.',
      repository
    );
  }

  return FdF_importSubmission_({
    sourceChannel: FDF_SOURCE_CHANNELS.OFFLINE_JSON,
    sourceReference,
    receivedAt: opts.receivedAt || payload.exportedAt,
    actor: opts.actor || 'OFFLINE_JSON_IMPORTER',
    rawPayload: payload,
    responses: payload.respuestas,
    documents: opts.documents || [],
  }, config, repository);
}

function FdF_registerOfflineManual(input, config, repository) {
  return FdF_importSubmission_({
    sourceChannel: FDF_SOURCE_CHANNELS.OFFLINE_MANUAL,
    sourceReference: input.sourceReference,
    receivedAt: input.receivedAt,
    actor: input.actor || 'OFFLINE_MANUAL_REGISTRY',
    rawPayload: input,
    responses: input.responses || {},
    documents: input.documents || [],
  }, config, repository);
}

function FdF_previsualizarImportacionGoogleSprint2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = FdF_importGoogleResponsesFromSpreadsheet(ss, {
    persist: false,
    actor: 'APPS_SCRIPT_PREVIEW',
  });
  SpreadsheetApp.getUi().alert(
    'Previsualización Sprint 2\n\n' +
    'Postulantes: ' + result.repository.candidates.length + '\n' +
    'Postulaciones: ' + result.repository.submissions.length + '\n' +
    'Incidencias: ' + result.repository.normalizationIssues.length + '\n' +
    'Posibles duplicados: ' + result.repository.duplicateReviews.length + '\n' +
    'Admisibilidad preliminar: ' + result.repository.eligibilityAssessments.length + '\n\n' +
    'No se escribieron hojas operativas.'
  );
  return result.summary;
}

function FdF_ejecutarImportacionGoogleSprint2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = FdF_importGoogleResponsesFromSpreadsheet(ss, {
    persist: true,
    actor: 'APPS_SCRIPT_IMPORT',
  });
  SpreadsheetApp.getUi().alert(
    'Importación Sprint 2 ejecutada\n\n' +
    'Postulantes: ' + result.repository.candidates.length + '\n' +
    'Postulaciones: ' + result.repository.submissions.length + '\n' +
    'Incidencias: ' + result.repository.normalizationIssues.length + '\n' +
    'Posibles duplicados: ' + result.repository.duplicateReviews.length + '\n' +
    'Admisibilidad preliminar: ' + result.repository.eligibilityAssessments.length + '\n\n' +
    'Revise las hojas técnicas 18-22 y 03_Admisibilidad.'
  );
  return result.summary;
}

function FdF_importGoogleResponsesFromSpreadsheet(spreadsheet, options) {
  const opts = options || {};
  const config = FdF_publicConfigFromSpreadsheet(spreadsheet);
  const eligibilityConfig = opts.eligibilityConfig || FdF_defaultEligibilityBaselineConfig();
  const sheetName = opts.sheetName || '01_Esquema_Respuestas';
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('No existe la hoja de respuestas: ' + sheetName);
  }

  const values = sheet.getDataRange().getValues();
  if (!values.length) {
    return {
      summary: FdF_importSummary_(FdF_createIngestionRepository(), false),
      repository: FdF_createIngestionRepository(),
    };
  }

  const headers = values[0].map(value => String(value || ''));
  const repository = FdF_createIngestionRepository();
  values.slice(1).forEach((row, index) => {
    if (FdF_isBlankRow_(row)) return;

    const rowObject = {};
    headers.forEach((header, colIndex) => rowObject[header] = row[colIndex]);
    const documents = FdF_googleDocumentsFromRow_(rowObject, config);
    const imported = FdF_importGoogleSubmission({
      headers,
      row,
      rowId: index + 2,
      sourceReference: 'sheet:' + sheetName + ':row:' + (index + 2),
      receivedAt: rowObject['Marca temporal'] || opts.receivedAt,
      actor: opts.actor || 'GOOGLE_SHEET_IMPORTER',
      documents,
    }, config, repository);

    if (imported.candidate) {
      FdF_assessCandidateEligibility(
        imported.candidate.candidate_id,
        eligibilityConfig,
        repository,
        { actor: opts.actor || 'GOOGLE_SHEET_IMPORTER' }
      );
    }
  });

  if (opts.persist) {
    FdF_persistRepositoryToSpreadsheet(spreadsheet, repository);
  }

  return {
    summary: FdF_importSummary_(repository, !!opts.persist),
    repository,
  };
}

function FdF_publicConfigFromSpreadsheet(spreadsheet) {
  const publicSheet = spreadsheet.getSheetByName('13_Formulario_Publico');
  if (!publicSheet) {
    throw new Error('No existe 13_Formulario_Publico.');
  }
  const rows = publicSheet.getDataRange().getValues();
  const fields = rows.slice(1)
    .filter(row => row[0])
    .map(row => {
      const options = row[5] && ['Opción múltiple', 'Casillas'].indexOf(row[4]) !== -1
        ? String(row[5]).split(';').map(option => option.trim()).filter(Boolean)
        : [];
      return {
        code: String(row[0]),
        section: String(row[1]),
        section_title: row[2],
        question: row[3],
        type: row[4],
        required: String(row[6]).trim().toLowerCase() === 'sí',
        options,
        technical_note: row[7] || null,
      };
    });

  const responseSheet = spreadsheet.getSheetByName('01_Esquema_Respuestas');
  const googleSheetColumnMap = { 'Marca temporal': '__timestamp' };
  if (responseSheet) {
    const headers = responseSheet.getRange(1, 1, 1, responseSheet.getLastColumn()).getValues()[0];
    const questionToCode = {};
    fields.forEach(field => questionToCode[field.question] = field.code);
    headers.forEach(header => {
      if (questionToCode[header]) {
        googleSheetColumnMap[header] = questionToCode[header];
      }
    });
  }

  return {
    schema_version: 'FDF-2026-PUBLIC-SCHEMA-1',
    offline_json_schema: 'FDF-2026-OFFLINE-1',
    source_channels: [
      FDF_SOURCE_CHANNELS.GOOGLE_FORM,
      FDF_SOURCE_CHANNELS.OFFLINE_JSON,
      FDF_SOURCE_CHANNELS.OFFLINE_MANUAL,
    ],
    document_types: [
      FDF_DOCUMENT_TYPES.CARTA_AVAL,
      FDF_DOCUMENT_TYPES.CURRICULUM_VITAE,
      FDF_DOCUMENT_TYPES.FORMULARIO_OFFLINE,
    ],
    fields,
    google_sheet_column_map: googleSheetColumnMap,
  };
}

function FdF_defaultEligibilityBaselineConfig() {
  return {
    schema_version: 'FDF-2026-ELIGIBILITY-BASELINE-1',
    assessment_scope: 'PRELIMINARY_OPERATIONAL_READINESS',
    statuses: {
      ready: 'READY_FOR_TECHNICAL_REVIEW',
      blocked: 'BLOCKED_BY_MISSING_REQUIREMENTS',
      requires_review: 'REQUIRES_MANUAL_REVIEW',
    },
    checks: [
      {
        check_id: 'CONSENT_ACCEPTED',
        type: 'FIELD_EQUALS',
        field_code: 'FDF-11',
        expected: 'Sí',
        severity: 'BLOCKING',
        description: 'Consentimiento para uso de informacion en el proceso FdF.',
      },
      {
        check_id: 'CARTA_AVAL_RECEIVED',
        type: 'DOCUMENT_PRESENT',
        document_type: FDF_DOCUMENT_TYPES.CARTA_AVAL,
        accepted_statuses: ['RECEIVED', 'VALIDADO', 'VALIDATED'],
        severity: 'BLOCKING',
        description: 'Carta aval institucional recibida.',
      },
      {
        check_id: 'CURRICULUM_RECEIVED',
        type: 'DOCUMENT_PRESENT',
        document_type: FDF_DOCUMENT_TYPES.CURRICULUM_VITAE,
        accepted_statuses: ['RECEIVED', 'VALIDADO', 'VALIDATED'],
        severity: 'BLOCKING',
        description: 'Curriculum vitae recibido.',
      },
      {
        check_id: 'VERACITY_CONFIRMED',
        type: 'FIELD_EQUALS',
        field_code: 'FDF-39',
        expected: 'Sí',
        severity: 'BLOCKING',
        description: 'Confirmacion de veracidad de la informacion.',
      },
      {
        check_id: 'VALIDATION_AUTHORIZED',
        type: 'FIELD_EQUALS',
        field_code: 'FDF-40',
        expected: 'Sí',
        severity: 'BLOCKING',
        description: 'Autorizacion para validacion institucional.',
      },
      {
        check_id: 'MULTIPLICATION_COMMITMENT_NOT_NEGATIVE',
        type: 'FIELD_NOT_EQUALS',
        field_code: 'FDF-30',
        not_expected: 'No manifiesto compromiso de multiplicación posterior',
        severity: 'BLOCKING',
        description: 'Compromiso de multiplicacion no negativo.',
      },
      {
        check_id: 'AVAILABILITY_NOT_NEGATIVE',
        type: 'FIELD_NOT_EQUALS',
        field_code: 'FDF-32',
        not_expected: 'No cuento con disponibilidad suficiente para participar en el proceso',
        severity: 'BLOCKING',
        description: 'Disponibilidad no negativa.',
      },
      {
        check_id: 'INSTITUTIONAL_LINK_REVIEW',
        type: 'FIELD_NOT_EQUALS',
        field_code: 'FDF-18',
        not_expected: 'No acredito vínculo institucional activo con una estructura de apoyo a NAE',
        severity: 'MANUAL_REVIEW',
        description: 'Vinculo institucional declarado requiere revision si es negativo.',
      },
    ],
  };
}

function FdF_importSubmission_(input, config, repository) {
  const repo = repository || FdF_createIngestionRepository();
  const receivedAt = input.receivedAt || FdF_nowIso_();
  const rawCanonical = FdF_canonicalJson_(input.rawPayload);
  const submissionId = FdF_hash_([
    input.sourceChannel,
    input.sourceReference || '',
    rawCanonical,
  ].join('|'));

  const existingSubmission = repo.submissions.find(s => s.submission_id === submissionId);
  if (existingSubmission) {
    FdF_audit_(repo, {
      action: 'SUBMISSION_REIMPORTED',
      entityType: 'Submission',
      entityId: submissionId,
      sourceChannel: input.sourceChannel,
      actor: input.actor,
      newValue: { source_reference: input.sourceReference },
    });
    return {
      status: 'REIMPORTED',
      candidate: repo.candidates.find(c => c.candidate_id === existingSubmission.candidate_id),
      submission: existingSubmission,
      issues: repo.normalizationIssues.filter(i => i.submission_id === submissionId),
      duplicateReviews: repo.duplicateReviews.filter(d => d.submission_id === submissionId),
      repository: repo,
    };
  }

  const validation = FdF_validateResponses_(input.responses, config, input.documents);
  const normalizedResponses = validation.responses;
  const candidateFingerprint = FdF_candidateFingerprint_(normalizedResponses);
  const candidateId = FdF_hash_('candidate|' + candidateFingerprint);
  const existingCandidate = repo.candidates.find(c => c.candidate_id === candidateId);

  const candidate = existingCandidate || FdF_candidateFromResponses_(candidateId, normalizedResponses, receivedAt);
  if (!existingCandidate) {
    repo.candidates.push(candidate);
  }

  const submission = {
    submission_id: submissionId,
    candidate_id: candidate.candidate_id,
    source_channel: input.sourceChannel,
    source_reference: input.sourceReference || '',
    received_at: receivedAt,
    normalization_status: validation.issues.length ? 'WITH_ISSUES' : 'NORMALIZED',
    created_at: FdF_nowIso_(),
    updated_at: FdF_nowIso_(),
  };
  repo.submissions.push(submission);

  repo.submissionRaws.push({
    submission_raw_id: FdF_hash_('raw|' + submissionId),
    submission_id: submissionId,
    source_channel: input.sourceChannel,
    raw_payload: FdF_clone_(input.rawPayload),
    raw_hash: FdF_hash_(rawCanonical),
    received_at: receivedAt,
  });

  Object.keys(normalizedResponses).sort().forEach(code => {
    repo.candidateResponses.push({
      candidate_response_id: FdF_hash_('response|' + submissionId + '|' + code),
      candidate_id: candidate.candidate_id,
      submission_id: submissionId,
      field_code: code,
      value: FdF_clone_(normalizedResponses[code]),
    });
  });

  validation.issues.forEach(issue => {
    const normalizationIssue = {
      normalization_issue_id: FdF_hash_('issue|' + submissionId + '|' + issue.code + '|' + issue.field_code + '|' + issue.message),
      submission_id: submissionId,
      candidate_id: candidate.candidate_id,
      field_code: issue.field_code,
      code: issue.code,
      severity: issue.severity || 'ERROR',
      message: issue.message,
      created_at: FdF_nowIso_(),
    };
    repo.normalizationIssues.push(normalizationIssue);
    FdF_audit_(repo, {
      action: 'NORMALIZATION_ISSUE_RECORDED',
      entityType: 'NormalizationIssue',
      entityId: normalizationIssue.normalization_issue_id,
      sourceChannel: input.sourceChannel,
      actor: input.actor,
      newValue: {
        code: normalizationIssue.code,
        field_code: normalizationIssue.field_code,
      },
    });
  });

  FdF_associateDocuments_(repo, input.documents, candidate.candidate_id, input.sourceChannel, receivedAt, input.actor);
  FdF_detectDuplicateReview_(repo, candidate, submission, input.sourceChannel, input.actor);

  FdF_audit_(repo, {
    action: 'SUBMISSION_IMPORTED',
    entityType: 'Submission',
    entityId: submissionId,
    sourceChannel: input.sourceChannel,
    actor: input.actor,
    newValue: {
      candidate_id: candidate.candidate_id,
      source_reference: submission.source_reference,
      normalization_status: submission.normalization_status,
    },
  });

  return {
    status: validation.issues.some(i => i.severity === 'ERROR') ? 'IMPORTED_WITH_ISSUES' : 'IMPORTED',
    candidate,
    submission,
    issues: validation.issues,
    duplicateReviews: repo.duplicateReviews.filter(d => d.submission_id === submissionId),
    repository: repo,
  };
}

function FdF_rejectedImport_(sourceChannel, sourceReference, receivedAt, rawPayload, code, message, repository) {
  const repo = repository || FdF_createIngestionRepository();
  const submissionId = FdF_hash_([
    sourceChannel,
    sourceReference || '',
    FdF_canonicalJson_(rawPayload),
  ].join('|'));

  repo.submissionRaws.push({
    submission_raw_id: FdF_hash_('raw|' + submissionId),
    submission_id: submissionId,
    source_channel: sourceChannel,
    raw_payload: FdF_clone_(rawPayload),
    raw_hash: FdF_hash_(FdF_canonicalJson_(rawPayload)),
    received_at: receivedAt || FdF_nowIso_(),
  });

  const issue = {
    normalization_issue_id: FdF_hash_('issue|' + submissionId + '|' + code),
    submission_id: submissionId,
    candidate_id: '',
    field_code: '',
    code,
    severity: 'ERROR',
    message,
    created_at: FdF_nowIso_(),
  };
  repo.normalizationIssues.push(issue);
  FdF_audit_(repo, {
    action: 'NORMALIZATION_ISSUE_RECORDED',
    entityType: 'NormalizationIssue',
    entityId: issue.normalization_issue_id,
    sourceChannel,
    actor: 'INGESTION_VALIDATOR',
    newValue: { code },
  });
  return { status: 'REJECTED', submission_id: submissionId, issues: [issue], repository: repo };
}

function FdF_googleResponses_(input, config) {
  if (input.responses) {
    return FdF_clone_(input.responses);
  }

  const map = config.google_sheet_column_map || {};
  const out = {};

  if (input.row && !Array.isArray(input.row)) {
    Object.keys(input.row).forEach(header => {
      const code = map[header];
      if (code && code !== '__timestamp') {
        out[code] = input.row[header];
      }
    });
    return out;
  }

  if (Array.isArray(input.row) && Array.isArray(input.headers)) {
    input.headers.forEach((header, index) => {
      const code = map[header];
      if (code && code !== '__timestamp') {
        out[code] = input.row[index];
      }
    });
    return out;
  }

  return out;
}

function FdF_googleSourceReference_(input) {
  if (input.responseId) return input.responseId;
  if (input.rowId) return 'row:' + input.rowId;
  if (input.timestamp) return 'timestamp:' + input.timestamp;
  if (input.row && !Array.isArray(input.row) && input.row['Marca temporal']) {
    return 'timestamp:' + input.row['Marca temporal'];
  }
  return FdF_hash_('google:' + FdF_canonicalJson_(input));
}

function FdF_googleDocumentsFromRow_(rowObject, config) {
  const documents = [];
  const map = config.google_sheet_column_map || {};
  Object.keys(rowObject || {}).forEach(header => {
    const code = map[header];
    if (code !== 'FDF-17' && code !== 'FDF-27') return;
    const value = rowObject[header];
    if (!FdF_hasValue_(value)) return;

    const documentType = code === 'FDF-17'
      ? FDF_DOCUMENT_TYPES.CARTA_AVAL
      : FDF_DOCUMENT_TYPES.CURRICULUM_VITAE;
    String(value).split(/,\s*/).map(item => item.trim()).filter(Boolean).forEach((reference, index) => {
      documents.push({
        document_type: documentType,
        original_name: FdF_documentOriginalName_(reference, documentType, index),
        storage_reference: reference,
        received_at: rowObject['Marca temporal'] || '',
        status: 'RECEIVED',
      });
    });
  });
  return documents;
}

function FdF_documentOriginalName_(reference, documentType, index) {
  const clean = String(reference || '').trim();
  if (!clean) {
    return documentType.toLowerCase() + '-' + (index + 1);
  }
  const parts = clean.split(/[\\/]/);
  return parts[parts.length - 1] || clean;
}

function FdF_isBlankRow_(row) {
  return (row || []).every(value => !FdF_hasValue_(value));
}

function FdF_importSummary_(repository, persisted) {
  return {
    persisted,
    candidates: repository.candidates.length,
    submissions: repository.submissions.length,
    raw_records: repository.submissionRaws.length,
    documents: repository.documents.length,
    normalization_issues: repository.normalizationIssues.length,
    duplicate_reviews: repository.duplicateReviews.length,
    eligibility_assessments: repository.eligibilityAssessments.length,
    audit_events: repository.auditEvents.length,
  };
}

function FdF_validateResponses_(responses, config, documents) {
  const fields = config.fields || [];
  const fieldsByCode = {};
  fields.forEach(field => fieldsByCode[field.code] = field);

  const issues = [];
  const normalized = {};
  const source = responses || {};
  const docs = documents || [];

  Object.keys(source).forEach(code => {
    const field = fieldsByCode[code];
    if (!field) {
      issues.push({
        field_code: code,
        code: 'FIELD_UNKNOWN',
        severity: 'ERROR',
        message: 'Unknown field code: ' + code,
      });
      return;
    }

    const value = FdF_normalizeValue_(source[code], field, issues);
    normalized[code] = value;
  });

  fields.forEach(field => {
    if (!field.required) return;
    const value = normalized[field.code];
    if (FdF_hasValue_(value)) return;
    if (field.type === 'Carga de archivo' && FdF_hasRequiredDocument_(field.code, docs)) return;
    issues.push({
      field_code: field.code,
      code: 'REQUIRED_MISSING',
      severity: 'ERROR',
      message: 'Required field is missing: ' + field.code,
    });
  });

  return { responses: normalized, issues };
}

function FdF_normalizeValue_(rawValue, field, issues) {
  if (field.type === 'Casillas') {
    const values = Array.isArray(rawValue)
      ? rawValue.map(v => String(v).trim()).filter(Boolean)
      : String(rawValue || '').split(/[;,]/).map(v => v.trim()).filter(Boolean);
    FdF_validateOptions_(field, values, issues);
    return values;
  }

  const value = String(rawValue == null ? '' : rawValue).trim();
  if (field.type === 'Opción múltiple') {
    FdF_validateOptions_(field, value ? [value] : [], issues);
  }
  return value;
}

function FdF_validateOptions_(field, values, issues) {
  const allowed = field.options || [];
  values.forEach(value => {
    if (allowed.indexOf(value) === -1) {
      issues.push({
        field_code: field.code,
        code: 'INVALID_OPTION',
        severity: 'ERROR',
        message: 'Invalid option for ' + field.code + ': ' + value,
      });
    }
  });
}

function FdF_hasRequiredDocument_(fieldCode, documents) {
  const expected = fieldCode === 'FDF-17'
    ? FDF_DOCUMENT_TYPES.CARTA_AVAL
    : fieldCode === 'FDF-27'
      ? FDF_DOCUMENT_TYPES.CURRICULUM_VITAE
      : '';
  return !!expected && documents.some(doc => doc.document_type === expected);
}

function FdF_candidateFingerprint_(responses) {
  const documentId = FdF_normalizeIdentity_(responses['FDF-05']);
  if (documentId) return 'doc|' + documentId;
  return [
    'weak',
    FdF_normalizeIdentity_(responses['FDF-01']),
    FdF_normalizeIdentity_(responses['FDF-03']),
    FdF_normalizeIdentity_(responses['FDF-04']),
    FdF_normalizeIdentity_(responses['FDF-07']),
  ].join('|');
}

function FdF_candidateFromResponses_(candidateId, responses, receivedAt) {
  return {
    candidate_id: candidateId,
    first_name: responses['FDF-01'] || '',
    second_name: responses['FDF-02'] || '',
    first_surname: responses['FDF-03'] || '',
    second_surname: responses['FDF-04'] || '',
    identification_number: responses['FDF-05'] || '',
    email: responses['FDF-07'] || '',
    province: responses['FDF-09'] || '',
    created_at: receivedAt,
    updated_at: receivedAt,
  };
}

function FdF_detectDuplicateReview_(repo, candidate, submission, sourceChannel, actor) {
  repo.candidates.forEach(other => {
    if (other.candidate_id === candidate.candidate_id) return;

    const sameEmail = FdF_normalizeIdentity_(other.email) &&
      FdF_normalizeIdentity_(other.email) === FdF_normalizeIdentity_(candidate.email);
    const sameNameProvince = FdF_normalizeIdentity_(other.first_name) === FdF_normalizeIdentity_(candidate.first_name) &&
      FdF_normalizeIdentity_(other.first_surname) === FdF_normalizeIdentity_(candidate.first_surname) &&
      FdF_normalizeIdentity_(other.second_surname) === FdF_normalizeIdentity_(candidate.second_surname) &&
      FdF_normalizeIdentity_(other.province) === FdF_normalizeIdentity_(candidate.province);

    if (!sameEmail && !sameNameProvince) return;

    const duplicateReview = {
      duplicate_review_id: FdF_hash_('duplicate|' + candidate.candidate_id + '|' + other.candidate_id),
      candidate_id: candidate.candidate_id,
      possible_candidate_id: other.candidate_id,
      submission_id: submission.submission_id,
      status: 'PENDING_REVIEW',
      reason: sameEmail ? 'SAME_EMAIL_DIFFERENT_IDENTITY' : 'SAME_NAME_AND_PROVINCE',
      created_at: FdF_nowIso_(),
    };
    if (!repo.duplicateReviews.some(d => d.duplicate_review_id === duplicateReview.duplicate_review_id)) {
      repo.duplicateReviews.push(duplicateReview);
      FdF_audit_(repo, {
        action: 'DUPLICATE_REVIEW_CREATED',
        entityType: 'DuplicateReview',
        entityId: duplicateReview.duplicate_review_id,
        sourceChannel,
        actor,
        newValue: {
          candidate_id: duplicateReview.candidate_id,
          possible_candidate_id: duplicateReview.possible_candidate_id,
          reason: duplicateReview.reason,
        },
      });
    }
  });
}

function FdF_associateDocuments_(repo, documents, candidateId, sourceChannel, receivedAt, actor) {
  (documents || []).forEach(doc => {
    const documentId = doc.document_id || FdF_hash_([
      'document',
      candidateId,
      doc.document_type,
      doc.original_name || '',
      doc.storage_reference || '',
    ].join('|'));
    if (repo.documents.some(existing => existing.document_id === documentId)) return;

    const documentRecord = {
      document_id: documentId,
      candidate_id: candidateId,
      document_type: doc.document_type,
      source_channel: sourceChannel,
      original_name: doc.original_name || '',
      storage_reference: doc.storage_reference || '',
      received_at: doc.received_at || receivedAt,
      status: doc.status || 'RECEIVED',
    };
    repo.documents.push(documentRecord);
    FdF_audit_(repo, {
      action: 'DOCUMENT_ASSOCIATED',
      entityType: 'Document',
      entityId: documentId,
      sourceChannel,
      actor,
      newValue: {
        document_type: documentRecord.document_type,
        storage_reference: documentRecord.storage_reference,
        status: documentRecord.status,
      },
    });
  });
}

function FdF_assessCandidateEligibility(candidateId, eligibilityConfig, repository, options) {
  const repo = repository;
  const opts = options || {};
  const candidate = repo.candidates.find(c => c.candidate_id === candidateId);
  if (!candidate) {
    throw new Error('Candidate not found: ' + candidateId);
  }

  const responses = FdF_latestResponsesByCandidate_(repo, candidateId);
  const documents = repo.documents.filter(doc => doc.candidate_id === candidateId);
  const checkResults = (eligibilityConfig.checks || []).map(check => (
    FdF_runEligibilityCheck_(check, responses, documents)
  ));

  const hasBlockingFail = checkResults.some(result =>
    result.status === 'FAIL' && result.severity === 'BLOCKING'
  );
  const hasReviewFail = checkResults.some(result =>
    result.status === 'FAIL' && result.severity === 'MANUAL_REVIEW'
  );
  const configuredStatuses = eligibilityConfig.statuses || {};
  const status = hasBlockingFail
    ? (configuredStatuses.blocked || 'BLOCKED_BY_MISSING_REQUIREMENTS')
    : hasReviewFail
      ? (configuredStatuses.requires_review || 'REQUIRES_MANUAL_REVIEW')
      : (configuredStatuses.ready || 'READY_FOR_TECHNICAL_REVIEW');

  const assessment = {
    eligibility_assessment_id: FdF_hash_('eligibility|' + candidateId + '|' + FdF_canonicalJson_(checkResults)),
    candidate_id: candidateId,
    assessment_scope: eligibilityConfig.assessment_scope || 'PRELIMINARY_OPERATIONAL_READINESS',
    rule_version: eligibilityConfig.schema_version || '',
    status,
    check_results: checkResults,
    assessed_at: opts.assessedAt || FdF_nowIso_(),
    assessed_by: opts.actor || 'ELIGIBILITY_ASSESSOR',
  };

  const existingIndex = repo.eligibilityAssessments.findIndex(item =>
    item.eligibility_assessment_id === assessment.eligibility_assessment_id
  );
  if (existingIndex === -1) {
    repo.eligibilityAssessments.push(assessment);
  } else {
    repo.eligibilityAssessments[existingIndex] = assessment;
  }

  FdF_audit_(repo, {
    action: 'ELIGIBILITY_ASSESSED',
    entityType: 'EligibilityAssessment',
    entityId: assessment.eligibility_assessment_id,
    sourceChannel: '',
    actor: assessment.assessed_by,
    newValue: {
      candidate_id: assessment.candidate_id,
      status: assessment.status,
      rule_version: assessment.rule_version,
    },
  });

  return assessment;
}

function FdF_runEligibilityCheck_(check, responses, documents) {
  let pass = false;
  let observed = null;

  if (check.type === 'FIELD_EQUALS') {
    observed = responses[check.field_code];
    pass = FdF_normalizeIdentity_(observed) === FdF_normalizeIdentity_(check.expected);
  } else if (check.type === 'FIELD_NOT_EQUALS') {
    observed = responses[check.field_code];
    pass = FdF_hasValue_(observed) &&
      FdF_normalizeIdentity_(observed) !== FdF_normalizeIdentity_(check.not_expected);
  } else if (check.type === 'DOCUMENT_PRESENT') {
    const accepted = check.accepted_statuses || ['RECEIVED'];
    const doc = documents.find(item =>
      item.document_type === check.document_type &&
      accepted.indexOf(item.status) !== -1
    );
    observed = doc ? { document_type: doc.document_type, status: doc.status } : null;
    pass = !!doc;
  } else {
    observed = 'Unsupported check type: ' + check.type;
    pass = false;
  }

  return {
    check_id: check.check_id,
    type: check.type,
    severity: check.severity || 'BLOCKING',
    status: pass ? 'PASS' : 'FAIL',
    field_code: check.field_code || '',
    document_type: check.document_type || '',
    observed,
    expected: check.expected || check.not_expected || check.document_type || '',
    description: check.description || '',
  };
}

function FdF_latestResponsesByCandidate_(repo, candidateId) {
  const responses = {};
  repo.candidateResponses
    .filter(response => response.candidate_id === candidateId)
    .forEach(response => {
      responses[response.field_code] = response.value;
    });
  return responses;
}

function FdF_createSheetPersistencePlan(repository) {
  const repo = repository;
  return {
    '02_Postulantes': {
      headers: [
        'candidate_id',
        'first_name',
        'second_name',
        'first_surname',
        'second_surname',
        'identification_number',
        'email',
        'province',
        'created_at',
        'updated_at',
      ],
      rows: repo.candidates.map(candidate => [
        candidate.candidate_id,
        candidate.first_name,
        candidate.second_name,
        candidate.first_surname,
        candidate.second_surname,
        candidate.identification_number,
        candidate.email,
        candidate.province,
        candidate.created_at,
        candidate.updated_at,
      ]),
    },
    '03_Admisibilidad': {
      headers: [
        'eligibility_assessment_id',
        'candidate_id',
        'assessment_scope',
        'rule_version',
        'status',
        'check_results_json',
        'assessed_at',
        'assessed_by',
      ],
      rows: repo.eligibilityAssessments.map(assessment => [
        assessment.eligibility_assessment_id,
        assessment.candidate_id,
        assessment.assessment_scope,
        assessment.rule_version,
        assessment.status,
        FdF_canonicalJson_(assessment.check_results),
        assessment.assessed_at,
        assessment.assessed_by,
      ]),
    },
    '12_Log': {
      headers: [
        'audit_event_id',
        'action',
        'entity_type',
        'entity_id',
        'occurred_at',
        'source_channel',
        'actor',
        'previous_value_json',
        'new_value_json',
        'reason',
      ],
      rows: repo.auditEvents.map(event => [
        event.audit_event_id,
        event.action,
        event.entity_type,
        event.entity_id,
        event.occurred_at,
        event.source_channel,
        event.actor,
        event.previous_value ? FdF_canonicalJson_(event.previous_value) : '',
        event.new_value ? FdF_canonicalJson_(event.new_value) : '',
        event.reason,
      ]),
    },
    '18_Submissions_RAW': {
      headers: [
        'submission_raw_id',
        'submission_id',
        'source_channel',
        'raw_hash',
        'raw_payload_json',
        'received_at',
      ],
      rows: repo.submissionRaws.map(raw => [
        raw.submission_raw_id,
        raw.submission_id,
        raw.source_channel,
        raw.raw_hash,
        FdF_canonicalJson_(raw.raw_payload),
        raw.received_at,
      ]),
    },
    '19_Candidate_Responses': {
      headers: [
        'candidate_response_id',
        'candidate_id',
        'submission_id',
        'field_code',
        'value_json',
      ],
      rows: repo.candidateResponses.map(response => [
        response.candidate_response_id,
        response.candidate_id,
        response.submission_id,
        response.field_code,
        FdF_canonicalJson_(response.value),
      ]),
    },
    '20_Documentos': {
      headers: [
        'document_id',
        'candidate_id',
        'document_type',
        'source_channel',
        'original_name',
        'storage_reference',
        'received_at',
        'status',
      ],
      rows: repo.documents.map(documentRecord => [
        documentRecord.document_id,
        documentRecord.candidate_id,
        documentRecord.document_type,
        documentRecord.source_channel,
        documentRecord.original_name,
        documentRecord.storage_reference,
        documentRecord.received_at,
        documentRecord.status,
      ]),
    },
    '21_Normalization_Issues': {
      headers: [
        'normalization_issue_id',
        'submission_id',
        'candidate_id',
        'field_code',
        'code',
        'severity',
        'message',
        'created_at',
      ],
      rows: repo.normalizationIssues.map(issue => [
        issue.normalization_issue_id,
        issue.submission_id,
        issue.candidate_id,
        issue.field_code,
        issue.code,
        issue.severity,
        issue.message,
        issue.created_at,
      ]),
    },
    '22_Duplicate_Review': {
      headers: [
        'duplicate_review_id',
        'candidate_id',
        'possible_candidate_id',
        'submission_id',
        'status',
        'reason',
        'created_at',
      ],
      rows: repo.duplicateReviews.map(review => [
        review.duplicate_review_id,
        review.candidate_id,
        review.possible_candidate_id,
        review.submission_id,
        review.status,
        review.reason,
        review.created_at,
      ]),
    },
  };
}

function FdF_persistRepositoryToSpreadsheet(spreadsheet, repository) {
  const plan = FdF_createSheetPersistencePlan(repository);
  Object.keys(plan).forEach(sheetName => {
    const sheet = FdF_getOrCreateSheet_(spreadsheet, sheetName);
    const table = plan[sheetName];
    sheet.clearContents();
    const values = [table.headers].concat(table.rows);
    if (values.length > 0 && values[0].length > 0) {
      sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    }
  });
  return plan;
}

function FdF_getOrCreateSheet_(spreadsheet, sheetName) {
  const existing = spreadsheet.getSheetByName(sheetName);
  return existing || spreadsheet.insertSheet(sheetName);
}

function FdF_audit_(repo, event) {
  repo.auditEvents.push({
    audit_event_id: FdF_hash_('audit|' + repo.auditEvents.length + '|' + FdF_canonicalJson_(event)),
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId,
    occurred_at: FdF_nowIso_(),
    source_channel: event.sourceChannel || '',
    actor: event.actor || 'SYSTEM',
    previous_value: event.previousValue || null,
    new_value: event.newValue || null,
    reason: event.reason || '',
  });
}

function FdF_hasValue_(value) {
  return Array.isArray(value) ? value.length > 0 : String(value == null ? '' : value).trim() !== '';
}

function FdF_normalizeIdentity_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function FdF_canonicalJson_(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(FdF_canonicalJson_).join(',') + ']';
  }
  return '{' + Object.keys(value).sort().map(key => (
    JSON.stringify(key) + ':' + FdF_canonicalJson_(value[key])
  )).join(',') + '}';
}

function FdF_clone_(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function FdF_hash_(value) {
  const input = String(value);
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 'fdf_' + (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function FdF_nowIso_() {
  return new Date().toISOString();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FDF_SOURCE_CHANNELS,
    FDF_DOCUMENT_TYPES,
    FdF_createIngestionRepository,
    FdF_importGoogleSubmission,
    FdF_importOfflineJson,
    FdF_registerOfflineManual,
    FdF_importGoogleResponsesFromSpreadsheet,
    FdF_publicConfigFromSpreadsheet,
    FdF_defaultEligibilityBaselineConfig,
    FdF_assessCandidateEligibility,
    FdF_createSheetPersistencePlan,
    FdF_persistRepositoryToSpreadsheet,
    FdF_hash_,
    FdF_canonicalJson_,
  };
}
