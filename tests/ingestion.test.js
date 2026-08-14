const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const ingestionSource = fs.readFileSync(path.join(root, 'apps-script', 'FdF_Ingestion.gs'), 'utf8');
const sandbox = {
  module: { exports: {} },
  console,
  Date,
  JSON,
  Object,
  String,
  Array,
  Math,
};
vm.createContext(sandbox);
vm.runInContext(ingestionSource, sandbox, { filename: 'FdF_Ingestion.gs' });

const ingestion = sandbox.module.exports;
const config = JSON.parse(fs.readFileSync(path.join(root, 'config', 'fdf-2026-public-schema.json'), 'utf8'));
const eligibilityConfig = JSON.parse(fs.readFileSync(
  path.join(root, 'config', 'fdf-2026-eligibility-baseline.json'),
  'utf8',
));

function validResponses(overrides = {}) {
  const responses = {};
  for (const field of config.fields) {
    if (field.type === 'Carga de archivo') {
      responses[field.code] = '';
    } else if (field.type === 'Casillas') {
      responses[field.code] = field.options.length ? [field.options[0]] : ['Dato sintetico'];
    } else if (field.type === 'Opción múltiple') {
      responses[field.code] = field.options[0];
    } else if (field.required) {
      responses[field.code] = syntheticText(field.code);
    } else {
      responses[field.code] = '';
    }
  }

  responses['FDF-01'] = 'Ana';
  responses['FDF-02'] = 'Maria';
  responses['FDF-03'] = 'Perez';
  responses['FDF-04'] = 'Lopez';
  responses['FDF-05'] = 'SYN-0001';
  responses['FDF-06'] = '+5350000000';
  responses['FDF-07'] = 'ana.perez@example.test';
  responses['FDF-09'] = 'Holguín';

  return { ...responses, ...overrides };
}

function syntheticText(code) {
  return `Dato sintetico ${code}`;
}

function requiredDocuments() {
  return [
    {
      document_type: ingestion.FDF_DOCUMENT_TYPES.CARTA_AVAL,
      original_name: 'carta-aval-sintetica.pdf',
      storage_reference: 'drive://synthetic/carta-aval',
      received_at: '2026-08-13T10:00:00.000Z',
      status: 'RECEIVED',
    },
    {
      document_type: ingestion.FDF_DOCUMENT_TYPES.CURRICULUM_VITAE,
      original_name: 'cv-sintetico.pdf',
      storage_reference: 'drive://synthetic/cv',
      received_at: '2026-08-13T10:00:00.000Z',
      status: 'RECEIVED',
    },
  ];
}

function googleRowFromResponses(responses) {
  const row = { 'Marca temporal': '2026-08-13T10:00:00.000Z' };
  for (const [header, code] of Object.entries(config.google_sheet_column_map)) {
    if (code && code !== '__timestamp') {
      row[header] = responses[code];
    }
  }
  return row;
}

function fakeSpreadsheetWithRows(responseRows) {
  const publicHeaders = [
    'Código',
    'Sección',
    'Título de sección',
    'Pregunta visible',
    'Tipo en Google Forms',
    'Opciones visibles',
    'Obligatoria',
    'Nota técnica NO visible',
  ];
  const publicRows = config.fields.map(field => [
    field.code,
    field.section,
    field.section_title,
    field.question,
    field.type,
    field.options.join('; '),
    field.required ? 'Sí' : 'No',
    field.technical_note || '',
  ]);
  const responseHeaders = Object.keys(config.google_sheet_column_map);
  const responseValues = responseRows.map(row => responseHeaders.map(header => row[header] || ''));

  return new FakeSpreadsheet({
    '13_Formulario_Publico': [publicHeaders, ...publicRows],
    '01_Esquema_Respuestas': [responseHeaders, ...responseValues],
  });
}

class FakeSpreadsheet {
  constructor(sheets) {
    this.sheets = {};
    for (const [name, values] of Object.entries(sheets)) {
      this.sheets[name] = new FakeSheet(name, values);
    }
  }

