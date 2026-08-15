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
    ...configOverrides,
  };
  const app = createApp({ config, repository });
  await new Promise(resolve => app.listen(0, resolve));
  t.after(() => new Promise(resolve => app.close(resolve)));
  const port = app.address().port;
  return handler({ port, repository });
}

function request(port, method, url, body, token = 'test-token') {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const req = http.request({
      port,
      method,
      path: url,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    }, res => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        body: responseBody ? JSON.parse(responseBody) : null,
      }));
    });
    req.on('error', reject);
    req.end(payload);
  });
}

function adminRequest(port, method, url, token = 'admin-token') {
  return request(port, method, url, undefined, token);
}

test('health endpoint works without auth', async (t) => {
  await withServer(t, async ({ port }) => {
    const response = await request(port, 'GET', '/health', undefined, '');
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.status, 'ok');
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

test('fails closed when admin token is not configured', async (t) => {
  await withServer(t, async ({ port }) => {
    const response = await adminRequest(port, 'GET', '/api/admin/submissions', 'admin-token');
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.error, 'SERVER_MISCONFIGURED');
  }, { adminToken: '' });
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
  });
});
