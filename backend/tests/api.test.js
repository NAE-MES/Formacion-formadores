const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { createApp } = require('../src/app');
const { MemoryRepository } = require('../src/repositories/memoryRepository');

const root = path.resolve(__dirname, '..', '..');
const publicSchema = JSON.parse(fs.readFileSync(path.join(root, 'config', 'fdf-2026-public-schema.json'), 'utf8'));
const eligibilityConfig = JSON.parse(fs.readFileSync(path.join(root, 'config', 'fdf-2026-eligibility-baseline.json'), 'utf8'));
const evaluationConfig = JSON.parse(fs.readFileSync(path.join(root, 'config', 'fdf-2026-evaluation-baseline.json'), 'utf8'));
const selectionPolicy = JSON.parse(fs.readFileSync(path.join(root, 'config', 'fdf-2026-selection-policy.json'), 'utf8'));

function validResponses(overrides = {}) {
  const responses = {};
  for (const field of publicSchema.fields) {
    if (field.type === 'Carga de archivo') {
      responses[field.code] = '';
    } else if (field.type === 'Casillas') {
      responses[field.code] = field.options.length ? [field.options[0]] : ['Dato sintetico'];
    } else if (field.type === 'Opción múltiple') {
      responses[field.code] = field.options[0];
    } else if (field.required) {
      responses[field.code] = `Dato sintetico ${field.code}`;
    } else {
      responses[field.code] = '';
    }
  }

  return {
    ...responses,
    'FDF-01': 'Ana',
    'FDF-03': 'Perez',
    'FDF-04': 'Lopez',
    'FDF-05': 'SYN-0001',
    'FDF-06': '+5350000000',
    'FDF-07': 'ana.perez@example.test',
    'FDF-09': 'Holguín',
    ...overrides,
  };
}

function requiredDocuments() {
  return [
    {
      document_type: 'CARTA_AVAL',
      original_name: 'carta-aval-sintetica.pdf',
      storage_reference: 'drive://synthetic/carta-aval',
      status: 'RECEIVED',
    },
    {
      document_type: 'CURRICULUM_VITAE',
      original_name: 'cv-sintetico.pdf',
      storage_reference: 'drive://synthetic/cv',
      status: 'RECEIVED',
    },
  ];
}

async function withServer(t, handler, configOverrides = {}) {
  const repository = new MemoryRepository();
  const config = {
    apiToken: 'test-token',
    adminToken: 'admin-token',
    publicSchema,
    eligibilityConfig,
    evaluationConfig,
    selectionPolicy,
    ...configOverrides,
  };
  const app = createApp({ config, repository });
  await repository.ensureBootstrapAdminUser({
    username: 'admin',
    password: 'admin-password',
    role: 'ADMIN',
  });
  await new Promise(resolve => app.listen(0, resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const port = app.address().port;
  return handler({ port, repository });
}

function request(port, method, url, body, token = 'test-token') {
  return requestWithHeaders(port, method, url, body, {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });
}

function requestWithHeaders(port, method, url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request({
      port,
      method,
      path: url,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        ...extraHeaders,
      },
    }, res => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: responseBody ? JSON.parse(responseBody) : null,
      }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function rawRequestWithHeaders(port, method, url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request({
      port,
      method,
      path: url,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        'content-length': Buffer.byteLength(payload),
        ...extraHeaders,
      },
    }, res => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: responseBody,
      }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function adminRequest(port, method, url, token = 'admin-token') {
  return request(port, method, url, undefined, token);
}

function adminRawRequest(port, method, url, token = 'admin-token') {
  return rawRequestWithHeaders(port, method, url, undefined, {
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  });
}

function adminJsonRequest(port, method, url, body, token = 'admin-token') {
  return request(port, method, url, body, token);
}

async function loginCookie(port, username, password) {
  const login = await request(port, 'POST', '/api/auth/login', { username, password }, '');
  assert.equal(login.statusCode, 200);
  return login.headers['set-cookie'][0].split(';')[0];
}

test('health endpoint works without auth', async (t) => {
  await withServer(t, async ({ port }) => {
    const response = await request(port, 'GET', '/health', undefined, '');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, 'ok');
  });
});

test('serves dedicated login, home stats page and protects admin console', async (t) => {
  await withServer(t, async ({ port }) => {
    const root = await adminRawRequest(port, 'GET', '/', '');
    assert.equal(root.statusCode, 302);
    assert.equal(root.headers.location, '/login');

    const loginPage = await adminRawRequest(port, 'GET', '/login', '');
    assert.equal(loginPage.statusCode, 200);
    assert.match(loginPage.body, /Acceso al sistema/);

    const homeWithoutSession = await adminRawRequest(port, 'GET', '/home', '');
    assert.equal(homeWithoutSession.statusCode, 302);
    assert.equal(homeWithoutSession.headers.location, '/login');

    const cookie = await loginCookie(port, 'admin', 'admin-password');
    const home = await rawRequestWithHeaders(port, 'GET', '/home', undefined, { cookie });
    assert.equal(home.statusCode, 200);
    assert.match(home.body, /Resumen de postulaciones/);

    const admin = await rawRequestWithHeaders(port, 'GET', '/admin', undefined, { cookie });
    assert.equal(admin.statusCode, 200);
    assert.match(admin.body, /Sistema de postulaciones/);

    const expedienteList = await rawRequestWithHeaders(port, 'GET', '/admin/expedientes', undefined, { cookie });
    assert.equal(expedienteList.statusCode, 200);
    assert.match(expedienteList.body, /Expedientes/);

    const expedienteDetailRoute = await rawRequestWithHeaders(port, 'GET', '/admin/expedientes/submission_synthetic', undefined, { cookie });
    assert.equal(expedienteDetailRoute.statusCode, 200);
    assert.match(expedienteDetailRoute.body, /Expedientes/);

    await adminJsonRequest(port, 'POST', '/api/admin/users', {
      username: 'viewer-home',
      password: 'viewer-password',
      role: 'VIEWER',
    });
    const viewerCookie = await loginCookie(port, 'viewer-home', 'viewer-password');
    const viewerAdmin = await rawRequestWithHeaders(port, 'GET', '/admin', undefined, { cookie: viewerCookie });
    assert.equal(viewerAdmin.statusCode, 302);
    assert.equal(viewerAdmin.headers.location, '/home');
  });
});

test('home stats API exposes aggregate data only for the lowest access role', async (t) => {
  await withServer(t, async ({ port }) => {
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-home-1',
      receivedAt: '2026-08-16T10:00:00.000Z',
      responses: validResponses({ 'FDF-09': 'Holguín' }),
      documents: requiredDocuments(),
    });
    await request(port, 'POST', '/api/submissions/offline-json', {
      schema: 'FDF-2026-OFFLINE-1',
      exportedAt: '2026-08-16T11:00:00.000Z',
      sourceReference: 'offline-json-home-1',
      receivedAt: '2026-08-17T09:00:00.000Z',
      respuestas: validResponses({ 'FDF-05': 'SYN-0002', 'FDF-07': 'otra.persona@example.test', 'FDF-09': 'Santiago de Cuba' }),
      documents: requiredDocuments(),
    });
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-home-havana-boundary',
      receivedAt: '2026-08-20T03:40:00.000Z',
      responses: validResponses({ 'FDF-05': 'SYN-0003', 'FDF-07': 'noche.habana@example.test', 'FDF-09': 'La Habana' }),
      documents: requiredDocuments(),
    });
    await adminJsonRequest(port, 'POST', '/api/admin/users', {
      username: 'viewer-stats',
      password: 'viewer-password',
      role: 'VIEWER',
    });

    const cookie = await loginCookie(port, 'viewer-stats', 'viewer-password');
    const response = await requestWithHeaders(port, 'GET', '/api/home/stats', undefined, { cookie });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.totals.submissions, 3);
    assert.equal(response.body.by_day.length, 3);
    assert.equal(response.body.by_week.length, 2);
    assert.deepEqual(
      response.body.by_day.map(item => item.key),
      ['2026-08-16', '2026-08-17', '2026-08-19'],
    );
    assert.ok(!response.body.by_day.some(item => item.key === '2026-08-20'));
    assert.equal(typeof response.body.operational.critical_pending, 'number');
    assert.equal(typeof response.body.progress.percent_completed, 'number');
    assert.deepEqual(response.body.by_source.map(item => item.key).sort(), ['GOOGLE_FORM', 'OFFLINE_JSON']);
    assert.equal(response.body.executive_report, undefined);
    const serialized = JSON.stringify(response.body);
    assert.doesNotMatch(serialized, /Ana|Perez|ana\.perez@example\.test|SYN-0001/);

    const adminResponse = await adminRequest(port, 'GET', '/api/home/stats');
    assert.equal(adminResponse.statusCode, 200);
    assert.match(adminResponse.body.executive_report.report_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(adminResponse.body.executive_report.headline.accumulated_submissions, 3);
    assert.equal(adminResponse.body.executive_report.candidates.length, 3);
    assert.ok(adminResponse.body.executive_report.candidates[0].submission_id);
    assert.ok(adminResponse.body.executive_report.recent_by_day.some(item => item.key === '2026-08-19'));

    const pdf = await adminRawRequest(port, 'GET', '/api/home/executive-report.pdf');
    assert.equal(pdf.statusCode, 200);
    assert.equal(pdf.headers['content-type'], 'application/pdf');
    assert.match(pdf.headers['content-disposition'], /attachment; filename="fdf-2026-reporte-ejecutivo-/);
    assert.match(pdf.body.slice(0, 8), /%PDF-1\.4/);

    const viewerPdf = await rawRequestWithHeaders(port, 'GET', '/api/home/executive-report.pdf', undefined, { cookie });
    assert.equal(viewerPdf.statusCode, 403);
  });
});

