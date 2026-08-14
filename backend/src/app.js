const http = require('node:http');
const { importGoogleFormSubmission, importOfflineJsonSubmission } = require('./ingestion');

function createApp({ config, repository }) {
  async function handle(req, res) {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        return sendJson(res, 200, { status: 'ok' });
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

function authorize(req, config) {
  if (!config.apiToken) return;
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (token !== config.apiToken) {
    const error = new Error('Invalid or missing API token.');
    error.statusCode = 401;
    error.code = 'UNAUTHORIZED';
    throw error;
  }
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
};
