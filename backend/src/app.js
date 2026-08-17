const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  importGoogleFormSubmission,
  importOfflineJsonSubmission,
  importOfflineManualSubmission,
} = require('./ingestion');
const { assessEligibility } = require('./eligibility');
const {
  buildCriterionEvaluation,
  criterionById,
  criteriaFromConfig,
  summarizeEvaluation,
} = require('./evaluation');

function createApp({ config, repository }) {
  async function handle(req, res) {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        return sendJson(res, 200, { status: 'ok' });
      }

      if (req.method === 'GET' && req.url === '/') {
        return redirect(res, '/admin');
      }

      if (req.method === 'GET' && (req.url === '/admin' || req.url === '/admin/')) {
        return sendStatic(res, path.join(__dirname, '..', 'public', 'admin', 'index.html'), 'text/html; charset=utf-8');
      }

      if (req.method === 'GET' && req.url.startsWith('/admin/')) {
        const relativePath = req.url.replace(/^\/admin\//, '') || 'index.html';
        return sendAdminAsset(res, relativePath);
      }

      if (req.method === 'POST' && req.url === '/api/auth/login') {
        const payload = await readJson(req);
        const session = await loginAdmin(payload, repository);
        res.setHeader('set-cookie', sessionCookie(session.token, session.expiresAt));
        return sendJson(res, 200, {
          user: {
            username: session.user.username,
            role: session.user.role,
          },
        });
      }

      if (req.method === 'GET' && req.url === '/api/auth/me') {
        const admin = await authorizeAdmin(req, config, repository);
        return sendJson(res, 200, {
          user: {
            username: admin.username,
            role: admin.role,
          },
        });
      }

      if (req.method === 'POST' && req.url === '/api/auth/logout') {
        const token = sessionTokenFromRequest(req);
        if (token && repository.revokeAdminSession) {
          await repository.revokeAdminSession(hash(token), 'ADMIN_UI');
        }
        res.setHeader('set-cookie', expiredSessionCookie());
        return sendJson(res, 200, { status: 'ok' });
      }

      if (req.method === 'GET' && req.url === '/api/admin/summary') {
        await authorizeAdmin(req, config, repository);
        return sendJson(res, 200, await repository.getAdminSummary());
      }

      if (req.method === 'GET' && req.url === '/api/admin/users') {
        await authorizeAdmin(req, config, repository, ['ADMIN']);
        return sendJson(res, 200, { users: await repository.listAdminUsers() });
      }

      if (req.method === 'GET' && req.url === '/api/admin/evaluation/criteria') {
        await authorizeAdmin(req, config, repository);
        return sendJson(res, 200, {
          schema_version: config.evaluationConfig?.schema_version || '',
          criteria: criteriaFromConfig(config.evaluationConfig),
        });
      }

      if (req.method === 'POST' && req.url === '/api/admin/users') {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN']);
        const payload = await readJson(req);
        const user = await repository.createAdminUser({
          username: payload.username,
          password: payload.password,
          role: payload.role,
          actor: admin.username,
          reason: payload.reason || 'Admin user created.',
        });
        return sendJson(res, 201, { user });
      }

      if (req.method === 'PATCH' && req.url.startsWith('/api/admin/users/')) {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN']);
        const username = decodeURIComponent(req.url.slice('/api/admin/users/'.length));
        const payload = await readJson(req);
        const user = await repository.updateAdminUser(username, {
          password: payload.password,
          role: payload.role,
          active: payload.active,
          actor: admin.username,
          reason: payload.reason || 'Admin user updated.',
        });
        return sendJson(res, 200, { user });
      }

      if (req.method === 'GET' && req.url === '/api/admin/submissions') {
        await authorizeAdmin(req, config, repository);
        return sendJson(res, 200, { submissions: await repository.listAdminSubmissions() });
      }

      if (req.method === 'GET' && req.url === '/api/admin/review-summary') {
        await authorizeAdmin(req, config, repository);
        return sendJson(res, 200, { summaries: await repository.listReviewSummaries() });
      }

      if (req.method === 'GET' && req.url === '/api/admin/document-review') {
        await authorizeAdmin(req, config, repository);
        return sendJson(res, 200, { rows: await repository.listDocumentReviewRows() });
      }

      if (req.method === 'GET' && req.url === '/api/admin/document-review.csv') {
        await authorizeAdmin(req, config, repository);
        return sendCsv(res, 'fdf-2026-document-review.csv', documentReviewCsv(await repository.listDocumentReviewRows()));
      }

      if (req.method === 'GET' && req.url === '/api/admin/evaluation-matrix') {
        await authorizeAdmin(req, config, repository);
        return sendJson(res, 200, {
          criteria: criteriaFromConfig(config.evaluationConfig),
          rows: await repository.listEvaluationMatrixRows(),
        });
      }

      if (req.method === 'GET' && req.url === '/api/admin/evaluation-matrix.csv') {
        await authorizeAdmin(req, config, repository);
        const criteria = criteriaFromConfig(config.evaluationConfig);
        return sendCsv(res, 'fdf-2026-evaluation-matrix.csv', evaluationMatrixCsv(await repository.listEvaluationMatrixRows(), criteria));
      }

      if (req.method === 'GET' && req.url === '/api/admin/issues') {
        await authorizeAdmin(req, config, repository);
        return sendJson(res, 200, {
          issues: await repository.listNormalizationIssueRows(),
          field_catalog: fieldCatalogFromConfig(config.publicSchema),
        });
      }

      if (req.method === 'GET' && req.url === '/api/admin/issues.csv') {
        await authorizeAdmin(req, config, repository);
        return sendCsv(res, 'fdf-2026-issues.csv', issuesCsv(await repository.listNormalizationIssueRows()));
      }

      if (req.method === 'GET' && req.url === '/api/admin/review-summary.csv') {
        await authorizeAdmin(req, config, repository);
        return sendCsv(res, 'fdf-2026-review-summary.csv', reviewSummaryCsv(await repository.listReviewSummaries()));
      }

      if (req.method === 'GET' && req.url.startsWith('/api/admin/submissions/')) {
        await authorizeAdmin(req, config, repository);
        const submissionId = decodeURIComponent(req.url.slice('/api/admin/submissions/'.length));
        const detail = await repository.getAdminSubmissionDetail(submissionId);
        if (!detail) return sendJson(res, 404, { error: 'NOT_FOUND' });
        return sendJson(res, 200, {
          ...detail,
          evaluation_criteria: criteriaFromConfig(config.evaluationConfig),
          field_catalog: fieldCatalogFromConfig(config.publicSchema),
        });
      }

      if (req.method === 'POST' && req.url.startsWith('/api/admin/submissions/') && req.url.endsWith('/eligibility/recalculate')) {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN', 'REVIEWER']);
        const submissionId = decodeURIComponent(req.url.slice('/api/admin/submissions/'.length, -'/eligibility/recalculate'.length));
        const assessment = await recalculateEligibility(submissionId, config, repository, admin.username || 'ADMIN_UI');
        return sendJson(res, 200, { eligibility_assessment: assessment });
      }

      if (req.method === 'PATCH' && req.url.startsWith('/api/admin/eligibility/') && req.url.endsWith('/review')) {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN', 'REVIEWER']);
        const assessmentId = decodeURIComponent(req.url.slice('/api/admin/eligibility/'.length, -'/review'.length));
        const payload = await readJson(req);
        const assessment = await repository.updateEligibilityReview(assessmentId, {
          status: payload.status,
          note: payload.note || '',
          actor: admin.username || payload.actor || 'ADMIN_UI',
          reason: payload.reason || '',
        });
        return sendJson(res, 200, { eligibility_assessment: assessment });
      }

      if (req.method === 'PUT' && req.url.startsWith('/api/admin/submissions/') && req.url.includes('/evaluation/criteria/')) {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN', 'REVIEWER']);
        const parts = req.url.match(/^\/api\/admin\/submissions\/(.+)\/evaluation\/criteria\/([^/]+)$/);
        if (!parts) return sendJson(res, 404, { error: 'NOT_FOUND' });
        const submissionId = decodeURIComponent(parts[1]);
        const criterionId = decodeURIComponent(parts[2]);
        const payload = await readJson(req);
        const saved = await saveCriterionEvaluation(submissionId, criterionId, payload, config, repository, admin.username || 'ADMIN_UI');
        return sendJson(res, 200, saved);
      }

      if (req.method === 'PATCH' && req.url.startsWith('/api/admin/documents/') && req.url.endsWith('/status')) {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN', 'REVIEWER']);
        const documentId = decodeURIComponent(req.url.slice('/api/admin/documents/'.length, -'/status'.length));
        const payload = await readJson(req);
        const document = await repository.updateDocumentStatus(documentId, {
          status: payload.status,
          actor: admin.username || payload.actor || 'ADMIN_UI',
          reason: payload.reason || '',
        });
        return sendJson(res, 200, { document });
      }

      if (req.method === 'PATCH' && req.url === '/api/admin/documents/bulk-status') {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN', 'REVIEWER']);
        const payload = await readJson(req);
        const documentIds = boundedStringList(payload.document_ids, 'document_ids');
        const documents = [];
        for (const documentId of documentIds) {
          documents.push(await repository.updateDocumentStatus(documentId, {
            status: payload.status,
            actor: admin.username || payload.actor || 'ADMIN_UI',
            reason: payload.reason || 'Bulk document status update.',
          }));
        }
        return sendJson(res, 200, { updated: documents.length, documents });
      }

      if (req.method === 'POST' && req.url.startsWith('/api/admin/documents/') && req.url.endsWith('/open')) {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN', 'REVIEWER', 'INTAKE', 'VIEWER']);
        const documentId = decodeURIComponent(req.url.slice('/api/admin/documents/'.length, -'/open'.length));
        const result = await repository.recordDocumentOpen(documentId, {
          actor: admin.username || 'ADMIN_UI',
          reason: 'Admin opened document reference.',
        });
        return sendJson(res, 200, result);
      }

      if (req.method === 'PATCH' && req.url.startsWith('/api/admin/issues/') && req.url.endsWith('/review')) {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN', 'REVIEWER']);
        const issueId = decodeURIComponent(req.url.slice('/api/admin/issues/'.length, -'/review'.length));
        const payload = await readJson(req);
        const issue = await repository.updateNormalizationIssueReview(issueId, {
          reviewStatus: payload.review_status,
          reviewNote: payload.review_note || '',
          actor: admin.username || payload.actor || 'ADMIN_UI',
          reason: payload.reason || '',
        });
        return sendJson(res, 200, { issue });
      }

      if (req.method === 'PATCH' && req.url === '/api/admin/issues/bulk-review') {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN', 'REVIEWER']);
        const payload = await readJson(req);
        const issueIds = boundedStringList(payload.issue_ids, 'issue_ids');
        const issues = [];
        for (const issueId of issueIds) {
          issues.push(await repository.updateNormalizationIssueReview(issueId, {
            reviewStatus: payload.review_status,
            reviewNote: payload.review_note || '',
            actor: admin.username || payload.actor || 'ADMIN_UI',
            reason: payload.reason || 'Bulk issue review update.',
          }));
        }
        return sendJson(res, 200, { updated: issues.length, issues });
      }

      if (req.method === 'POST' && req.url === '/api/admin/submissions/offline-json') {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN', 'INTAKE']);
        const payload = await readJson(req);
        const offlinePayload = adminOfflineJsonPayload(payload, admin.username || 'ADMIN_UI');
        const imported = importOfflineJsonSubmission(offlinePayload, config);
        const saved = await repository.saveImportedSubmission(imported);
        const assessment = await assessSavedImport(saved, config, repository);
        return sendJson(res, statusCodeFor(saved.status), responseBody(saved, assessment));
      }

      if (req.method === 'POST' && req.url === '/api/admin/submissions/offline-manual') {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN', 'INTAKE']);
        const payload = await readJson(req);
        const manualPayload = adminOfflineManualPayload(payload, admin.username || 'ADMIN_UI');
        const imported = importOfflineManualSubmission(manualPayload, config);
        const saved = await repository.saveImportedSubmission(imported);
        const assessment = await assessSavedImport(saved, config, repository);
        return sendJson(res, statusCodeFor(saved.status), responseBody(saved, assessment));
      }

      if (req.method === 'POST' && req.url === '/api/submissions/google-form') {
        authorize(req, config);
        const payload = await readJson(req);
        const imported = importGoogleFormSubmission(payload, config);
        const saved = await repository.saveImportedSubmission(imported);
        const assessment = await assessSavedImport(saved, config, repository);
        return sendJson(res, statusCodeFor(saved.status), responseBody(saved, assessment));
      }

      if (req.method === 'POST' && req.url === '/api/submissions/offline-json') {
        authorize(req, config);
        const payload = await readJson(req);
        const imported = importOfflineJsonSubmission(payload, config);
        const saved = await repository.saveImportedSubmission(imported);
        const assessment = await assessSavedImport(saved, config, repository);
        return sendJson(res, statusCodeFor(saved.status), responseBody(saved, assessment));
      }

      return sendJson(res, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      if (error.statusCode) {
        return sendJson(res, error.statusCode, {
          error: error.code,
          message: error.message,
        });
      }
      return sendJson(res, 500, {
        error: 'INTERNAL_ERROR',
        message: error.message,
      });
    }
  }

  return http.createServer(handle);
}