  getSheetByName(name) {
    return this.sheets[name] || null;
  }

  insertSheet(name) {
    const sheet = new FakeSheet(name, []);
    this.sheets[name] = sheet;
    return sheet;
  }
}

class FakeSheet {
  constructor(name, values) {
    this.name = name;
    this.values = values.map(row => row.slice());
    this.cleared = false;
  }

  getDataRange() {
    return {
      getValues: () => this.values.map(row => row.slice()),
    };
  }

  getLastColumn() {
    return this.values[0] ? this.values[0].length : 0;
  }

  getRange(row, col, numRows, numCols) {
    return {
      getValues: () => this.values
        .slice(row - 1, row - 1 + numRows)
        .map(current => current.slice(col - 1, col - 1 + numCols)),
      setValues: (newValues) => {
        for (let r = 0; r < newValues.length; r++) {
          const targetRow = row - 1 + r;
          if (!this.values[targetRow]) this.values[targetRow] = [];
          for (let c = 0; c < newValues[r].length; c++) {
            this.values[targetRow][col - 1 + c] = newValues[r][c];
          }
        }
      },
    };
  }

  clearContents() {
    this.values = [];
    this.cleared = true;
  }
}

test('imports a valid Google Forms/Sheets response', () => {
  const repo = ingestion.FdF_createIngestionRepository();
  const responses = validResponses();
  const result = ingestion.FdF_importGoogleSubmission({
    row: googleRowFromResponses(responses),
    sourceReference: 'google-row-1',
    receivedAt: '2026-08-13T10:00:00.000Z',
    documents: requiredDocuments(),
  }, config, repo);

  assert.equal(result.status, 'IMPORTED');
  assert.equal(repo.candidates.length, 1);
  assert.equal(repo.submissions.length, 1);
  assert.equal(repo.submissionRaws.length, 1);
  assert.equal(repo.documents.length, 2);
  assert.equal(repo.normalizationIssues.length, 0);
});

test('imports a valid offline JSON payload', () => {
  const repo = ingestion.FdF_createIngestionRepository();
  const payload = {
    schema: 'FDF-2026-OFFLINE-1',
    exportedAt: '2026-08-13T10:00:00.000Z',
    respuestas: validResponses(),
  };

  const result = ingestion.FdF_importOfflineJson(payload, config, repo, {
    documents: requiredDocuments(),
  });

  assert.equal(result.status, 'IMPORTED');
  assert.equal(result.submission.source_channel, ingestion.FDF_SOURCE_CHANNELS.OFFLINE_JSON);
  assert.deepEqual(repo.submissionRaws[0].raw_payload, payload);
});

test('registers an offline manual submission', () => {
  const repo = ingestion.FdF_createIngestionRepository();
  const result = ingestion.FdF_registerOfflineManual({
    sourceReference: 'correo-fdf-001',
    receivedAt: '2026-08-13T10:00:00.000Z',
    responses: validResponses(),
    documents: [
      ...requiredDocuments(),
      {
        document_type: ingestion.FDF_DOCUMENT_TYPES.FORMULARIO_OFFLINE,
        original_name: 'formulario-offline-sintetico.pdf',
        storage_reference: 'mail://synthetic/formulario',
        received_at: '2026-08-13T10:00:00.000Z',
        status: 'RECEIVED',
      },
    ],
  }, config, repo);

  assert.equal(result.status, 'IMPORTED');
  assert.equal(repo.documents.length, 3);
});

