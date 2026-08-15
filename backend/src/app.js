const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { importGoogleFormSubmission, importOfflineJsonSubmission } = require('./ingestion');

function createApp({ config, repository }) {
  async function handle(req, res) {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        return sendJson(res, 200, { status: 'ok' });
      }

      if (req.method === 'GET' && (req.url === '/admin' || req.url === '/admin/')) {
        return sendStatic(res, path.join(__dirname, '..', 'public', 'admin', 'index.html'), 'text/html; charset=utf-8');
      }

      if (req.method === 'GET' && req.url.startsWith('/admin/')) {
        const relativePath = req.url.replace(/^\/admin\//, '') || 'index.html';
        return sendAdminAsset(res, relativePath);
      }

      if (req.method === 'GET' && req.url === '/api/admin/summary') {
        authorizeAdmin(req, config);
        return sendJson(res, 200, await repository.getAdminSummary());
      }

      if (req.method === 'GET' && req.url === '/api/admin/submissions') {
        authorizeAdmin(req, config);
        return sendJson(res, 200, { submissions: await repository.listAdminSubmissions() });
      }

      if (req.method === 'GET' && req.url.startsWith('/api/admin/submissions/')) {
        authorizeAdmin(req, config);
        const submissionId = decodeURIComponent(req.url.slice('/api/admin/submissions/'.length));
        const detail = await repository.getAdminSubmissionDetail(submissionId);
        if (!detail) return sendJson(res, 404, { error: 'NOT_FOUND' });
        return sendJson(res, 200, detail);
      }

      if (req.method === 'PATCH' && req.url.startsWith('/api/admin/documents/') && req.url.endsWith('/status')) {
        authorizeAdmin(req, config);
        const documentId = decodeURIComponent(req.url.slice('/api/admin/documents/'.length, -'/status'.length));
        const payload = await readJson(req);
        const document = await repository.updateDocumentStatus(documentId, {
          status: payload.status,
          actor: payload.actor || 'ADMIN_UI',
          reason: payload.reason || '',
        });
        return sendJson(res, 200, { document });
      }

      if (req.method === 'PATCH' && req.url.startsWith('/api/admin/issues/') && req.url.endsWith('/review')) {
        authorizeAdmin(req, config);
        const issueId = decodeURIComponent(req.url.slice('/api/admin/issues/'.length, -'/review'.length));
        const payload = await readJson(req);
        const issue = await repository.updateNormalizationIssueReview(issueId, {
          reviewStatus: payload.review_status,
          reviewNote: payload.review_note || '',
          actor: payload.actor || 'ADMIN_UI',
          reason: payload.reason || '',
        });
        return sendJson(res, 200, { issue });
      }

      if (req.method === 'POST' && req.url === '/api/submissions/google-form') {
        authorize(req, config);
        const payload = await readJson(req);
        const imported = importGoogleFormSubmission(payload, config);
        const saved = await repository.saveImportedSubmission(imported);
        return sendJson(res, statusCodeFor(saved.status), responseBody(saved));
      }

      if (req.method === 'POST' && req.url === '/api/submissions/offline-json') {
        authorize(req, config);
        const payload = await readJson(req);
        const imported = importOfflineJsonSubmission(payload, config);
        const saved = await repository.saveImportedSubmission(imported);
        return sendJson(res, statusCodeFor(saved.status), responseBody(saved));
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

function authorizeAdmin(req, config) {
  if (!config.adminToken) {
    const error = new Error('Admin authentication is not configured.');
    error.statusCode = 503;
    error.code = 'SERVER_MISCONFIGURED';
    throw error;
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!secureTokenEquals(token, config.adminToken)) {
    const error = new Error('Invalid or missing admin token.');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }
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
  if (status === 'IMPORTED_WITH_ISSUES') return 202;
  return 201;
}

function responseBody(saved) {
  const imported = saved.imported || {};
  return {
    status: saved.status,
    candidate_id: imported.candidate?.candidate_id || '',
    submission_id: imported.submission?.submission_id || imported.submission_id || '',
    normalization_status: imported.submission?.normalization_status || '',
    issues: (imported.issues || []).map(issue => ({
      field_code: issue.field_code,
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
    })),
  };
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

module.exports = {
  createApp,
  readJson,
  statusCodeFor,
  secureTokenEquals,
  authorizeAdmin,
};