test('rejects missing bearer token for ingestion endpoints', async (t) => {
  await withServer(t, async ({ port }) => {
    const response = await request(port, 'POST', '/api/submissions/google-form', {}, '');
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.error, 'UNAUTHORIZED');
  });
});

test('rejects invalid bearer token for ingestion endpoints', async (t) => {
  await withServer(t, async ({ port }) => {
    const response = await request(port, 'POST', '/api/submissions/google-form', {}, 'wrong-token');
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.error, 'UNAUTHORIZED');
  });
});

test('fails closed when API token is not configured', async (t) => {
  await withServer(t, async ({ port }) => {
    const response = await request(port, 'POST', '/api/submissions/google-form', {}, 'any-token');
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.error, 'SERVER_MISCONFIGURED');
  }, { apiToken: '' });
});

test('rejects admin API without admin token', async (t) => {
  await withServer(t, async ({ port }) => {
    const response = await adminRequest(port, 'GET', '/api/admin/submissions', '');
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.error, 'UNAUTHORIZED');
  });
});

test('rejects admin API without session when emergency token is not configured', async (t) => {
  await withServer(t, async ({ port }) => {
    const response = await adminRequest(port, 'GET', '/api/admin/submissions', 'admin-token');
    assert.equal(response.statusCode, 401);
    assert.equal(response.body.error, 'UNAUTHORIZED');
  }, { adminToken: '' });
});

test('admin login creates http-only session cookie and supports me/logout', async (t) => {
  await withServer(t, async ({ port }) => {
    const login = await request(port, 'POST', '/api/auth/login', {
      username: 'admin',
      password: 'admin-password',
    }, '');
    assert.equal(login.statusCode, 200);
    assert.equal(login.body.user.username, 'admin');
    assert.match(String(login.headers['set-cookie']), /HttpOnly/);
    assert.match(String(login.headers['set-cookie']), /SameSite=Lax/);

    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const me = await requestWithHeaders(port, 'GET', '/api/auth/me', undefined, { cookie });
    assert.equal(me.statusCode, 200);
    assert.equal(me.body.user.role, 'ADMIN');

    const list = await requestWithHeaders(port, 'GET', '/api/admin/submissions', undefined, { cookie });
    assert.equal(list.statusCode, 200);

    const logout = await requestWithHeaders(port, 'POST', '/api/auth/logout', undefined, { cookie });
    assert.equal(logout.statusCode, 200);

    const afterLogout = await requestWithHeaders(port, 'GET', '/api/auth/me', undefined, { cookie });
    assert.equal(afterLogout.statusCode, 401);
  }, { adminToken: '' });
});