async function assessSavedImport(saved, config, repository) {
  const submissionId = saved.imported?.submission?.submission_id;
  if (!submissionId || !saved.imported?.submission?.candidate_id || !config.eligibilityConfig || !repository.getEligibilityInput) return null;
  return recalculateEligibility(submissionId, config, repository, 'API_ELIGIBILITY_ASSESSOR');
}

function adminOfflineJsonPayload(payload, actor) {
  const offlinePayload = payload.payload && typeof payload.payload === 'object'
    ? payload.payload
    : payload;
  return {
    ...offlinePayload,
    sourceReference: payload.sourceReference || payload.source_reference || offlinePayload.sourceReference || '',
    receivedAt: payload.receivedAt || payload.received_at || offlinePayload.receivedAt || '',
    actor: actor || offlinePayload.actor || 'ADMIN_UI',
    documents: normalizeAdminOfflineDocuments(payload.documents || offlinePayload.documents || []),
  };
}

function fieldCatalogFromConfig(publicSchema = {}) {
  return (publicSchema.fields || []).map(field => ({
    code: field.code,
    section: field.section,
    section_title: field.section_title,
    question: field.question,
  }));
}

function adminOfflineManualPayload(payload, actor) {
  return {
    sourceReference: payload.sourceReference || payload.source_reference || '',
    receivedAt: payload.receivedAt || payload.received_at || '',
    actor: actor || 'ADMIN_UI',
    registrationNote: String(payload.registrationNote || payload.registration_note || ''),
    responses: payload.responses || payload.respuestas || {},
    documents: normalizeAdminOfflineDocuments(payload.documents || []),
  };
}

