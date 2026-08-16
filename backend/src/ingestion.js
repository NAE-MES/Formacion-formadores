const crypto = require('node:crypto');

const SOURCE_CHANNELS = Object.freeze({
  GOOGLE_FORM: 'GOOGLE_FORM',
  OFFLINE_JSON: 'OFFLINE_JSON',
});

const DOCUMENT_TYPES = Object.freeze({
  CARTA_AVAL: 'CARTA_AVAL',
  CURRICULUM_VITAE: 'CURRICULUM_VITAE',
  FORMULARIO_OFFLINE: 'FORMULARIO_OFFLINE',
});

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(',')}}`;
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeIdentity(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function hasValue(value) {
  return Array.isArray(value)
    ? value.length > 0
    : String(value ?? '').trim() !== '';
}

function importGoogleFormSubmission(payload, config) {
  const responses = payload.responses || payload.respuestas || {};
  return importSubmission({
    sourceChannel: SOURCE_CHANNELS.GOOGLE_FORM,
    sourceReference: payload.sourceReference || payload.responseId || payload.eventId || '',
    receivedAt: payload.receivedAt || payload.submittedAt || new Date().toISOString(),
    actor: payload.actor || 'GOOGLE_FORM_WEBHOOK',
    rawPayload: payload,
    responses,
    documents: payload.documents || [],
  }, config);
}

function importOfflineJsonSubmission(payload, config) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return rejectedImport(SOURCE_CHANNELS.OFFLINE_JSON, '', payload, 'INVALID_STRUCTURE', 'Offline JSON payload must be an object.');
  }
  if (payload.schema !== config.publicSchema.offline_json_schema) {
    return rejectedImport(
      SOURCE_CHANNELS.OFFLINE_JSON,
      '',
      payload,
      'UNKNOWN_SCHEMA_VERSION',
      `Unsupported offline JSON schema: ${String(payload.schema || '')}`,
    );
  }
  if (!payload.respuestas || typeof payload.respuestas !== 'object' || Array.isArray(payload.respuestas)) {
    return rejectedImport(SOURCE_CHANNELS.OFFLINE_JSON, '', payload, 'INVALID_STRUCTURE', 'Offline JSON must include respuestas as an object.');
  }

  return importSubmission({
    sourceChannel: SOURCE_CHANNELS.OFFLINE_JSON,
    sourceReference: payload.sourceReference || hash(`offline-json:${canonicalJson(payload)}`),
    receivedAt: payload.receivedAt || payload.exportedAt || new Date().toISOString(),
    actor: payload.actor || 'OFFLINE_JSON_API',
    rawPayload: payload,
    responses: payload.respuestas,
    documents: payload.documents || [],
  }, config);
}

function importSubmission(input, config) {
  const rawCanonical = canonicalJson(input.rawPayload);
  const submissionId = `sub_${hash(`${input.sourceChannel}|${input.sourceReference}|${rawCanonical}`)}`;
  const validation = validateResponses(input.responses, config.publicSchema, input.documents);
  const candidateId = `cand_${hash(`candidate|${candidateFingerprint(validation.responses)}`)}`;
  const receivedAt = input.receivedAt || new Date().toISOString();
  const now = new Date().toISOString();

  const candidate = {
    candidate_id: candidateId,
    first_name: validation.responses['FDF-01'] || '',
    second_name: validation.responses['FDF-02'] || '',
    first_surname: validation.responses['FDF-03'] || '',
    second_surname: validation.responses['FDF-04'] || '',
    identification_number: validation.responses['FDF-05'] || '',
    email: validation.responses['FDF-07'] || '',
    province: validation.responses['FDF-09'] || '',
    created_at: receivedAt,
    updated_at: now,
  };

  const submission = {
    submission_id: submissionId,
    candidate_id: candidateId,
    source_channel: input.sourceChannel,
    source_reference: input.sourceReference,
    received_at: receivedAt,
    normalization_status: validation.issues.length ? 'WITH_ISSUES' : 'NORMALIZED',
    created_at: now,
    updated_at: now,
  };

  const raw = {
    submission_raw_id: `raw_${hash(`raw|${submissionId}`)}`,
    submission_id: submissionId,
    source_channel: input.sourceChannel,
    raw_payload: input.rawPayload,
    raw_hash: hash(rawCanonical),
    received_at: receivedAt,
  };

  const responses = Object.keys(validation.responses).sort().map(code => ({
    candidate_response_id: `resp_${hash(`response|${submissionId}|${code}`)}`,
    candidate_id: candidateId,
    submission_id: submissionId,
    field_code: code,
    value: validation.responses[code],
  }));

  const documents = normalizeDocuments(input.documents || [], candidateId, input.sourceChannel, receivedAt);
  const issues = validation.issues.map(issue => ({
    normalization_issue_id: `issue_${hash(`issue|${submissionId}|${issue.code}|${issue.field_code}|${issue.message}`)}`,
    submission_id: submissionId,
    candidate_id: candidateId,
    field_code: issue.field_code,
    code: issue.code,
    severity: issue.severity || 'ERROR',
    message: issue.message,
    created_at: now,
  }));

  return {
    status: issues.some(issue => issue.severity === 'ERROR') ? 'IMPORTED_WITH_ISSUES' : 'IMPORTED',
    candidate,
    submission,
    raw,
    responses,
    documents,
    issues,
    auditEvents: [
      auditEvent('SUBMISSION_IMPORTED', 'Submission', submissionId, input.sourceChannel, input.actor, {
        candidate_id: candidateId,
        normalization_status: submission.normalization_status,
      }),
      ...documents.map(document => auditEvent('DOCUMENT_ASSOCIATED', 'Document', document.document_id, input.sourceChannel, input.actor, {
        document_type: document.document_type,
        storage_reference: document.storage_reference,
        status: document.status,
      })),
      ...issues.map(issue => auditEvent('NORMALIZATION_ISSUE_RECORDED', 'NormalizationIssue', issue.normalization_issue_id, input.sourceChannel, input.actor, {
        code: issue.code,
        field_code: issue.field_code,
      })),
    ],
  };
}

function rejectedImport(sourceChannel, sourceReference, rawPayload, code, message) {
  const effectiveSourceReference = sourceReference || hash(`rejected:${sourceChannel}:${canonicalJson(rawPayload)}`);
  const now = new Date().toISOString();
  const submissionId = `sub_${hash(`${sourceChannel}|${effectiveSourceReference}|${canonicalJson(rawPayload)}`)}`;
  const issue = {
    normalization_issue_id: `issue_${hash(`issue|${submissionId}|${code}`)}`,
    submission_id: submissionId,
    candidate_id: '',
    field_code: '',
    code,
    severity: 'ERROR',
    message,
    created_at: now,
  };
  return {
    status: 'REJECTED',
    submission_id: submissionId,
    submission: {
      submission_id: submissionId,
      candidate_id: null,
      source_channel: sourceChannel,
      source_reference: effectiveSourceReference,
      received_at: now,
      normalization_status: 'REJECTED',
      created_at: now,
      updated_at: now,
    },
    raw: {
      submission_raw_id: `raw_${hash(`raw|${submissionId}`)}`,
      submission_id: submissionId,
      source_channel: sourceChannel,
      raw_payload: rawPayload,
      raw_hash: hash(canonicalJson(rawPayload)),
      received_at: now,
    },
    issues: [issue],
    auditEvents: [
      auditEvent('NORMALIZATION_ISSUE_RECORDED', 'NormalizationIssue', issue.normalization_issue_id, sourceChannel, 'API_VALIDATOR', {
        code,
      }),
    ],
  };
}

function validateResponses(responses, publicSchema, documents) {
  const fields = publicSchema.fields || [];
  const fieldsByCode = Object.fromEntries(fields.map(field => [field.code, field]));
  const normalized = {};
  const issues = [];

  for (const [code, rawValue] of Object.entries(responses || {})) {
    const field = fieldsByCode[code];
    if (!field) {
      issues.push({
        field_code: code,
        code: 'FIELD_UNKNOWN',
        severity: 'ERROR',
        message: `Unknown field code: ${code}`,
      });
      continue;
    }
    normalized[code] = normalizeValue(rawValue, field, issues);
  }

  for (const field of fields) {
    if (!field.required) continue;
    const value = normalized[field.code];
    if (hasValue(value)) continue;
    if (field.type === 'Carga de archivo' && hasRequiredDocument(field.code, documents || [])) continue;
    issues.push({
      field_code: field.code,
      code: 'REQUIRED_MISSING',
      severity: 'ERROR',
      message: `Required field is missing: ${field.code}`,
    });
  }

  return { responses: normalized, issues };
}

function normalizeValue(rawValue, field, issues) {
  if (field.type === 'Casillas') {
    const values = Array.isArray(rawValue)
      ? rawValue.map(value => String(value).trim()).filter(Boolean)
      : String(rawValue || '').split(/[;,]/).map(value => value.trim()).filter(Boolean);
    validateOptions(field, values, issues);
    return values;
  }

  const value = String(rawValue ?? '').trim();
  if (field.type === 'Opción múltiple') validateOptions(field, value ? [value] : [], issues);
  return value;
}

function validateOptions(field, values, issues) {
  const allowed = field.options || [];
  for (const value of values) {
    if (!allowed.includes(value)) {
      issues.push({
        field_code: field.code,
        code: 'INVALID_OPTION',
        severity: 'ERROR',
        message: `Invalid option for ${field.code}: ${value}`,
      });
    }
  }
}

function hasRequiredDocument(fieldCode, documents) {
  const expected = fieldCode === 'FDF-17'
    ? DOCUMENT_TYPES.CARTA_AVAL
    : fieldCode === 'FDF-27'
      ? DOCUMENT_TYPES.CURRICULUM_VITAE
      : '';
  return !!expected && documents.some(document => document.document_type === expected);
}

function candidateFingerprint(responses) {
  const documentId = normalizeIdentity(responses['FDF-05']);
  if (documentId) return `doc|${documentId}`;
  return [
    'weak',
    normalizeIdentity(responses['FDF-01']),
    normalizeIdentity(responses['FDF-03']),
    normalizeIdentity(responses['FDF-04']),
    normalizeIdentity(responses['FDF-07']),
  ].join('|');
}

function normalizeDocuments(documents, candidateId, sourceChannel, receivedAt) {
  return documents.map(document => ({
    document_id: document.document_id || `doc_${hash([
      'document',
      candidateId,
      document.document_type,
      document.original_name || '',
      document.storage_reference || '',
    ].join('|'))}`,
    candidate_id: candidateId,
    document_type: document.document_type,
    source_channel: sourceChannel,
    original_name: document.original_name || '',
    storage_reference: document.storage_reference || '',
    received_at: document.received_at || receivedAt,
    status: document.status || 'RECEIVED',
  }));
}

function auditEvent(action, entityType, entityId, sourceChannel, actor, newValue) {
  return {
    audit_event_id: `audit_${hash(`${action}|${entityType}|${entityId}|${canonicalJson(newValue || {})}`)}`,
    action,
    entity_type: entityType,
    entity_id: entityId,
    occurred_at: new Date().toISOString(),
    source_channel: sourceChannel || '',
    actor: actor || 'API',
    previous_value: null,
    new_value: newValue || null,
    reason: '',
  };
}

module.exports = {
  SOURCE_CHANNELS,
  DOCUMENT_TYPES,
  canonicalJson,
  hash,
  importGoogleFormSubmission,
  importOfflineJsonSubmission,
  validateResponses,
};
