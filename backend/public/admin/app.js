const tokenKey = 'fdf-admin-token';
let submissions = [];
let selectedId = '';

const loginPanel = document.querySelector('#loginPanel');
const appPanel = document.querySelector('#appPanel');
const loginForm = document.querySelector('#loginForm');
const loginError = document.querySelector('#loginError');
const tokenInput = document.querySelector('#adminToken');
const logoutButton = document.querySelector('#logoutButton');
const stats = document.querySelector('#stats');
const table = document.querySelector('#submissionsTable');
const detailPanel = document.querySelector('#detailPanel');
const searchInput = document.querySelector('#searchInput');
const statusFilter = document.querySelector('#statusFilter');
const refreshButton = document.querySelector('#refreshButton');

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const token = tokenInput.value.trim();
  if (!token) return;
  sessionStorage.setItem(tokenKey, token);
  await boot();
});

logoutButton.addEventListener('click', () => {
  sessionStorage.removeItem(tokenKey);
  selectedId = '';
  submissions = [];
  showLogin();
});

refreshButton.addEventListener('click', loadData);
searchInput.addEventListener('input', renderTable);
statusFilter.addEventListener('change', renderTable);

boot();

async function boot() {
  const token = sessionStorage.getItem(tokenKey);
  if (!token) {
    showLogin();
    return;
  }

  try {
    await loadData();
    loginPanel.hidden = true;
    appPanel.hidden = false;
    logoutButton.hidden = false;
    loginError.textContent = '';
  } catch (error) {
    sessionStorage.removeItem(tokenKey);
    showLogin(error.message);
  }
}

function showLogin(message = '') {
  loginPanel.hidden = false;
  appPanel.hidden = true;
  logoutButton.hidden = true;
  loginError.textContent = message;
  tokenInput.focus();
}

async function loadData() {
  const [summary, list] = await Promise.all([
    api('/api/admin/summary'),
    api('/api/admin/submissions'),
  ]);
  submissions = list.submissions || [];
  renderStats(summary);
  renderTable();
  if (selectedId) await selectSubmission(selectedId);
}

async function api(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${sessionStorage.getItem(tokenKey) || ''}`,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.error || `HTTP ${response.status}`);
  }
  return body;
}

function renderStats(summary) {
  const items = [
    ['Postulantes', summary.candidates],
    ['Postulaciones', summary.submissions],
    ['Documentos', summary.documents],
    ['Incidencias', summary.normalization_issues],
  ];
  stats.innerHTML = items.map(([label, value]) => `
    <div class="stat">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </div>
  `).join('');
}

function renderTable() {
  const query = normalize(searchInput.value);
  const status = statusFilter.value;
  const filtered = submissions.filter(item => {
    const matchesStatus = !status || item.normalization_status === status;
    const haystack = normalize([
      item.full_name,
      item.email,
      item.province,
      item.submission_id,
      item.candidate_id,
      item.source_channel,
    ].join(' '));
    return matchesStatus && (!query || haystack.includes(query));
  });

  table.innerHTML = filtered.map(item => `
    <tr data-id="${escapeHtml(item.submission_id)}" class="${item.submission_id === selectedId ? 'selected' : ''}">
      <td>${formatDate(item.received_at)}</td>
      <td><strong>${escapeHtml(item.full_name || 'Sin nombre')}</strong><br><span class="muted">${escapeHtml(item.email || '')}</span></td>
      <td>${escapeHtml(item.province || '')}</td>
      <td><span class="badge">${escapeHtml(item.source_channel)}</span></td>
      <td>${statusBadge(item.normalization_status)}</td>
      <td>${escapeHtml(item.document_count)}</td>
      <td>${escapeHtml(item.issue_count)}</td>
    </tr>
  `).join('');

  table.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => selectSubmission(row.dataset.id));
  });
}

async function selectSubmission(submissionId) {
  selectedId = submissionId;
  renderTable();
  detailPanel.innerHTML = '<p class="muted">Cargando...</p>';
  const detail = await api(`/api/admin/submissions/${encodeURIComponent(submissionId)}`);
  const candidate = detail.candidate || {};
  const submission = detail.submission || {};
  detailPanel.innerHTML = `
    <h2>${escapeHtml(fullName(candidate) || 'Sin nombre')}</h2>
    <p class="muted">${escapeHtml(candidate.email || '')}</p>
    <dl class="kv">
      <dt>Postulacion</dt><dd>${escapeHtml(submission.submission_id)}</dd>
      <dt>Origen</dt><dd>${escapeHtml(submission.source_channel)}</dd>
      <dt>Referencia</dt><dd>${escapeHtml(submission.source_reference)}</dd>
      <dt>Recibido</dt><dd>${formatDate(submission.received_at)}</dd>
      <dt>Estado</dt><dd>${statusBadge(submission.normalization_status)}</dd>
      <dt>Provincia</dt><dd>${escapeHtml(candidate.province || '')}</dd>
      <dt>CI</dt><dd>${escapeHtml(candidate.identification_number || '')}</dd>
    </dl>

    <h3>Incidencias</h3>
    ${renderIssues(detail.issues || [])}

    <h3>Documentos</h3>
    ${renderDocuments(detail.documents || [])}

    <h3>Respuestas</h3>
    ${renderResponses(detail.responses || [])}
  `;
}

function renderIssues(issues) {
  if (!issues.length) return '<p class="muted">Sin incidencias.</p>';
  return `<div class="list">${issues.map(issue => `
    <div class="item">
      <strong>${escapeHtml(issue.code)}</strong> ${escapeHtml(issue.field_code || '')}<br>
      <span class="muted">${escapeHtml(issue.severity)} - ${escapeHtml(issue.message)}</span>
    </div>
  `).join('')}</div>`;
}

function renderDocuments(documents) {
  if (!documents.length) return '<p class="muted">Sin documentos asociados.</p>';
  return `<div class="list">${documents.map(document => `
    <div class="item">
      <strong>${escapeHtml(document.document_type)}</strong><br>
      ${escapeHtml(document.original_name || document.storage_reference || '')}<br>
      <span class="muted">${escapeHtml(document.status)} - ${formatDate(document.received_at)}</span>
    </div>
  `).join('')}</div>`;
}

function renderResponses(responses) {
  if (!responses.length) return '<p class="muted">Sin respuestas normalizadas.</p>';
  return `<div class="list">${responses.map(response => `
    <div class="item">
      <strong>${escapeHtml(response.field_code)}</strong><br>
      ${escapeHtml(formatValue(response.value))}
    </div>
  `).join('')}</div>`;
}

function statusBadge(status) {
  const cls = status === 'NORMALIZED' ? 'ok' : 'warn';
  return `<span class="badge ${cls}">${escapeHtml(status || '')}</span>`;
}

function fullName(candidate) {
  return [
    candidate.first_name,
    candidate.second_name,
    candidate.first_surname,
    candidate.second_surname,
  ].filter(Boolean).join(' ');
}

function formatValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('es-CU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