function normalizeAdminOfflineDocuments(documents) {
  return (documents || [])
    .map(document => ({
      document_type: String(document.document_type || '').trim(),
      original_name: String(document.original_name || '').trim(),
      storage_reference: String(document.storage_reference || '').trim(),
      status: document.status || 'RECEIVED',
      received_at: document.received_at || '',
    }))
    .filter(document => document.document_type || document.original_name || document.storage_reference);
}

async function recalculateEligibility(submissionId, config, repository, actor) {
  if (!config.eligibilityConfig || !repository.getEligibilityInput || !repository.saveEligibilityAssessment) {
    const error = new Error('Eligibility assessment is not configured.');
    error.statusCode = 503;
    error.code = 'ELIGIBILITY_NOT_CONFIGURED';
    throw error;
  }

  const input = await repository.getEligibilityInput(submissionId);
  if (!input) {
    const error = new Error('Submission not found.');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }
  const assessment = assessEligibility(input, config.eligibilityConfig, { actor });
  return repository.saveEligibilityAssessment(assessment, {
    actor,
    reason: 'Eligibility recalculated from normalized responses and document status.',
  });
}

async function saveCriterionEvaluation(submissionId, criterionId, payload, config, repository, actor) {
  if (!config.evaluationConfig || !repository.getSubmission || !repository.saveCriterionEvaluation) {
    const error = new Error('Evaluation capture is not configured.');
    error.statusCode = 503;
    error.code = 'EVALUATION_NOT_CONFIGURED';
    throw error;
  }
  const submission = await repository.getSubmission(submissionId);
  if (!submission) {
    const error = new Error('Submission not found.');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }
  const criterion = criterionById(config.evaluationConfig, criterionId);
  if (!criterion) {
    const error = new Error('Evaluation criterion not found.');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  const evaluation = buildCriterionEvaluation({ submission, criterion, payload, actor });
  const existing = repository.listCriterionEvaluations
    ? await repository.listCriterionEvaluations(submissionId)
    : [];
  const merged = [
    ...existing.filter(item => item.criterion_id !== criterionId),
    evaluation,
  ];
  const result = summarizeEvaluation(submission, merged, config.evaluationConfig, actor);
  return repository.saveCriterionEvaluation(evaluation, result, {
    actor,
    reason: payload.reason || 'Technical criterion review captured.',
  });
}

function sendAdminAsset(res, relativePath) {
  if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
    return sendJson(res, 404, { error: 'NOT_FOUND' });
  }

  const basePath = path.join(__dirname, '..', 'public', 'admin');
  const filePath = path.join(basePath, relativePath);
  if (!filePath.startsWith(basePath)) return sendJson(res, 404, { error: 'NOT_FOUND' });

  const contentType = relativePath.endsWith('.css')
    ? 'text/css; charset=utf-8'
    : relativePath.endsWith('.js')
      ? 'text/javascript; charset=utf-8'
      : 'application/octet-stream';
  return sendStatic(res, filePath, contentType);
}

