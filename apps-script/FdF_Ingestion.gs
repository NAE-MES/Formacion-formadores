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
    FdF_hash_,
    FdF_canonicalJson_,
  };
}