test('admin login rejects invalid credentials', async (t) => {
  await withServer(t, async ({ port }) => {
    const login = await request(port, 'POST', '/api/auth/login', {
      username: 'admin',
      password: 'wrong-password',
    }, '');
    assert.equal(login.statusCode, 401);
    assert.equal(login.body.error, 'UNAUTHORIZED');
  });
});

test('admin API manages users and enforces admin-only user management', async (t) => {
  await withServer(t, async ({ port }) => {
    const created = await adminJsonRequest(port, 'POST', '/api/admin/users', {
      username: 'reviewer',
      password: 'reviewer-password',
      role: 'REVIEWER',
    });
    assert.equal(created.statusCode, 201);
    assert.equal(created.body.user.username, 'reviewer');
    assert.equal(created.body.user.role, 'REVIEWER');
    assert.equal(created.body.user.password_hash, undefined);

    const reviewerCookie = await loginCookie(port, 'reviewer', 'reviewer-password');
    const forbidden = await requestWithHeaders(port, 'GET', '/api/admin/users', undefined, { cookie: reviewerCookie });
    assert.equal(forbidden.statusCode, 403);

    const updated = await adminJsonRequest(port, 'PATCH', '/api/admin/users/reviewer', {
      role: 'VIEWER',
      active: false,
    });
    assert.equal(updated.statusCode, 200);
    assert.equal(updated.body.user.role, 'VIEWER');
    assert.equal(updated.body.user.active, false);
  });
});

test('role permissions separate intake and review operations', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const adminCookie = await loginCookie(port, 'admin', 'admin-password');
    const created = await requestWithHeaders(port, 'POST', '/api/admin/users', {
      username: 'intake',
      password: 'intake-password',
      role: 'INTAKE',
    }, { cookie: adminCookie, 'content-type': 'application/json' });
    assert.equal(created.statusCode, 201);
    const intakeCookie = await loginCookie(port, 'intake', 'intake-password');

    const imported = await requestWithHeaders(port, 'POST', '/api/admin/submissions/offline-manual', {
      sourceReference: 'role-intake-manual',
      responses: validResponses(),
      documents: requiredDocuments(),
    }, { cookie: intakeCookie, 'content-type': 'application/json' });
    assert.equal(imported.statusCode, 201);
    assert.equal(imported.body.status, 'IMPORTED');

    const documentId = Array.from(repository.documents.values())[0].document_id;
    const forbidden = await requestWithHeaders(port, 'PATCH', `/api/admin/documents/${documentId}/status`, {
      status: 'VALIDATED',
    }, { cookie: intakeCookie, 'content-type': 'application/json' });
    assert.equal(forbidden.statusCode, 403);
  }, { adminToken: '' });
});

test('admin API exposes evaluation criteria catalog', async (t) => {
  await withServer(t, async ({ port }) => {
    const response = await adminRequest(port, 'GET', '/api/admin/evaluation/criteria');

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.schema_version, 'FDF-2026-EVALUATION-BASELINE-1');
    assert.equal(response.body.criteria.length, 4);
    assert.ok(response.body.criteria.some(item => item.criterion_id === 'TRAINING_AND_TECHNICAL_CAPACITY'));
  });
});

test('ingests Google Form API payload and preserves raw data', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const payload = {
      sourceReference: 'google-response-1',
      responses: validResponses(),
      documents: requiredDocuments(),
    };
    const response = await request(port, 'POST', '/api/submissions/google-form', payload);

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.status, 'IMPORTED');
    assert.equal(repository.candidates.size, 1);
    assert.equal(repository.raws.size, 1);
    assert.equal(repository.documents.size, 2);
    assert.equal(repository.eligibilityAssessments.size, 1);
    assert.equal(Array.from(repository.eligibilityAssessments.values())[0].status, 'READY_FOR_TECHNICAL_REVIEW');
  });
});

test('allows Google Form submission without carta aval and keeps eligibility ready', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const response = await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-without-carta-aval',
      responses: {
        ...validResponses(),
        'FDF-17': '',
        'FDF-27': 'drive://synthetic/cv',
      },
      documents: [requiredDocuments()[1]],
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.status, 'IMPORTED');
    assert.equal(response.body.eligibility_status, 'READY_FOR_TECHNICAL_REVIEW');
    assert.equal(repository.documents.size, 1);
    assert.equal(repository.issues.size, 0);

    const assessment = Array.from(repository.eligibilityAssessments.values())[0];
    const cartaCheck = assessment.check_results.find(check => check.check_id === 'CARTA_AVAL_RECEIVED');
    const cvCheck = assessment.check_results.find(check => check.check_id === 'CURRICULUM_RECEIVED');
    assert.equal(cartaCheck.status, 'FAIL');
    assert.equal(cartaCheck.severity, 'INFO');
    assert.equal(cvCheck.status, 'PASS');
  });
});

test('automatic technical scoring applies Anexo 1 closed-response rules', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-auto-scoring',
      responses: validResponses({ 'FDF-35': 'Hombre' }),
      documents: requiredDocuments(),
    });
    const submissionId = Array.from(repository.submissions.values())[0].submission_id;

    const detail = await adminRequest(port, 'GET', `/api/admin/submissions/${submissionId}`);
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.body.criterion_evaluations.length, 4);
    assert.equal(detail.body.evaluation_result.status, 'COMPLETED');
    assert.equal(detail.body.evaluation_result.total_score, 99.25);

    const inclusion = detail.body.criterion_evaluations.find(item => item.criterion_id === 'INCLUSION_GENDER_SUSTAINABILITY');
    assert.equal(inclusion.score, 85);
    assert.match(inclusion.evidence_summary, /Representación de mujeres: 5\/10/);

    const recalculated = await adminJsonRequest(
      port,
      'POST',
      `/api/admin/submissions/${submissionId}/evaluation/auto-score`,
      {},
    );
    assert.equal(recalculated.statusCode, 200);
    assert.equal(recalculated.body.evaluation_result.total_score, 99.25);
  });
});