function authorize(req, config) {
  if (!config.apiToken) {
    const error = new Error('API authentication is not configured.');
    error.statusCode = 503;
    error.code = 'SERVER_MISCONFIGURED';
    throw error;
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!secureTokenEquals(token, config.apiToken)) {
    const error = new Error('Invalid or missing API token.');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }
}

async function authorizeAdmin(req, config, repository, roles = []) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  let admin = null;
  if (config.adminToken && secureTokenEquals(token, config.adminToken)) {
    admin = { username: 'ADMIN_TOKEN', role: 'ADMIN' };
  }

  const sessionToken = sessionTokenFromRequest(req);
  if (!admin && sessionToken && repository.findAdminSessionByTokenHash) {
    const session = await repository.findAdminSessionByTokenHash(hash(sessionToken));
    if (session && session.active && !session.revoked_at && new Date(session.expires_at).getTime() > Date.now()) {
      admin = {
        username: session.username,
        role: session.role,
        admin_user_id: session.admin_user_id,
      };
    }
  }

  if (admin) {
    if (roles.length && !roles.includes(admin.role)) {
      const error = new Error('Insufficient role for this operation.');
      error.statusCode = 403;
      error.code = 'FORBIDDEN';
      throw error;
    }
    return admin;
  }

  const error = new Error('Invalid or missing admin session.');
  error.statusCode = 401;
  error.code = 'UNAUTHORIZED';
  throw error;
}