test('normalizes equivalent data from all channels into the same candidate model', () => {
  const responses = validResponses();
  const docs = requiredDocuments();
  const googleRepo = ingestion.FdF_createIngestionRepository();
  const jsonRepo = ingestion.FdF_createIngestionRepository();
  const manualRepo = ingestion.FdF_createIngestionRepository();

  const google = ingestion.FdF_importGoogleSubmission({
    row: googleRowFromResponses(responses),
    sourceReference: 'google-row-1',
    documents: docs,
  }, config, googleRepo);
  const offlineJson = ingestion.FdF_importOfflineJson({
    schema: 'FDF-2026-OFFLINE-1',
    exportedAt: '2026-08-13T10:00:00.000Z',
    respuestas: responses,
  }, config, jsonRepo, { documents: docs });
  const manual = ingestion.FdF_registerOfflineManual({
    sourceReference: 'correo-fdf-001',
    responses,
    documents: docs,
  }, config, manualRepo);

  assert.equal(google.candidate.candidate_id, offlineJson.candidate.candidate_id);
  assert.equal(offlineJson.candidate.candidate_id, manual.candidate.candidate_id);
  assert.equal(google.candidate.first_name, 'Ana');
  assert.equal(google.candidate.first_surname, 'Perez');
  assert.equal(google.candidate.second_surname, 'Lopez');
  assert.equal(google.candidate.identification_number, 'SYN-0001');
  assert.equal(google.candidate.email, 'ana.perez@example.test');
  assert.equal(google.candidate.province, 'Holguín');
});

test('rejects and records unknown offline JSON schema version', () => {
  const repo = ingestion.FdF_createIngestionRepository();
  const result = ingestion.FdF_importOfflineJson({
    schema: 'FDF-2025-OFFLINE-0',
    exportedAt: '2026-08-13T10:00:00.000Z',
    respuestas: validResponses(),
  }, config, repo);

  assert.equal(result.status, 'REJECTED');
  assert.equal(repo.submissionRaws.length, 1);
  assert.equal(repo.normalizationIssues[0].code, 'UNKNOWN_SCHEMA_VERSION');
  assert.equal(repo.submissions.length, 0);
});

test('detects unknown fields', () => {
  const repo = ingestion.FdF_createIngestionRepository();
  const responses = validResponses({ 'FDF-999': 'No oficial' });
  const result = ingestion.FdF_registerOfflineManual({
    sourceReference: 'correo-fdf-unknown-field',
    responses,
    documents: requiredDocuments(),
  }, config, repo);

  assert.equal(result.status, 'IMPORTED_WITH_ISSUES');
  assert.ok(result.issues.some(issue => issue.code === 'FIELD_UNKNOWN'));
});

test('detects invalid option values', () => {
  const repo = ingestion.FdF_createIngestionRepository();
  const responses = validResponses({ 'FDF-13': 'INAENE' });
  const result = ingestion.FdF_registerOfflineManual({
    sourceReference: 'correo-fdf-invalid-option',
    responses,
    documents: requiredDocuments(),
  }, config, repo);

  assert.equal(result.status, 'IMPORTED_WITH_ISSUES');
  assert.ok(result.issues.some(issue => issue.code === 'INVALID_OPTION' && issue.field_code === 'FDF-13'));
});

test('reimporting the same response is idempotent', () => {
  const repo = ingestion.FdF_createIngestionRepository();
  const payload = {
    schema: 'FDF-2026-OFFLINE-1',
    exportedAt: '2026-08-13T10:00:00.000Z',
    respuestas: validResponses(),
  };
  const options = { sourceReference: 'offline-json-1', documents: requiredDocuments() };

  const first = ingestion.FdF_importOfflineJson(payload, config, repo, options);
  const second = ingestion.FdF_importOfflineJson(payload, config, repo, options);

  assert.equal(first.status, 'IMPORTED');
  assert.equal(second.status, 'REIMPORTED');
  assert.equal(repo.candidates.length, 1);
  assert.equal(repo.submissions.length, 1);
});