test('reviewer validates automatic technical evaluation result', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const created = await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-technical-validation',
      receivedAt: '2026-08-16T10:00:00.000Z',
      responses: validResponses(),
      documents: requiredDocuments(),
    });
    assert.equal(created.statusCode, 201);
    const submissionId = Array.from(repository.submissions.values())[0].submission_id;

    const detail = await adminRequest(port, 'GET', `/api/admin/submissions/${submissionId}`);
    const evaluationResultId = detail.body.evaluation_result.evaluation_result_id;
    assert.equal(detail.body.evaluation_result.validation_status, 'PENDING_TECHNICAL_VALIDATION');

    const validated = await adminJsonRequest(port, 'PATCH', `/api/admin/evaluation-results/${evaluationResultId}/validation`, {
      status: 'VALIDATED_BY_TECHNICAL_TEAM',
      note: 'Cálculo revisado con respuestas cerradas del Anexo 1.',
    });
    assert.equal(validated.statusCode, 200);
    assert.equal(validated.body.evaluation_result.validation_status, 'VALIDATED_BY_TECHNICAL_TEAM');
    assert.equal(validated.body.evaluation_result.validation_note, 'Cálculo revisado con respuestas cerradas del Anexo 1.');
    assert.ok(validated.body.evaluation_result.validated_at);
    assert.equal(validated.body.evaluation_result.validated_by, 'ADMIN_TOKEN');

    const updatedDetail = await adminRequest(port, 'GET', `/api/admin/submissions/${submissionId}`);
    assert.equal(updatedDetail.body.evaluation_result.validation_status, 'VALIDATED_BY_TECHNICAL_TEAM');
    assert.ok(updatedDetail.body.audit_events.some(event => event.action === 'EVALUATION_TECHNICAL_VALIDATION_UPDATED'));
  });
});

test('technical validation rejects invalid status and intake role', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const created = await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-technical-validation-permissions',
      receivedAt: '2026-08-16T10:00:00.000Z',
      responses: validResponses(),
      documents: requiredDocuments(),
    });
    assert.equal(created.statusCode, 201);
    const submissionId = Array.from(repository.submissions.values())[0].submission_id;

    const detail = await adminRequest(port, 'GET', `/api/admin/submissions/${submissionId}`);
    const evaluationResultId = detail.body.evaluation_result.evaluation_result_id;

    const invalid = await adminJsonRequest(port, 'PATCH', `/api/admin/evaluation-results/${evaluationResultId}/validation`, {
      status: 'APPROVED_FOR_RANKING',
    });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.body.error, 'INVALID_EVALUATION_VALIDATION_STATUS');

    await adminJsonRequest(port, 'POST', '/api/admin/users', {
      username: 'intake-validation',
      password: 'intake-password',
      role: 'INTAKE',
    });
    const cookie = await loginCookie(port, 'intake-validation', 'intake-password');
    const forbidden = await requestWithHeaders(port, 'PATCH', `/api/admin/evaluation-results/${evaluationResultId}/validation`, {
      status: 'VALIDATED_BY_TECHNICAL_TEAM',
    }, { cookie });
    assert.equal(forbidden.statusCode, 403);
  });
});

test('admin API exposes non binding preliminary ranking', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-ranking-validated',
      receivedAt: '2026-08-16T10:00:00.000Z',
      responses: validResponses({
        'FDF-01': 'Carla',
        'FDF-05': 'SYN-RANK-1',
        'FDF-07': 'carla.ranking@example.test',
        'FDF-12': 'Centro Provincial Sintético',
        'FDF-13': 'Universidad',
        'FDF-35': 'Hombre',
      }),
      documents: requiredDocuments(),
    });
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-ranking-pending',
      receivedAt: '2026-08-16T11:00:00.000Z',
      responses: validResponses({
        'FDF-01': 'Beatriz',
        'FDF-05': 'SYN-RANK-2',
        'FDF-07': 'beatriz.ranking@example.test',
        'FDF-12': 'Institución Sintética',
        'FDF-13': 'Gobierno provincial',
        'FDF-35': 'Mujer',
      }),
      documents: requiredDocuments(),
    });
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-ranking-after-cutoff',
      receivedAt: '2026-08-27T10:00:00.000-04:00',
      responses: validResponses({
        'FDF-01': 'Diana',
        'FDF-05': 'SYN-RANK-3',
        'FDF-07': 'diana.ranking@example.test',
        'FDF-12': 'Institución Posterior',
        'FDF-13': 'Gobierno provincial',
        'FDF-35': 'Mujer',
      }),
      documents: requiredDocuments(),
    });

    const submissions = Array.from(repository.submissions.values());
    const validatedSubmission = submissions.find(item => item.source_reference === 'google-response-ranking-validated');
    const validatedDetail = await adminRequest(port, 'GET', `/api/admin/submissions/${validatedSubmission.submission_id}`);
    await adminJsonRequest(port, 'PATCH', `/api/admin/evaluation-results/${validatedDetail.body.evaluation_result.evaluation_result_id}/validation`, {
      status: 'VALIDATED_BY_TECHNICAL_TEAM',
      note: 'Validado para ranking preliminar.',
    });

    const ranking = await adminRequest(port, 'GET', '/api/admin/preliminary-ranking');
    assert.equal(ranking.statusCode, 200);
    assert.equal(ranking.body.rows.length, 3);
    assert.equal(ranking.body.rows[0].full_name, 'Beatriz Perez Lopez');
    assert.equal(ranking.body.rows[0].preliminary_position, 1);
    assert.equal(ranking.body.rows[0].included_in_preliminary_ranking, false);
    assert.match(ranking.body.rows[0].exclusion_reason, /no validada/i);
    const included = ranking.body.rows.find(row => row.full_name === 'Carla Perez Lopez');
    assert.equal(included.preliminary_position, 2);
    assert.equal(included.included_in_preliminary_ranking, true);
    assert.match(included.evaluation_result_id, /^er_/);
    assert.equal(included.institution, 'Centro Provincial Sintético');
    assert.equal(included.gender, 'Hombre');
    const afterCutoff = ranking.body.rows.find(row => row.full_name === 'Diana Perez Lopez');
    assert.equal(afterCutoff.received_after_cutoff, true);
    assert.equal(afterCutoff.preliminary_position, null);
    assert.equal(afterCutoff.included_in_preliminary_ranking, false);
    assert.match(afterCutoff.exclusion_reason, /corte operativo/i);

    const csv = await adminRawRequest(port, 'GET', '/api/admin/preliminary-ranking.csv');
    assert.equal(csv.statusCode, 200);
    assert.match(csv.body, /ranking_cutoff_date,received_after_cutoff/);
    assert.match(csv.body, /Carla Perez Lopez/);

    const proposal = await adminJsonRequest(port, 'PATCH', '/api/admin/proposal-entries/bulk', {
      evaluation_result_ids: [included.evaluation_result_id],
      proposal_status: 'PROPOSED',
      note: 'Propuesta sintética para revisión.',
    });
    assert.equal(proposal.statusCode, 200);
    assert.equal(proposal.body.entries[0].proposal_status, 'PROPOSED');

    const updatedRanking = await adminRequest(port, 'GET', '/api/admin/preliminary-ranking');
    assert.equal(updatedRanking.body.rows.find(row => row.full_name === 'Carla Perez Lopez').proposal_status, 'PROPOSED');

    const rankingPdf = await adminRawRequest(port, 'GET', '/api/admin/preliminary-ranking.pdf');
    assert.equal(rankingPdf.statusCode, 200);
    assert.equal(rankingPdf.headers['content-type'], 'application/pdf');
    assert.match(rankingPdf.body.slice(0, 8), /%PDF-1\.4/);

    const proposalPdf = await adminRawRequest(port, 'GET', '/api/admin/proposal-summary.pdf');
    assert.equal(proposalPdf.statusCode, 200);
    assert.equal(proposalPdf.headers['content-type'], 'application/pdf');
    assert.match(proposalPdf.body.slice(0, 8), /%PDF-1\.4/);
  });
});