function secureTokenEquals(received, expected) {
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');

  if (receivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function sendStatic(res, filePath, contentType) {
  fs.readFile(filePath, (error, data) => {
    if (error) return sendJson(res, 404, { error: 'NOT_FOUND' });
    res.writeHead(200, {
      'content-type': contentType,
      'content-length': data.length,
      'cache-control': 'no-store',
    });
    res.end(data);
  });
}

async function loginAdmin(payload, repository) {
  const username = String(payload.username || '').trim().toLowerCase();
  const password = String(payload.password || '');
  if (!username || !password || !repository.findAdminUserByUsername || !repository.createAdminSession) {
    const error = new Error('Invalid username or password.');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const user = await repository.findAdminUserByUsername(username);
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    const error = new Error('Invalid username or password.');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  await repository.createAdminSession(user.admin_user_id, hash(token), expiresAt);
  return { token, expiresAt, user };
}

function verifyPassword(password, storedHash) {
  if (String(storedHash || '').startsWith('plain:')) {
    return secureTokenEquals(String(storedHash).slice('plain:'.length), password);
  }

  const parts = String(storedHash || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') return false;
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const expected = parts[3];
  if (!Number.isInteger(iterations) || !salt || !expected) return false;
  const derived = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256').toString('hex');
  return secureTokenEquals(derived, expected);
}

function sessionTokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies.fdf_admin_session || '';
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || '').split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index === -1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function sessionCookie(token, expiresAt) {
  return [
    `fdf_admin_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
    `Expires=${new Date(expiresAt).toUTCString()}`,
  ].join('; ');
}

function expiredSessionCookie() {
  return [
    'fdf_admin_session=',
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ].join('; ');
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2_000_000) {
        const error = new Error('Payload too large.');
        error.statusCode = 413;
        error.code = 'PAYLOAD_TOO_LARGE';
        reject(error);
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (cause) {
        const error = new Error('Invalid JSON payload.');
        error.statusCode = 400;
        error.code = 'INVALID_JSON';
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function statusCodeFor(status) {
  if (status === 'REJECTED') return 422;
  if (status === 'REIMPORTED') return 200;
  if (status === 'REPROCESSED') return 200;
  if (status === 'IMPORTED_WITH_ISSUES') return 202;
  return 201;
}

function responseBody(saved, assessment) {
  const imported = saved.imported || {};
  return {
    status: saved.status,
    candidate_id: imported.candidate?.candidate_id || '',
    submission_id: imported.submission?.submission_id || imported.submission_id || '',
    normalization_status: imported.submission?.normalization_status || '',
    eligibility_status: assessment?.status || '',
    issues: (imported.issues || []).map(issue => ({
      field_code: issue.field_code,
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
    })),
  };
}

function boundedStringList(value, fieldName) {
  if (!Array.isArray(value) || !value.length || value.length > 100) {
    const error = new Error(`${fieldName} must contain between 1 and 100 items.`);
    error.statusCode = 400;
    error.code = 'INVALID_BULK_SELECTION';
    throw error;
  }
  const items = value.map(item => String(item || '').trim()).filter(Boolean);
  if (items.length !== value.length) {
    const error = new Error(`${fieldName} contains invalid items.`);
    error.statusCode = 400;
    error.code = 'INVALID_BULK_SELECTION';
    throw error;
  }
  return Array.from(new Set(items));
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function redirect(res, location) {
  res.writeHead(302, {
    location,
    'cache-control': 'no-store',
  });
  res.end();
}

function sendCsv(res, filename, content) {
  const body = Buffer.from(content, 'utf8');
  res.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function reviewSummaryCsv(rows) {
  const headers = [
    'submission_id',
    'candidate_id',
    'full_name',
    'email',
    'province',
    'source_channel',
    'received_at',
    'normalization_status',
    'eligibility_status',
    'evaluation_status',
    'completed_criteria',
    'total_criteria',
    'document_count',
    'documents_validated',
    'documents_needs_review',
    'documents_rejected',
    'open_issue_count',
  ];
  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvCell(row[header])).join(',')),
  ].join('\n');
}

function documentReviewCsv(rows) {
  const headers = [
    'submission_id',
    'candidate_id',
    'full_name',
    'email',
    'province',
    'source_channel',
    'received_at',
    'eligibility_status',
    'document_count',
    'carta_aval_status',
    'carta_aval_name',
    'curriculum_status',
    'curriculum_name',
  ];
  return rowsCsv(headers, rows);
}

function issuesCsv(rows) {
  const headers = [
    'normalization_issue_id',
    'submission_id',
    'candidate_id',
    'full_name',
    'email',
    'province',
    'source_channel',
    'field_code',
    'code',
    'severity',
    'message',
    'created_at',
    'review_status',
    'review_note',
    'reviewed_at',
    'reviewed_by',
  ];
  return rowsCsv(headers, rows);
}

function evaluationMatrixCsv(rows, criteria) {
  const baseHeaders = [
    'submission_id',
    'candidate_id',
    'full_name',
    'email',
    'province',
    'source_channel',
    'received_at',
    'eligibility_status',
    'evaluation_status',
    'completed_criteria',
    'total_criteria',
  ];
  const criterionHeaders = criteria.flatMap(criterion => [
    `${criterion.criterion_id}_status`,
    `${criterion.criterion_id}_score`,
  ]);
  const headers = [...baseHeaders, ...criterionHeaders];
  const expandedRows = rows.map(row => {
    const evaluations = new Map((row.criteria || []).map(item => [item.criterion_id, item]));
    const expanded = { ...row };
    for (const criterion of criteria) {
      const evaluation = evaluations.get(criterion.criterion_id) || {};
      expanded[`${criterion.criterion_id}_status`] = evaluation.status || 'NOT_STARTED';
      expanded[`${criterion.criterion_id}_score`] = evaluation.score ?? '';
    }
    return expanded;
  });
  return rowsCsv(headers, expandedRows);
}

function rowsCsv(headers, rows) {
  return [
    headers.join(','),
    ...rows.map(row => headers.map(header => csvCell(row[header])).join(',')),
  ].join('\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

module.exports = {
  createApp,
  readJson,
  statusCodeFor,
  secureTokenEquals,
  authorizeAdmin,
  verifyPassword,
};