test('detects possible duplicate between channels without auto-merge', () => {
  const repo = ingestion.FdF_createIngestionRepository();
  ingestion.FdF_importGoogleSubmission({
    row: googleRowFromResponses(validResponses({ 'FDF-05': 'SYN-0001' })),
    sourceReference: 'google-row-1',
    documents: requiredDocuments(),
  }, config, repo);

  const result = ingestion.FdF_importOfflineJson({
    schema: 'FDF-2026-OFFLINE-1',
    exportedAt: '2026-08-13T11:00:00.000Z',
    respuestas: validResponses({ 'FDF-05': 'SYN-0002' }),
  }, config, repo, {
    sourceReference: 'offline-json-2',
    documents: requiredDocuments(),
  });

  assert.equal(result.status, 'IMPORTED');
  assert.equal(repo.candidates.length, 2);
  assert.equal(repo.duplicateReviews.length, 1);
  assert.equal(repo.duplicateReviews[0].status, 'PENDING_REVIEW');
});

test('preserves RAW, associates documents and records normalization issues', () => {
  const repo = ingestion.FdF_createIngestionRepository();
  const rawPayload = {
    schema: 'FDF-2026-OFFLINE-1',
    exportedAt: '2026-08-13T10:00:00.000Z',
    respuestas: validResponses({ 'FDF-08': 'Region inventada' }),
  };

  const result = ingestion.FdF_importOfflineJson(rawPayload, config, repo, {
    sourceReference: 'offline-json-raw',
    documents: requiredDocuments(),
  });

  assert.equal(result.status, 'IMPORTED_WITH_ISSUES');
  assert.deepEqual(repo.submissionRaws[0].raw_payload, rawPayload);
  assert.equal(repo.documents.length, 2);
  assert.ok(repo.normalizationIssues.some(issue => issue.code === 'INVALID_OPTION'));
  assert.ok(repo.auditEvents.some(event => event.action === 'DOCUMENT_ASSOCIATED'));
  assert.ok(repo.auditEvents.some(event => event.action === 'NORMALIZATION_ISSUE_RECORDED'));
});

test('assesses candidate as ready for technical review when baseline checks pass', () => {
  const repo = ingestion.FdF_createIngestionRepository();
  const result = ingestion.FdF_importOfflineJson({
    schema: 'FDF-2026-OFFLINE-1',
    exportedAt: '2026-08-13T10:00:00.000Z',
    respuestas: validResponses(),
  }, config, repo, {
    sourceReference: 'offline-json-ready',
    documents: requiredDocuments(),
  });

  const assessment = ingestion.FdF_assessCandidateEligibility(
    result.candidate.candidate_id,
    eligibilityConfig,
    repo,
    { actor: 'UNIT_TEST' },
  );

  assert.equal(assessment.status, 'READY_FOR_TECHNICAL_REVIEW');
  assert.equal(assessment.check_results.every(check => check.status === 'PASS'), true);
  assert.ok(repo.auditEvents.some(event => event.action === 'ELIGIBILITY_ASSESSED'));
});

test('blocks preliminary eligibility when required documents are missing', () => {
  const repo = ingestion.FdF_createIngestionRepository();
  const result = ingestion.FdF_importOfflineJson({
    schema: 'FDF-2026-OFFLINE-1',
    exportedAt: '2026-08-13T10:00:00.000Z',
    respuestas: validResponses(),
  }, config, repo, {
    sourceReference: 'offline-json-missing-docs',
    documents: [],
  });

  const assessment = ingestion.FdF_assessCandidateEligibility(
    result.candidate.candidate_id,
    eligibilityConfig,
    repo,
  );

  assert.equal(assessment.status, 'BLOCKED_BY_MISSING_REQUIREMENTS');
  assert.ok(assessment.check_results.some(check =>
    check.check_id === 'CARTA_AVAL_RECEIVED' && check.status === 'FAIL'
  ));
  assert.ok(assessment.check_results.some(check =>
    check.check_id === 'CURRICULUM_RECEIVED' && check.status === 'FAIL'
  ));
});