test('admin API analyzes provincial selection policy without final approval', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const syntheticRows = [
      ['Ana', 'SYN-POL-1', 'ana.policy@example.test', 'Municipio Uno', 'Institucion Uno'],
      ['Berta', 'SYN-POL-2', 'berta.policy@example.test', 'Municipio Uno', 'Institucion Dos'],
      ['Clara', 'SYN-POL-3', 'clara.policy@example.test', 'Municipio Uno', 'Institucion Tres'],
      ['Diana', 'SYN-POL-4', 'diana.policy@example.test', 'Municipio Dos', 'Institucion Cuatro'],
      ['Elena', 'SYN-POL-5', 'elena.policy@example.test', 'Municipio Tres', 'Institucion Cinco'],
    ];

    for (const [name, id, email, municipality, institution] of syntheticRows) {
      const response = await request(port, 'POST', '/api/submissions/google-form', {
        sourceReference: `google-response-policy-${id}`,
        receivedAt: '2026-08-16T10:00:00.000Z',
        responses: validResponses({
          'FDF-01': name,
          'FDF-05': id,
          'FDF-07': email,
          'FDF-08': 'Oriente',
          'FDF-09': 'Granma',
          'FDF-10': municipality,
          'FDF-12': institution,
        }),
        documents: requiredDocuments(),
      });
      assert.equal(response.statusCode, 201);
    }

    for (const submission of repository.submissions.values()) {
      const detail = await adminRequest(port, 'GET', `/api/admin/submissions/${submission.submission_id}`);
      await adminJsonRequest(port, 'PATCH', `/api/admin/evaluation-results/${detail.body.evaluation_result.evaluation_result_id}/validation`, {
        status: 'VALIDATED_BY_TECHNICAL_TEAM',
        note: 'Validado para analisis de politica provincial.',
      });
    }

    const analysis = await adminRequest(port, 'GET', '/api/admin/selection-policy-analysis');
    assert.equal(analysis.statusCode, 200);
    assert.equal(analysis.body.policy.quota_per_province, 4);
    assert.equal(analysis.body.policy.max_per_municipality, 2);
    assert.equal(analysis.body.summary.eligible_for_policy, 5);
    assert.equal(analysis.body.summary.recommended_proposed, 4);
    assert.equal(analysis.body.summary.recommended_reserve, 1);
    const clara = analysis.body.rows.find(row => row.full_name === 'Clara Perez Lopez');
    assert.equal(clara.policy_recommendation, 'POLICY_RESERVE');
    assert.match(clara.policy_recommendation_label, /municipal/i);
    assert.equal(clara.proposal_status, 'NOT_PROPOSED');
    assert.equal(clara.region, 'Oriente');

    const csv = await adminRawRequest(port, 'GET', '/api/admin/selection-policy-analysis.csv');
    assert.equal(csv.statusCode, 200);
    assert.match(csv.body, /policy_recommendation/);
    assert.match(csv.body, /POLICY_RESERVE/);

    const pdf = await adminRawRequest(port, 'GET', '/api/admin/selection-policy-analysis.pdf');
    assert.equal(pdf.statusCode, 200);
    assert.equal(pdf.headers['content-type'], 'application/pdf');
    assert.match(pdf.body.slice(0, 8), /%PDF-1\.4/);

    const excel = await adminRawRequest(port, 'GET', '/api/admin/selection-policy-analysis.xls');
    assert.equal(excel.statusCode, 200);
    assert.match(excel.headers['content-type'], /application\/vnd\.ms-excel/);
    assert.match(excel.body, /<Workbook/);
    assert.match(excel.body, /ss:Name="Resumen provincias"/);
    assert.match(excel.body, /ss:Name="Para decidir"/);
    assert.match(excel.body, /ss:Name="Region Oriente"/);
    assert.match(excel.body, /ss:Name="Prov Granma"/);
    assert.match(excel.body, /Decision ET/);
    assert.match(excel.body, /Oriente/);
  });
});

test('admin API lists and returns submission detail', async (t) => {
  await withServer(t, async ({ port }) => {
    const payload = {
      sourceReference: 'google-response-admin-view',
      responses: validResponses(),
      documents: requiredDocuments(),
    };
    const imported = await request(port, 'POST', '/api/submissions/google-form', payload);
    assert.equal(imported.statusCode, 201);

    const list = await adminRequest(port, 'GET', '/api/admin/submissions');
    assert.equal(list.statusCode, 200);
    assert.equal(list.body.submissions.length, 1);
    assert.equal(list.body.submissions[0].source_channel, 'GOOGLE_FORM');

    const detail = await adminRequest(
      port,
      'GET',
      `/api/admin/submissions/${list.body.submissions[0].submission_id}`,
    );
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.body.documents.length, 2);
    assert.ok(detail.body.responses.length > 0);
    assert.equal(detail.body.eligibility_assessment.status, 'READY_FOR_TECHNICAL_REVIEW');
    assert.ok(Array.isArray(detail.body.audit_events));
  });
});

test('preliminary eligibility blocks when required consent is negative', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const imported = await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-eligibility-blocked',
      responses: validResponses({ 'FDF-11': 'No' }),
      documents: requiredDocuments(),
    });

    assert.equal(imported.statusCode, 201);
    assert.equal(imported.body.eligibility_status, 'BLOCKED_BY_MISSING_REQUIREMENTS');
    const assessment = Array.from(repository.eligibilityAssessments.values())[0];
    assert.equal(assessment.status, 'BLOCKED_BY_MISSING_REQUIREMENTS');
    assert.ok(assessment.check_results.some(check =>
      check.check_id === 'CONSENT_ACCEPTED' && check.status === 'FAIL'
    ));
  });
});

test('admin API recalculates and manually reviews preliminary eligibility with audit event', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-eligibility-review',
      responses: validResponses({
        'FDF-18': 'No acredito vínculo institucional activo con una estructura de apoyo a NAE',
      }),
      documents: requiredDocuments(),
    });
    const submissionId = Array.from(repository.submissions.values())[0].submission_id;

    const recalculated = await adminJsonRequest(
      port,
      'POST',
      `/api/admin/submissions/${submissionId}/eligibility/recalculate`,
      {},
    );
    assert.equal(recalculated.statusCode, 200);
    assert.equal(recalculated.body.eligibility_assessment.status, 'REQUIRES_MANUAL_REVIEW');

    const assessmentId = recalculated.body.eligibility_assessment.eligibility_assessment_id;
    const reviewed = await adminJsonRequest(
      port,
      'PATCH',
      `/api/admin/eligibility/${assessmentId}/review`,
      { status: 'READY_FOR_TECHNICAL_REVIEW', note: 'Revision sintetica de prueba' },
    );
    assert.equal(reviewed.statusCode, 200);
    assert.equal(reviewed.body.eligibility_assessment.status, 'READY_FOR_TECHNICAL_REVIEW');
    assert.ok(Array.from(repository.auditEvents.values()).some(event =>
      event.action === 'ELIGIBILITY_REVIEW_UPDATED'
    ));
  });
});

test('reviewer captures manual technical criterion evaluation without ranking', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-technical-review',
      responses: validResponses(),
      documents: requiredDocuments(),
    });
    const submissionId = Array.from(repository.submissions.values())[0].submission_id;

    const saved = await adminJsonRequest(
      port,
      'PUT',
      `/api/admin/submissions/${submissionId}/evaluation/criteria/TRAINING_AND_TECHNICAL_CAPACITY`,
      {
        status: 'COMPLETED',
        score: 82,
        evidence_summary: 'Revision tecnica sintetica.',
        evaluator_note: 'Nota interna sintetica.',
      },
    );

    assert.equal(saved.statusCode, 200);
    assert.equal(saved.body.criterion_evaluation.status, 'COMPLETED');
    assert.equal(saved.body.evaluation_result.status, 'COMPLETED');
    assert.equal(saved.body.evaluation_result.completed_criteria, 4);
    assert.equal(saved.body.evaluation_result.total_criteria, 4);
    assert.equal(saved.body.evaluation_result.total_score, 90.1);
    assert.ok(Array.from(repository.auditEvents.values()).some(event =>
      event.action === 'CRITERION_EVALUATION_UPDATED'
    ));

    const detail = await adminRequest(port, 'GET', `/api/admin/submissions/${submissionId}`);
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.body.evaluation_criteria.length, 4);
    assert.equal(detail.body.criterion_evaluations.length, 4);
    assert.equal(detail.body.evaluation_result.status, 'COMPLETED');
  });
});

test('admin API exports operational review summary as JSON and CSV', async (t) => {
  await withServer(t, async ({ port }) => {
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-review-summary',
      responses: validResponses(),
      documents: requiredDocuments(),
    });
    const list = await adminRequest(port, 'GET', '/api/admin/submissions');
    const submissionId = list.body.submissions[0].submission_id;
    await adminJsonRequest(
      port,
      'PUT',
      `/api/admin/submissions/${submissionId}/evaluation/criteria/INSTITUTIONAL_LINK`,
      {
        status: 'COMPLETED',
        score: 75,
        evidence_summary: 'Resumen sintetico.',
      },
    );

    const json = await adminRequest(port, 'GET', '/api/admin/review-summary');
    assert.equal(json.statusCode, 200);
    assert.equal(json.body.summaries.length, 1);
    assert.equal(json.body.summaries[0].evaluation_status, 'COMPLETED');
    assert.equal(json.body.summaries[0].completed_criteria, 4);
    assert.equal(json.body.summaries[0].total_score, 96.25);

    const csv = await adminRawRequest(port, 'GET', '/api/admin/review-summary.csv');
    assert.equal(csv.statusCode, 200);
    assert.match(csv.headers['content-type'], /text\/csv/);
    assert.match(csv.body, /submission_id,candidate_id,full_name/);
    assert.match(csv.body, /COMPLETED/);
  });
});

test('admin API exposes document review and technical evaluation matrix views', async (t) => {
  await withServer(t, async ({ port }) => {
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-matrix-views',
      responses: validResponses(),
      documents: requiredDocuments(),
    });
    const list = await adminRequest(port, 'GET', '/api/admin/submissions');
    const submissionId = list.body.submissions[0].submission_id;
    await adminJsonRequest(
      port,
      'PUT',
      `/api/admin/submissions/${submissionId}/evaluation/criteria/INSTITUTIONAL_LINK`,
      {
        status: 'COMPLETED',
        score: 80,
        evidence_summary: 'Sintesis operativa.',
      },
    );

    const documents = await adminRequest(port, 'GET', '/api/admin/document-review');
    assert.equal(documents.statusCode, 200);
    assert.equal(documents.body.rows.length, 1);
    assert.equal(documents.body.rows[0].carta_aval_status, 'RECEIVED');
    assert.equal(documents.body.rows[0].curriculum_status, 'RECEIVED');

    const matrix = await adminRequest(port, 'GET', '/api/admin/evaluation-matrix');
    assert.equal(matrix.statusCode, 200);
    assert.equal(matrix.body.criteria.length, 4);
    assert.equal(matrix.body.rows.length, 1);
    assert.equal(matrix.body.rows[0].evaluation_status, 'COMPLETED');
    assert.equal(matrix.body.rows[0].total_score, 97);
    assert.ok(matrix.body.rows[0].criteria.some(item => item.criterion_id === 'INSTITUTIONAL_LINK'));
  });
});