test('marks institutional link negative answer for manual review without final rejection', () => {
  const repo = ingestion.FdF_createIngestionRepository();
  const result = ingestion.FdF_importOfflineJson({
    schema: 'FDF-2026-OFFLINE-1',
    exportedAt: '2026-08-13T10:00:00.000Z',
    respuestas: validResponses({
      'FDF-18': 'No acredito vínculo institucional activo con una estructura de apoyo a NAE',
    }),
  }, config, repo, {
    sourceReference: 'offline-json-review',
    documents: requiredDocuments(),
  });

  const assessment = ingestion.FdF_assessCandidateEligibility(
    result.candidate.candidate_id,
    eligibilityConfig,
    repo,
  );

  assert.equal(assessment.status, 'REQUIRES_MANUAL_REVIEW');
  assert.ok(assessment.check_results.some(check =>
    check.check_id === 'INSTITUTIONAL_LINK_REVIEW' &&
    check.status === 'FAIL' &&
    check.severity === 'MANUAL_REVIEW'
  ));
});

test('creates a Google Sheets persistence plan without losing RAW or documents', () => {
  const repo = ingestion.FdF_createIngestionRepository();
  const result = ingestion.FdF_importOfflineJson({
    schema: 'FDF-2026-OFFLINE-1',
    exportedAt: '2026-08-13T10:00:00.000Z',
    respuestas: validResponses(),
  }, config, repo, {
    sourceReference: 'offline-json-persistence',
    documents: requiredDocuments(),
  });
  ingestion.FdF_assessCandidateEligibility(result.candidate.candidate_id, eligibilityConfig, repo);

  const plan = ingestion.FdF_createSheetPersistencePlan(repo);

  assert.ok(plan['02_Postulantes']);
  assert.ok(plan['03_Admisibilidad']);
  assert.ok(plan['18_Submissions_RAW']);
  assert.ok(plan['20_Documentos']);
  assert.equal(plan['02_Postulantes'].rows.length, 1);
  assert.equal(plan['18_Submissions_RAW'].rows.length, 1);
  assert.equal(plan['20_Documentos'].rows.length, 2);
  assert.equal(plan['03_Admisibilidad'].rows[0][4], 'READY_FOR_TECHNICAL_REVIEW');
});

test('loads public config from spreadsheet and imports Google rows without persisting in preview mode', () => {
  const row = googleRowFromResponses(validResponses({
    'FDF-17': 'https://drive.example.test/carta.pdf',
    'FDF-27': 'https://drive.example.test/cv.pdf',
  }));
  const spreadsheet = fakeSpreadsheetWithRows([row]);

  const loadedConfig = ingestion.FdF_publicConfigFromSpreadsheet(spreadsheet);
  const result = ingestion.FdF_importGoogleResponsesFromSpreadsheet(spreadsheet, {
    persist: false,
    eligibilityConfig,
  });

  assert.equal(loadedConfig.fields.length, 43);
  assert.equal(result.summary.persisted, false);
  assert.equal(result.summary.candidates, 1);
  assert.equal(result.summary.documents, 2);
  assert.equal(spreadsheet.getSheetByName('18_Submissions_RAW'), null);
});

test('persists imported Google rows into operational sheets when explicitly requested', () => {
  const row = googleRowFromResponses(validResponses({
    'FDF-17': 'https://drive.example.test/carta.pdf',
    'FDF-27': 'https://drive.example.test/cv.pdf',
  }));
  const spreadsheet = fakeSpreadsheetWithRows([row]);

  const result = ingestion.FdF_importGoogleResponsesFromSpreadsheet(spreadsheet, {
    persist: true,
    eligibilityConfig,
  });

  assert.equal(result.summary.persisted, true);
  assert.ok(spreadsheet.getSheetByName('02_Postulantes'));
  assert.ok(spreadsheet.getSheetByName('03_Admisibilidad'));
  assert.ok(spreadsheet.getSheetByName('18_Submissions_RAW'));
  assert.ok(spreadsheet.getSheetByName('20_Documentos'));
  assert.equal(spreadsheet.getSheetByName('02_Postulantes').values.length, 2);
  assert.equal(spreadsheet.getSheetByName('20_Documentos').values.length, 3);
});