test('technical evaluation requires review role and validates inputs', async (t) => {
  await withServer(t, async ({ port }) => {
    const adminCookie = await loginCookie(port, 'admin', 'admin-password');
    await requestWithHeaders(port, 'POST', '/api/admin/users', {
      username: 'viewer',
      password: 'viewer-password',
      role: 'VIEWER',
    }, { cookie: adminCookie, 'content-type': 'application/json' });
    const viewerCookie = await loginCookie(port, 'viewer', 'viewer-password');

    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-technical-permissions',
      responses: validResponses(),
      documents: requiredDocuments(),
    });
    const list = await requestWithHeaders(port, 'GET', '/api/admin/submissions', undefined, { cookie: viewerCookie });
    const submissionId = list.body.submissions[0].submission_id;

    const forbidden = await requestWithHeaders(
      port,
      'PUT',
      `/api/admin/submissions/${submissionId}/evaluation/criteria/INSTITUTIONAL_LINK`,
      { status: 'COMPLETED', score: 60 },
      { cookie: viewerCookie, 'content-type': 'application/json' },
    );
    assert.equal(forbidden.statusCode, 403);

    const invalid = await requestWithHeaders(
      port,
      'PUT',
      `/api/admin/submissions/${submissionId}/evaluation/criteria/INSTITUTIONAL_LINK`,
      { status: 'COMPLETED', score: 101 },
      { cookie: adminCookie, 'content-type': 'application/json' },
    );
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.body.error, 'INVALID_EVALUATION_SCORE');
  }, { adminToken: '' });
});

test('admin API updates document status with audit event', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const imported = await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-document-review',
      responses: validResponses(),
      documents: requiredDocuments(),
    });
    assert.equal(imported.statusCode, 201);

    const documentId = Array.from(repository.documents.values())[0].document_id;
    const updated = await adminJsonRequest(
      port,
      'PATCH',
      `/api/admin/documents/${documentId}/status`,
      { status: 'VALIDATED', reason: 'Synthetic test review' },
    );

    assert.equal(updated.statusCode, 200);
    assert.equal(updated.body.document.status, 'VALIDATED');
    assert.equal(repository.documents.get(documentId).status, 'VALIDATED');
    assert.ok(Array.from(repository.auditEvents.values()).some(event =>
      event.action === 'DOCUMENT_STATUS_UPDATED'
    ));
  });
});

test('admin API records document open events', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-document-open',
      responses: validResponses(),
      documents: requiredDocuments(),
    });
    const documentId = Array.from(repository.documents.values())[0].document_id;

    const opened = await adminJsonRequest(
      port,
      'POST',
      `/api/admin/documents/${documentId}/open`,
      {},
    );

    assert.equal(opened.statusCode, 200);
    assert.equal(opened.body.status, 'ok');
    assert.ok(Array.from(repository.auditEvents.values()).some(event =>
      event.action === 'DOCUMENT_OPENED'
    ));
  });
});

test('admin API updates normalization issue review with audit event', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const imported = await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-issue-review',
      responses: {
        ...validResponses(),
        'FDF-999': 'Dato sintetico desconocido',
      },
      documents: requiredDocuments(),
    });
    assert.equal(imported.statusCode, 202);

    const issueId = Array.from(repository.issues.values())[0].normalization_issue_id;
    const updated = await adminJsonRequest(
      port,
      'PATCH',
      `/api/admin/issues/${issueId}/review`,
      { review_status: 'ACKNOWLEDGED', review_note: 'Revisado en prueba sintetica' },
    );

    assert.equal(updated.statusCode, 200);
    assert.equal(updated.body.issue.review_status, 'ACKNOWLEDGED');
    assert.equal(repository.issues.get(issueId).review_status, 'ACKNOWLEDGED');
    assert.ok(Array.from(repository.auditEvents.values()).some(event =>
      event.action === 'NORMALIZATION_ISSUE_REVIEW_UPDATED'
    ));
  });
});

test('admin API lists operational normalization issues', async (t) => {
  await withServer(t, async ({ port }) => {
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-issue-list',
      responses: {
        ...validResponses(),
        'FDF-07': '',
      },
      documents: requiredDocuments(),
    });

    const issues = await adminRequest(port, 'GET', '/api/admin/issues');
    assert.equal(issues.statusCode, 200);
    assert.ok(issues.body.issues.length >= 1);
    assert.ok(issues.body.field_catalog.length >= 1);
    assert.equal(issues.body.issues[0].review_status, 'OPEN');
    assert.equal(issues.body.issues.some(issue => issue.field_code === 'FDF-07'), true);
  });
});

test('admin API exports operational CSV views', async (t) => {
  await withServer(t, async ({ port }) => {
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-operational-csv',
      responses: {
        ...validResponses(),
        'FDF-07': '',
      },
      documents: requiredDocuments(),
    });

    const documents = await adminRawRequest(port, 'GET', '/api/admin/document-review.csv');
    assert.equal(documents.statusCode, 200);
    assert.match(documents.body, /submission_id,candidate_id,full_name/);

    const issues = await adminRawRequest(port, 'GET', '/api/admin/issues.csv');
    assert.equal(issues.statusCode, 200);
    assert.match(issues.body, /normalization_issue_id,submission_id,candidate_id/);

    const matrix = await adminRawRequest(port, 'GET', '/api/admin/evaluation-matrix.csv');
    assert.equal(matrix.statusCode, 200);
    assert.match(matrix.body, /INSTITUTIONAL_LINK_status/);
  });
});

test('admin API applies bulk issue and document updates with review permissions', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-bulk-ops',
      responses: {
        ...validResponses(),
        'FDF-07': '',
      },
      documents: requiredDocuments(),
    });

    const issueIds = Array.from(repository.issues.values()).map(issue => issue.normalization_issue_id);
    const documentIds = Array.from(repository.documents.values()).map(document => document.document_id);

    const issues = await adminJsonRequest(port, 'PATCH', '/api/admin/issues/bulk-review', {
      issue_ids: issueIds,
      review_status: 'ACKNOWLEDGED',
      review_note: 'Revision sintetica.',
    });
    assert.equal(issues.statusCode, 200);
    assert.equal(issues.body.updated, issueIds.length);
    assert.equal(repository.issues.get(issueIds[0]).review_status, 'ACKNOWLEDGED');

    const documents = await adminJsonRequest(port, 'PATCH', '/api/admin/documents/bulk-status', {
      document_ids: documentIds,
      status: 'VALIDATED',
    });
    assert.equal(documents.statusCode, 200);
    assert.equal(documents.body.updated, documentIds.length);
    assert.equal(repository.documents.get(documentIds[0]).status, 'VALIDATED');
  });
});

test('admin API rejects invalid operational statuses', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference: 'google-response-invalid-status',
      responses: validResponses(),
      documents: requiredDocuments(),
    });
    const documentId = Array.from(repository.documents.values())[0].document_id;
    const response = await adminJsonRequest(
      port,
      'PATCH',
      `/api/admin/documents/${documentId}/status`,
      { status: 'APPROVED' },
    );

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error, 'INVALID_DOCUMENT_STATUS');
  });
});

test('ingests offline JSON payload directly', async (t) => {
  await withServer(t, async ({ port }) => {
    const payload = {
      schema: 'FDF-2026-OFFLINE-1',
      exportedAt: '2026-08-14T10:00:00.000Z',
      respuestas: validResponses(),
      documents: requiredDocuments(),
    };
    const response = await request(port, 'POST', '/api/submissions/offline-json', payload);

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.status, 'IMPORTED');
    assert.ok(response.body.candidate_id.startsWith('cand_'));
  });
});

test('admin API imports offline JSON with document references', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const response = await adminJsonRequest(port, 'POST', '/api/admin/submissions/offline-json', {
      sourceReference: 'correo-offline-json-1',
      payload: {
        schema: 'FDF-2026-OFFLINE-1',
        exportedAt: '2026-08-14T10:00:00.000Z',
        respuestas: validResponses(),
      },
      documents: requiredDocuments(),
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.status, 'IMPORTED');
    assert.equal(response.body.eligibility_status, 'READY_FOR_TECHNICAL_REVIEW');
    assert.equal(repository.submissions.size, 1);
    assert.equal(repository.documents.size, 2);
    assert.equal(repository.raws.size, 1);
    const submission = Array.from(repository.submissions.values())[0];
    assert.equal(submission.source_channel, 'OFFLINE_JSON');
    assert.equal(submission.source_reference, 'correo-offline-json-1');
  });
});

test('admin API registers offline manual submission with the common model', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const response = await adminJsonRequest(port, 'POST', '/api/admin/submissions/offline-manual', {
      sourceReference: 'correo-offline-manual-1',
      registrationNote: 'Synthetic manual registration from email.',
      responses: validResponses(),
      documents: requiredDocuments(),
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.status, 'IMPORTED');
    assert.equal(response.body.eligibility_status, 'READY_FOR_TECHNICAL_REVIEW');
    assert.equal(repository.candidates.size, 1);
    assert.equal(repository.submissions.size, 1);
    assert.equal(repository.raws.size, 1);
    assert.equal(repository.documents.size, 2);

    const submission = Array.from(repository.submissions.values())[0];
    assert.equal(submission.source_channel, 'OFFLINE_MANUAL');
    assert.equal(submission.source_reference, 'correo-offline-manual-1');

    const raw = Array.from(repository.raws.values())[0];
    assert.equal(raw.raw_payload.registrationNote, 'Synthetic manual registration from email.');
    assert.equal(raw.raw_payload.responses['FDF-01'], 'Ana');
  });
});

test('reimporting same Google payload is idempotent', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const payload = {
      sourceReference: 'google-response-idempotent',
      responses: validResponses(),
      documents: requiredDocuments(),
    };

    const first = await request(port, 'POST', '/api/submissions/google-form', payload);
    const second = await request(port, 'POST', '/api/submissions/google-form', payload);

    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 200);
    assert.equal(second.body.status, 'REIMPORTED');
    assert.equal(repository.submissions.size, 1);
  });
});

test('reprocessing same Google source reference updates normalized data without duplicating submission', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const sourceReference = 'google-form-row-corrected-upload';
    const first = await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference,
      responses: {
        ...validResponses(),
        'FDF-17': '',
        'FDF-27': 'drive://synthetic/cv',
      },
      documents: [requiredDocuments()[1]],
    });
    assert.equal(first.statusCode, 201);
    assert.equal(repository.submissions.size, 1);
    assert.equal(repository.issues.size, 0);
    assert.equal(first.body.eligibility_status, 'READY_FOR_TECHNICAL_REVIEW');

    const second = await request(port, 'POST', '/api/submissions/google-form', {
      sourceReference,
      responses: {
        ...validResponses(),
        'FDF-17': 'drive://synthetic/carta-aval',
        'FDF-27': 'drive://synthetic/cv',
      },
      documents: requiredDocuments(),
    });

    assert.equal(second.statusCode, 200);
    assert.equal(second.body.status, 'REPROCESSED');
    assert.equal(repository.submissions.size, 1);
    assert.equal(repository.raws.size, 2);
    assert.equal(repository.documents.size, 2);
    assert.equal(repository.issues.size, 0);
  });
});

test('rejects unknown offline JSON schema', async (t) => {
  await withServer(t, async ({ port, repository }) => {
    const response = await request(port, 'POST', '/api/submissions/offline-json', {
      schema: 'FDF-2025-OFFLINE-0',
      exportedAt: '2026-08-14T10:00:00.000Z',
      respuestas: validResponses(),
    });

    assert.equal(response.statusCode, 422);
    assert.equal(response.body.status, 'REJECTED');
    assert.equal(response.body.issues[0].code, 'UNKNOWN_SCHEMA_VERSION');
    assert.equal(repository.raws.size, 1);
    assert.equal(repository.submissions.size, 1);
    assert.equal(Array.from(repository.submissions.values())[0].normalization_status, 'REJECTED');
  });
});
