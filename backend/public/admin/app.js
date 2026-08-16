let submissions = [];
let reviewSummaries = [];
let selectedId = '';
let selectedDetail = null;
let currentUser = null;

const LABELS = {
  roles: {
    ADMIN: 'Administrador',
    REVIEWER: 'Revisor',
    INTAKE: 'Registro',
    VIEWER: 'Consulta',
  },
  sourceChannels: {
    GOOGLE_FORM: 'Formulario en línea',
    OFFLINE_JSON: 'Offline con JSON',
    OFFLINE_MANUAL: 'Offline manual',
  },
  normalization: {
    NORMALIZED: 'Normalizada',
    WITH_ISSUES: 'Con incidencias',
    REJECTED: 'Rechazada',
  },
  eligibility: {
    READY_FOR_TECHNICAL_REVIEW: 'Lista para revisión técnica',
    BLOCKED_BY_MISSING_REQUIREMENTS: 'Bloqueada por requisitos',
    REQUIRES_MANUAL_REVIEW: 'Requiere revisión manual',
    SIN_EVALUAR: 'Sin evaluar',
  },
  evaluation: {
    NOT_STARTED: 'No iniciada',
    IN_PROGRESS: 'En curso',
    COMPLETED: 'Completada',
    NEEDS_REVIEW: 'Necesita revisión',
  },
  documents: {
    RECEIVED: 'Recibido',
    VALIDATED: 'Validado',
    REJECTED: 'Rechazado',
    NEEDS_REVIEW: 'Necesita revisión',
    CARTA_AVAL: 'Carta aval',
    CURRICULUM_VITAE: 'Currículum vitae',
    FORMULARIO_OFFLINE: 'Formulario offline',
  },
  issues: {
    OPEN: 'Abierta',
    ACKNOWLEDGED: 'Reconocida',
    RESOLVED: 'Resuelta',
    NEEDS_SOURCE_REVIEW: 'Revisar fuente',
  },
  checks: {
    PASS: 'Cumple',
    FAIL: 'No cumple',
    CONSENT_ACCEPTED: 'Consentimiento aceptado',
    CARTA_AVAL_RECEIVED: 'Carta aval recibida',
    CURRICULUM_RECEIVED: 'Currículum recibido',
    VERACITY_CONFIRMED: 'Veracidad confirmada',
    VALIDATION_AUTHORIZED: 'Validación institucional autorizada',
    MULTIPLICATION_COMMITMENT_NOT_NEGATIVE: 'Compromiso de multiplicación',
    AVAILABILITY_NOT_NEGATIVE: 'Disponibilidad para participar',
    INSTITUTIONAL_LINK_REVIEW: 'Vínculo institucional',
  },
  checkDescriptions: {
    CONSENT_ACCEPTED: 'Consentimiento para usar la información en el proceso FdF.',
    CARTA_AVAL_RECEIVED: 'Carta aval institucional recibida.',
    CURRICULUM_RECEIVED: 'Currículum vitae recibido.',
    VERACITY_CONFIRMED: 'Confirmación de veracidad de la información.',
    VALIDATION_AUTHORIZED: 'Autorización para validación institucional.',
    MULTIPLICATION_COMMITMENT_NOT_NEGATIVE: 'No declara ausencia de compromiso de multiplicación.',
    AVAILABILITY_NOT_NEGATIVE: 'No declara falta de disponibilidad para participar.',
    INSTITUTIONAL_LINK_REVIEW: 'Requiere revisión si declara no acreditar vínculo institucional activo.',
  },
};

const loginPanel = document.querySelector('#loginPanel');
const appPanel = document.querySelector('#appPanel');
const loginForm = document.querySelector('#loginForm');
const loginError = document.querySelector('#loginError');
const usernameInput = document.querySelector('#adminUsername');
const passwordInput = document.querySelector('#adminPassword');
const logoutButton = document.querySelector('#logoutButton');
const stats = document.querySelector('#stats');
const table = document.querySelector('#submissionsTable');
const detailPanel = document.querySelector('#detailPanel');
const submissionsCount = document.querySelector('#submissionsCount');
const searchInput = document.querySelector('#searchInput');
const statusFilter = document.querySelector('#statusFilter');
const eligibilityFilter = document.querySelector('#eligibilityFilter');
const evaluationFilter = document.querySelector('#evaluationFilter');
const originFilter = document.querySelector('#originFilter');
const workFilter = document.querySelector('#workFilter');
const refreshButton = document.querySelector('#refreshButton');
const clearFiltersButton = document.querySelector('#clearFiltersButton');
const reviewSearchInput = document.querySelector('#reviewSearchInput');
const reviewEvaluationFilter = document.querySelector('#reviewEvaluationFilter');
const reviewEligibilityFilter = document.querySelector('#reviewEligibilityFilter');
const exportReviewCsvButton = document.querySelector('#exportReviewCsvButton');
const clearReviewFiltersButton = document.querySelector('#clearReviewFiltersButton');
const reviewSummaryTable = document.querySelector('#reviewSummaryTable');
const reviewCount = document.querySelector('#reviewCount');
const quickFilterButtons = Array.from(document.querySelectorAll('[data-quick-filter]'));
const currentUserBadge = document.querySelector('#currentUserBadge');
const tabs = Array.from(document.querySelectorAll('[data-view]'));
const views = Array.from(document.querySelectorAll('.view'));
const offlineJsonForm = document.querySelector('#offlineJsonForm');
const offlineSourceReference = document.querySelector('#offlineSourceReference');
const offlineJsonPayload = document.querySelector('#offlineJsonPayload');
const offlineCartaName = document.querySelector('#offlineCartaName');
const offlineCartaRef = document.querySelector('#offlineCartaRef');
const offlineCvName = document.querySelector('#offlineCvName');
const offlineCvRef = document.querySelector('#offlineCvRef');
const offlineImportResult = document.querySelector('#offlineImportResult');
const offlineManualForm = document.querySelector('#offlineManualForm');
const manualSourceReference = document.querySelector('#manualSourceReference');
const manualRegistrationNote = document.querySelector('#manualRegistrationNote');
const manualResponsesPayload = document.querySelector('#manualResponsesPayload');
const manualCartaName = document.querySelector('#manualCartaName');
const manualCartaRef = document.querySelector('#manualCartaRef');
const manualCvName = document.querySelector('#manualCvName');
const manualCvRef = document.querySelector('#manualCvRef');
const manualImportResult = document.querySelector('#manualImportResult');
const userForm = document.querySelector('#userForm');
const usersTable = document.querySelector('#usersTable');
const newUsername = document.querySelector('#newUsername');
const newPassword = document.querySelector('#newPassword');
const newRole = document.querySelector('#newRole');
const userFormResult = document.querySelector('#userFormResult');

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.textContent = '';
  try {
    const response = await api('/api/auth/login', {
      method: 'POST',
      body: {
        username: usernameInput.value.trim(),
        password: passwordInput.value,
      },
      skipAuthRedirect: true,
    });
    currentUser = response.user;
    passwordInput.value = '';
    await boot();
  } catch (error) {
    loginError.textContent = error.message;
  }
});

logoutButton.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST', skipAuthRedirect: true }).catch(() => {});
  selectedId = '';
  selectedDetail = null;
  submissions = [];
  currentUser = null;
  showLogin();
});

refreshButton.addEventListener('click', loadData);
clearFiltersButton.addEventListener('click', clearSubmissionFilters);
searchInput.addEventListener('input', renderTable);
statusFilter.addEventListener('change', renderTable);
eligibilityFilter.addEventListener('change', renderTable);
evaluationFilter.addEventListener('change', renderTable);
originFilter.addEventListener('change', renderTable);
workFilter.addEventListener('change', renderTable);
reviewSearchInput.addEventListener('input', renderReviewSummary);
reviewEvaluationFilter.addEventListener('change', renderReviewSummary);
reviewEligibilityFilter.addEventListener('change', renderReviewSummary);
exportReviewCsvButton.addEventListener('click', exportReviewCsv);
clearReviewFiltersButton.addEventListener('click', clearReviewFilters);
quickFilterButtons.forEach(button => button.addEventListener('click', () => applyQuickFilter(button.dataset.quickFilter)));
offlineJsonForm.addEventListener('submit', importOfflineJson);
offlineManualForm.addEventListener('submit', importOfflineManual);
userForm.addEventListener('submit', createUser);
tabs.forEach(tab => tab.addEventListener('click', () => showView(tab.dataset.view)));

boot();

async function boot() {
  try {
    const me = await api('/api/auth/me', { skipAuthRedirect: true });
    currentUser = me.user;
  } catch (error) {
    showLogin();
    return;
  }

  try {
    await loadData();
    applyRoleUi();
    loginPanel.hidden = true;
    appPanel.hidden = false;
    logoutButton.hidden = false;
    loginError.textContent = '';
  } catch (error) {
    showLogin(error.message);
  }
}

function showLogin(message = '') {
  loginPanel.hidden = false;
  appPanel.hidden = true;
  logoutButton.hidden = true;
  currentUserBadge.hidden = true;
  loginError.textContent = message;
  usernameInput.focus();
}

async function loadData() {
  const [summary, list, review] = await Promise.all([
    api('/api/admin/summary'),
    api('/api/admin/submissions'),
    api('/api/admin/review-summary'),
  ]);
  submissions = list.submissions || [];
  reviewSummaries = review.summaries || [];
  renderStats(summary);
  renderTable();
  renderReviewSummary();
  if (selectedId) await selectSubmission(selectedId);
  if (currentUser?.role === 'ADMIN') await loadUsers();
}

function applyRoleUi() {
  currentUserBadge.hidden = false;
  currentUserBadge.textContent = `${currentUser.username} - ${label('roles', currentUser.role)}`;
  const canIntake = hasRole('ADMIN', 'INTAKE');
  const canManageUsers = hasRole('ADMIN');
  document.querySelector('[data-view="intake"]').hidden = !canIntake;
  document.querySelector('[data-view="users"]').hidden = !canManageUsers;
  if (!canIntake && document.querySelector('#view-intake').classList.contains('active')) showView('submissions');
  if (!canManageUsers && document.querySelector('#view-users').classList.contains('active')) showView('submissions');
}

function hasRole(...roles) {
  return roles.includes(currentUser?.role);
}

function showView(name) {
  tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.view === name));
  views.forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  if (name === 'users' && currentUser?.role === 'ADMIN') loadUsers();
  if (name === 'review') renderReviewSummary();
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    credentials: 'same-origin',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !options.skipAuthRedirect) {
      currentUser = null;
      showLogin('Sesión expirada o no autorizada.');
    }
    throw new Error(body.message || body.error || `HTTP ${response.status}`);
  }
  return body;
}

async function importOfflineJson(event) {
  event.preventDefault();
  offlineImportResult.textContent = '';
  let payload;
  try {
    payload = JSON.parse(offlineJsonPayload.value);
  } catch (error) {
    offlineImportResult.textContent = 'JSON inválido.';
    return;
  }

  try {
    const result = await api('/api/admin/submissions/offline-json', {
      method: 'POST',
      body: {
        payload,
        sourceReference: offlineSourceReference.value.trim(),
        documents: offlineDocumentsFromForm(),
      },
    });
    offlineImportResult.textContent = [
      importStatusLabel(result.status),
      label('normalization', result.normalization_status),
      label('eligibility', result.eligibility_status),
      result.submission_id,
    ].filter(Boolean).join(' - ');
    offlineJsonForm.reset();
    await loadData();
    if (result.submission_id) await selectSubmission(result.submission_id);
  } catch (error) {
    offlineImportResult.textContent = error.message;
  }
}

function offlineDocumentsFromForm() {
  return [
    {
      document_type: 'CARTA_AVAL',
      original_name: offlineCartaName.value.trim(),
      storage_reference: offlineCartaRef.value.trim(),
      status: 'RECEIVED',
    },
    {
      document_type: 'CURRICULUM_VITAE',
      original_name: offlineCvName.value.trim(),
      storage_reference: offlineCvRef.value.trim(),
      status: 'RECEIVED',
    },
  ].filter(document => document.original_name || document.storage_reference);
}

async function importOfflineManual(event) {
  event.preventDefault();
  manualImportResult.textContent = '';
  let responses;
  try {
    responses = JSON.parse(manualResponsesPayload.value);
  } catch (error) {
    manualImportResult.textContent = 'JSON de respuestas inválido.';
    return;
  }

  try {
    const result = await api('/api/admin/submissions/offline-manual', {
      method: 'POST',
      body: {
        sourceReference: manualSourceReference.value.trim(),
        registrationNote: manualRegistrationNote.value.trim(),
        responses,
        documents: manualDocumentsFromForm(),
      },
    });
    manualImportResult.textContent = [
      importStatusLabel(result.status),
      label('normalization', result.normalization_status),
      label('eligibility', result.eligibility_status),
      result.submission_id,
    ].filter(Boolean).join(' - ');
    offlineManualForm.reset();
    await loadData();
    if (result.submission_id) await selectSubmission(result.submission_id);
  } catch (error) {
    manualImportResult.textContent = error.message;
  }
}

function manualDocumentsFromForm() {
  return [
    {
      document_type: 'CARTA_AVAL',
      original_name: manualCartaName.value.trim(),
      storage_reference: manualCartaRef.value.trim(),
      status: 'RECEIVED',
    },
    {
      document_type: 'CURRICULUM_VITAE',
      original_name: manualCvName.value.trim(),
      storage_reference: manualCvRef.value.trim(),
      status: 'RECEIVED',
    },
  ].filter(document => document.original_name || document.storage_reference);
}

async function loadUsers() {
  if (!hasRole('ADMIN')) return;
  const response = await api('/api/admin/users');
  renderUsers(response.users || []);
}

function renderUsers(users) {
  usersTable.innerHTML = users.map(user => `
    <tr>
      <td><strong>${escapeHtml(user.username)}</strong><br><span class="muted">${escapeHtml(user.admin_user_id)}</span></td>
      <td>
        <select data-user-role="${escapeHtml(user.username)}">
          ${roleOptions(user.role)}
        </select>
      </td>
      <td>
        <select data-user-active="${escapeHtml(user.username)}">
          <option value="true" ${user.active ? 'selected' : ''}>Activo</option>
          <option value="false" ${!user.active ? 'selected' : ''}>Inactivo</option>
        </select>
      </td>
      <td>
        <div class="user-actions">
          <input data-user-password="${escapeHtml(user.username)}" type="password" placeholder="Nueva contraseña">
          <button class="compact" type="button" data-user-save="${escapeHtml(user.username)}">Guardar</button>
        </div>
      </td>
    </tr>
  `).join('');

  usersTable.querySelectorAll('[data-user-save]').forEach(button => {
    button.addEventListener('click', async () => {
      const username = button.dataset.userSave;
      const role = usersTable.querySelector(`[data-user-role="${cssEscape(username)}"]`).value;
      const active = usersTable.querySelector(`[data-user-active="${cssEscape(username)}"]`).value === 'true';
      const password = usersTable.querySelector(`[data-user-password="${cssEscape(username)}"]`).value;
      await api(`/api/admin/users/${encodeURIComponent(username)}`, {
        method: 'PATCH',
        body: {
          role,
          active,
          password,
          reason: 'Actualización de usuario desde la consola',
        },
      });
      await loadUsers();
    });
  });
}

async function createUser(event) {
  event.preventDefault();
  userFormResult.textContent = '';
  try {
    await api('/api/admin/users', {
      method: 'POST',
      body: {
        username: newUsername.value.trim(),
        password: newPassword.value,
        role: newRole.value,
        reason: 'Usuario creado desde la consola',
      },
    });
    userForm.reset();
    userFormResult.textContent = 'Usuario creado.';
    await loadUsers();
  } catch (error) {
    userFormResult.textContent = error.message;
  }
}

function roleOptions(selected) {
  return ['ADMIN', 'REVIEWER', 'INTAKE', 'VIEWER']
    .map(role => `<option value="${role}" ${role === selected ? 'selected' : ''}>${escapeHtml(label('roles', role))}</option>`)
    .join('');
}

function renderStats(summary) {
  const items = [
    ['Postulantes', summary.candidates],
    ['Postulaciones', summary.submissions],
    ['Documentos', summary.documents],
    ['Incidencias abiertas', summary.open_issues || 0],
    ['Listas para revisar', summary.eligibility_ready || 0],
    ['Bloqueadas', summary.eligibility_blocked || 0],
    ['Evaluación en curso', summary.evaluation_in_progress || 0],
    ['Evaluaciones completas', summary.evaluation_completed || 0],
    ['Revisión manual', summary.eligibility_review || 0],
    ['Docs por revisar', summary.documents_needs_review || 0],
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
  const eligibility = eligibilityFilter.value;
  const evaluation = evaluationFilter.value;
  const origin = originFilter.value;
  const work = workFilter.value;
  const filtered = submissions.filter(item => {
    const matchesStatus = !status || item.normalization_status === status;
    const itemEligibility = item.eligibility_status || 'SIN_EVALUAR';
    const itemEvaluation = item.evaluation_status || 'NOT_STARTED';
    const matchesEligibility = !eligibility || itemEligibility === eligibility;
    const matchesEvaluation = !evaluation || itemEvaluation === evaluation;
    const matchesOrigin = !origin || item.source_channel === origin;
    const docStatuses = String(item.document_statuses || '').split(',').filter(Boolean);
    const matchesWork = !work ||
      (work === 'OPEN_ISSUES' && Number(item.open_issue_count || item.issue_count || 0) > 0) ||
      (work === 'DOCS_NEED_REVIEW' && docStatuses.includes('NEEDS_REVIEW')) ||
      (work === 'DOCS_REJECTED' && docStatuses.includes('REJECTED'));
    const haystack = normalize([
      item.full_name,
      item.email,
      item.province,
      item.submission_id,
      item.candidate_id,
      item.source_channel,
    ].join(' '));
    return matchesStatus && matchesEligibility && matchesEvaluation && matchesOrigin && matchesWork && (!query || haystack.includes(query));
  });

  table.innerHTML = filtered.map(item => `
    <tr data-id="${escapeHtml(item.submission_id)}" class="${item.submission_id === selectedId ? 'selected' : ''}">
      <td>${formatDate(item.received_at)}</td>
      <td><strong>${escapeHtml(item.full_name || 'Sin nombre')}</strong><br><span class="muted">${escapeHtml(item.email || '')}</span></td>
      <td>${escapeHtml(item.province || '')}</td>
      <td><span class="badge">${escapeHtml(label('sourceChannels', item.source_channel))}</span></td>
      <td>${statusBadge(item.normalization_status)}</td>
      <td>${eligibilityBadge(item.eligibility_status)}</td>
      <td>${evaluationBadge(item.evaluation_status)}</td>
      <td>${documentSummary(item)}</td>
      <td>${issueSummary(item)}</td>
    </tr>
  `).join('');
  submissionsCount.textContent = resultCountLabel(filtered.length, submissions.length, 'expediente', 'expedientes');

  table.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => selectSubmission(row.dataset.id));
  });
}

function renderReviewSummary() {
  const query = normalize(reviewSearchInput.value);
  const evaluation = reviewEvaluationFilter.value;
  const eligibility = reviewEligibilityFilter.value;
  const rows = reviewSummaries.filter(item => {
    const matchesEvaluation = !evaluation || (item.evaluation_status || 'NOT_STARTED') === evaluation;
    const matchesEligibility = !eligibility || (item.eligibility_status || 'SIN_EVALUAR') === eligibility;
    const haystack = normalize([
      item.full_name,
      item.email,
      item.province,
      item.submission_id,
      item.candidate_id,
      item.source_channel,
    ].join(' '));
    return matchesEvaluation && matchesEligibility && (!query || haystack.includes(query));
  });

  reviewSummaryTable.innerHTML = rows.map(item => `
    <tr data-review-id="${escapeHtml(item.submission_id)}">
      <td><strong>${escapeHtml(item.full_name || 'Sin nombre')}</strong><br><span class="muted">${escapeHtml(item.email || '')}</span></td>
      <td>${escapeHtml(item.province || '')}</td>
      <td><span class="badge">${escapeHtml(label('sourceChannels', item.source_channel))}</span></td>
      <td>${eligibilityBadge(item.eligibility_status)}</td>
      <td>${evaluationBadge(item.evaluation_status)}</td>
      <td>${criteriaProgress(item)}</td>
      <td>${reviewDocumentSummary(item)}</td>
      <td>${issueSummary({ issue_count: item.open_issue_count, open_issue_count: item.open_issue_count })}</td>
    </tr>
  `).join('');
  reviewCount.textContent = resultCountLabel(rows.length, reviewSummaries.length, 'postulación', 'postulaciones');

  reviewSummaryTable.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', async () => {
      showView('submissions');
      await selectSubmission(row.dataset.reviewId);
    });
  });
}

async function exportReviewCsv() {
  const response = await fetch('/api/admin/review-summary.csv', {
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || `HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'fdf-2026-review-summary.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function clearSubmissionFilters() {
  searchInput.value = '';
  statusFilter.value = '';
  eligibilityFilter.value = '';
  evaluationFilter.value = '';
  originFilter.value = '';
  workFilter.value = '';
  renderTable();
}

function clearReviewFilters() {
  reviewSearchInput.value = '';
  reviewEvaluationFilter.value = '';
  reviewEligibilityFilter.value = '';
  renderReviewSummary();
}

function applyQuickFilter(filter) {
  clearSubmissionFilters();
  clearReviewFilters();
  if (filter === 'CLEAR') {
    showView('submissions');
    return;
  }
  if (filter === 'READY_TO_EVALUATE') {
    eligibilityFilter.value = 'READY_FOR_TECHNICAL_REVIEW';
    evaluationFilter.value = 'NOT_STARTED';
    reviewEligibilityFilter.value = 'READY_FOR_TECHNICAL_REVIEW';
    reviewEvaluationFilter.value = 'NOT_STARTED';
    showView('review');
  } else if (filter === 'EVALUATION_IN_PROGRESS') {
    evaluationFilter.value = 'IN_PROGRESS';
    reviewEvaluationFilter.value = 'IN_PROGRESS';
    showView('review');
  } else if (filter === 'OPEN_ISSUES') {
    workFilter.value = 'OPEN_ISSUES';
    showView('submissions');
  } else if (filter === 'DOCS_TO_REVIEW') {
    workFilter.value = 'DOCS_NEED_REVIEW';
    showView('submissions');
  }
  renderTable();
  renderReviewSummary();
}

async function selectSubmission(submissionId) {
  selectedId = submissionId;
  renderTable();
  detailPanel.innerHTML = '<p class="muted">Cargando...</p>';
  const detail = await api(`/api/admin/submissions/${encodeURIComponent(submissionId)}`);
  selectedDetail = detail;
  const candidate = detail.candidate || {};
  const submission = detail.submission || {};
  detailPanel.innerHTML = `
    <div class="detail-head">
      <div>
        <h2>${escapeHtml(fullName(candidate) || 'Sin nombre')}</h2>
        <p class="muted">${escapeHtml(candidate.email || '')}</p>
      </div>
      <div class="detail-actions">
        ${evaluationBadge(detail.evaluation_result?.status || 'NOT_STARTED')}
        <button type="button" class="ghost compact" data-print-summary="${escapeHtml(submission.submission_id)}">Resumen</button>
      </div>
    </div>
    <div class="status-strip">
      ${statusBadge(submission.normalization_status)}
      ${eligibilityBadge(detail.eligibility_assessment?.status || '')}
      <span class="badge">${escapeHtml(label('sourceChannels', submission.source_channel))}</span>
      ${pendingWorkBadge(detail)}
    </div>
    <dl class="kv">
      <dt>Postulación</dt><dd>${escapeHtml(submission.submission_id)}</dd>
      <dt>Origen</dt><dd>${escapeHtml(label('sourceChannels', submission.source_channel))}</dd>
      <dt>Referencia</dt><dd>${escapeHtml(submission.source_reference)}</dd>
      <dt>Recibido</dt><dd>${formatDate(submission.received_at)}</dd>
      <dt>Normalización</dt><dd>${statusBadge(submission.normalization_status)}</dd>
      <dt>Admisibilidad</dt><dd>${eligibilityBadge(detail.eligibility_assessment?.status || '')}</dd>
      <dt>Evaluación</dt><dd>${evaluationBadge(detail.evaluation_result?.status || 'NOT_STARTED')}</dd>
      <dt>Provincia</dt><dd>${escapeHtml(candidate.province || '')}</dd>
      <dt>CI</dt><dd>${escapeHtml(candidate.identification_number || '')}</dd>
    </dl>

    <section class="detail-section">
      <h3>Admisibilidad preliminar</h3>
      ${renderEligibility(detail.eligibility_assessment, submission.submission_id)}
    </section>

    <section class="detail-section">
      <h3>Evaluación técnica</h3>
      ${renderTechnicalEvaluation(detail)}
    </section>

    <section class="detail-section">
      <h3>Incidencias</h3>
      ${renderIssues(detail.issues || [])}
    </section>

    <section class="detail-section">
      <h3>Documentos</h3>
      ${renderDocuments(detail.documents || [])}
    </section>

    <details class="detail-section">
      <summary>Respuestas normalizadas</summary>
      ${renderResponses(detail.responses || [], detail.field_catalog || [])}
    </details>

    <details class="detail-section">
      <summary>Auditoría</summary>
      ${renderAuditEvents(detail.audit_events || [])}
    </details>
  `;
  bindDetailActions();
}

function renderEligibility(assessment, submissionId) {
  if (!assessment) {
    return `
      <p class="muted">Sin evaluación preliminar registrada.</p>
      <button type="button" data-eligibility-recalculate="${escapeHtml(submissionId)}">Recalcular</button>
    `;
  }

  return `
    <div class="item">
      <strong>${eligibilityBadge(assessment.status)}</strong><br>
      <span class="muted">Regla ${escapeHtml(assessment.rule_version)}</span><br>
      <span class="muted">Evaluado por ${escapeHtml(assessment.assessed_by || '')} - ${formatDate(assessment.assessed_at)}</span>
      <div class="action-row">
        <select data-eligibility-status="${escapeHtml(assessment.eligibility_assessment_id)}">
          ${eligibilityStatusOptions(assessment.status)}
        </select>
        <button type="button" data-eligibility-save="${escapeHtml(assessment.eligibility_assessment_id)}">Guardar</button>
      </div>
      <input class="note-input" data-eligibility-note="${escapeHtml(assessment.eligibility_assessment_id)}" type="text" value="${escapeHtml(assessment.manual_note || '')}" placeholder="Nota de revisión">
      <div class="action-row single">
        <button type="button" class="ghost" data-eligibility-recalculate="${escapeHtml(submissionId)}">Recalcular</button>
      </div>
      ${renderEligibilityChecks(assessment.check_results || [])}
    </div>
  `;
}

function renderEligibilityChecks(checks) {
  if (!checks.length) return '<p class="muted">Sin comprobaciones registradas.</p>';
  return `<div class="check-list">${checks.map(check => `
    <div class="check-row">
      ${checkStatusBadge(check.status)}
      <div>
        <strong>${escapeHtml(label('checks', check.check_id))}</strong><br>
        <span class="muted">${escapeHtml(checkDescription(check))}</span>
      </div>
    </div>
  `).join('')}</div>`;
}

function renderTechnicalEvaluation(detail) {
  const criteria = detail.evaluation_criteria || [];
  if (!criteria.length) return '<p class="muted">Catálogo de criterios no configurado.</p>';
  const evaluations = new Map((detail.criterion_evaluations || []).map(item => [item.criterion_id, item]));
  const result = detail.evaluation_result || {};
  return `
    <div class="item">
      <strong>${evaluationBadge(result.status || 'NOT_STARTED')}</strong>
      <span class="muted">${escapeHtml(result.completed_criteria || 0)} de ${escapeHtml(result.total_criteria || criteria.length)} criterios completados</span>
      <div class="evaluation-grid">
        ${criteria.map(criterion => renderCriterionReview(detail.submission.submission_id, criterion, evaluations.get(criterion.criterion_id))).join('')}
      </div>
    </div>
  `;
}

function renderCriterionReview(submissionId, criterion, evaluation = {}) {
  return `
    <div class="criterion">
      <div class="criterion-head">
        <strong>${escapeHtml(criterion.label)}</strong>
        <span class="badge">${escapeHtml(criterion.weight_percent)}%</span>
      </div>
      <span class="muted">Criterio técnico</span>
      <div class="action-row">
        <select data-evaluation-status="${escapeHtml(criterion.criterion_id)}">
          ${evaluationStatusOptions(evaluation.status || 'NOT_STARTED')}
        </select>
        <input class="score-input" data-evaluation-score="${escapeHtml(criterion.criterion_id)}" type="number" min="0" max="100" step="0.01" value="${escapeHtml(evaluation.score ?? '')}" placeholder="Puntaje">
        <button type="button" data-evaluation-save="${escapeHtml(criterion.criterion_id)}" data-submission-id="${escapeHtml(submissionId)}">Guardar</button>
      </div>
      <textarea data-evaluation-evidence="${escapeHtml(criterion.criterion_id)}" rows="2" placeholder="Elementos que sustentan la revisión">${escapeHtml(evaluation.evidence_summary || '')}</textarea>
      <textarea data-evaluation-note="${escapeHtml(criterion.criterion_id)}" rows="2" placeholder="Nota interna">${escapeHtml(evaluation.evaluator_note || '')}</textarea>
      <span class="muted">${escapeHtml(evaluation.evaluated_by || '')} ${evaluation.evaluated_at ? formatDate(evaluation.evaluated_at) : ''}</span>
    </div>
  `;
}

function renderIssues(issues) {
  if (!issues.length) return '<p class="muted">Sin incidencias.</p>';
  return `<div class="list">${issues.map(issue => `
    <div class="item">
      <strong>${escapeHtml(issue.code)}</strong> ${escapeHtml(issue.field_code || '')}<br>
      <span class="muted">${escapeHtml(issue.message)}</span>
      <div class="action-row">
        <select data-issue-status="${escapeHtml(issue.normalization_issue_id)}">
          ${issueStatusOptions(issue.review_status || 'OPEN')}
        </select>
        <button type="button" data-issue-save="${escapeHtml(issue.normalization_issue_id)}">Guardar</button>
      </div>
      <input class="note-input" data-issue-note="${escapeHtml(issue.normalization_issue_id)}" type="text" value="${escapeHtml(issue.review_note || '')}" placeholder="Nota de revisión">
      <span class="muted">${escapeHtml(issue.reviewed_by || '')} ${issue.reviewed_at ? formatDate(issue.reviewed_at) : ''}</span>
    </div>
  `).join('')}</div>`;
}

function renderDocuments(documents) {
  if (!documents.length) return '<p class="muted">Sin documentos asociados.</p>';
  return `<div class="list">${documents.map(document => `
    <div class="item">
      <strong>${escapeHtml(label('documents', document.document_type))}</strong><br>
      ${documentLink(document)}
      <span class="muted">${escapeHtml(label('documents', document.status))} - ${formatDate(document.received_at)}</span>
      <div class="action-row">
        <select data-document-status="${escapeHtml(document.document_id)}">
          ${documentStatusOptions(document.status)}
        </select>
        <button type="button" data-document-save="${escapeHtml(document.document_id)}">Guardar</button>
      </div>
      <span class="muted">${escapeHtml(document.reviewed_by || '')} ${document.reviewed_at ? formatDate(document.reviewed_at) : ''}</span>
    </div>
  `).join('')}</div>`;
}

function documentLink(document) {
  const label = escapeHtml(document.original_name || document.storage_reference || 'Documento');
  if (!isSafeHttpUrl(document.storage_reference)) {
    return `${label}<br>`;
  }

  return `
    <div class="doc-link-row">
      <a href="${escapeHtml(document.storage_reference)}" target="_blank" rel="noopener noreferrer" data-document-open="${escapeHtml(document.document_id)}">${label}</a>
      <button type="button" class="ghost compact" data-copy="${escapeHtml(document.storage_reference)}">Copiar</button>
    </div>
  `;
}

function bindDetailActions() {
  if (!hasRole('ADMIN', 'REVIEWER')) {
    detailPanel.querySelectorAll('button[data-document-save], button[data-issue-save], button[data-eligibility-save], button[data-eligibility-recalculate], button[data-evaluation-save]')
      .forEach(button => button.disabled = true);
  }

  detailPanel.querySelectorAll('[data-document-save]').forEach(button => {
    button.addEventListener('click', async () => {
      const documentId = button.dataset.documentSave;
      const select = detailPanel.querySelector(`[data-document-status="${cssEscape(documentId)}"]`);
      await api(`/api/admin/documents/${encodeURIComponent(documentId)}/status`, {
        method: 'PATCH',
        body: { status: select.value, reason: 'Actualización de estado documental desde la consola' },
      });
      await loadData();
    });
  });

  detailPanel.querySelectorAll('[data-document-open]').forEach(link => {
    link.addEventListener('click', () => {
      api(`/api/admin/documents/${encodeURIComponent(link.dataset.documentOpen)}/open`, {
        method: 'POST',
      }).catch(() => {});
    });
  });

  detailPanel.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Copiado';
      setTimeout(() => {
        button.textContent = 'Copiar';
      }, 1200);
    });
  });

  detailPanel.querySelectorAll('[data-issue-save]').forEach(button => {
    button.addEventListener('click', async () => {
      const issueId = button.dataset.issueSave;
      const select = detailPanel.querySelector(`[data-issue-status="${cssEscape(issueId)}"]`);
      const note = detailPanel.querySelector(`[data-issue-note="${cssEscape(issueId)}"]`);
      await api(`/api/admin/issues/${encodeURIComponent(issueId)}/review`, {
        method: 'PATCH',
        body: {
          review_status: select.value,
          review_note: note.value,
          reason: 'Actualización de incidencia desde la consola',
        },
      });
      await loadData();
    });
  });

  detailPanel.querySelectorAll('[data-eligibility-recalculate]').forEach(button => {
    button.addEventListener('click', async () => {
      await api(`/api/admin/submissions/${encodeURIComponent(button.dataset.eligibilityRecalculate)}/eligibility/recalculate`, {
        method: 'POST',
      });
      await loadData();
    });
  });

  detailPanel.querySelectorAll('[data-eligibility-save]').forEach(button => {
    button.addEventListener('click', async () => {
      const assessmentId = button.dataset.eligibilitySave;
      const select = detailPanel.querySelector(`[data-eligibility-status="${cssEscape(assessmentId)}"]`);
      const note = detailPanel.querySelector(`[data-eligibility-note="${cssEscape(assessmentId)}"]`);
      await api(`/api/admin/eligibility/${encodeURIComponent(assessmentId)}/review`, {
        method: 'PATCH',
        body: {
          status: select.value,
          note: note.value,
          reason: 'Actualización de admisibilidad preliminar desde la consola',
        },
      });
      await loadData();
    });
  });

  detailPanel.querySelectorAll('[data-evaluation-save]').forEach(button => {
    button.addEventListener('click', async () => {
      const criterionId = button.dataset.evaluationSave;
      const submissionId = button.dataset.submissionId;
      const status = detailPanel.querySelector(`[data-evaluation-status="${cssEscape(criterionId)}"]`);
      const score = detailPanel.querySelector(`[data-evaluation-score="${cssEscape(criterionId)}"]`);
      const evidence = detailPanel.querySelector(`[data-evaluation-evidence="${cssEscape(criterionId)}"]`);
      const note = detailPanel.querySelector(`[data-evaluation-note="${cssEscape(criterionId)}"]`);
      await api(`/api/admin/submissions/${encodeURIComponent(submissionId)}/evaluation/criteria/${encodeURIComponent(criterionId)}`, {
        method: 'PUT',
        body: {
          status: status.value,
          score: score.value,
          evidence_summary: evidence.value,
          evaluator_note: note.value,
          reason: 'Actualización de criterio técnico desde la consola',
        },
      });
      await loadData();
    });
  });

  detailPanel.querySelectorAll('[data-print-summary]').forEach(button => {
    button.addEventListener('click', printCurrentSummary);
  });
}

function documentStatusOptions(selected) {
  return ['RECEIVED', 'VALIDATED', 'REJECTED', 'NEEDS_REVIEW']
    .map(status => `<option value="${status}" ${status === selected ? 'selected' : ''}>${escapeHtml(label('documents', status))}</option>`)
    .join('');
}

function issueStatusOptions(selected) {
  return ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'NEEDS_SOURCE_REVIEW']
    .map(status => `<option value="${status}" ${status === selected ? 'selected' : ''}>${escapeHtml(label('issues', status))}</option>`)
    .join('');
}

function eligibilityStatusOptions(selected) {
  return ['READY_FOR_TECHNICAL_REVIEW', 'BLOCKED_BY_MISSING_REQUIREMENTS', 'REQUIRES_MANUAL_REVIEW']
    .map(status => `<option value="${status}" ${status === selected ? 'selected' : ''}>${escapeHtml(label('eligibility', status))}</option>`)
    .join('');
}

function evaluationStatusOptions(selected) {
  return ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_REVIEW']
    .map(status => `<option value="${status}" ${status === selected ? 'selected' : ''}>${escapeHtml(label('evaluation', status))}</option>`)
    .join('');
}

function renderResponses(responses, fieldCatalog = []) {
  if (!responses.length) return '<p class="muted">Sin respuestas normalizadas.</p>';
  const fields = new Map(fieldCatalog.map(field => [field.code, field]));
  const grouped = responses.reduce((groups, response) => {
    const field = fields.get(response.field_code) || {};
    const section = field.section_title || 'Sin sección';
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section).push({ response, field });
    return groups;
  }, new Map());

  return `<div class="response-groups">${Array.from(grouped.entries()).map(([section, items]) => `
    <section class="response-group">
      <h4>${escapeHtml(section)}</h4>
      <div class="list">${items.map(({ response, field }) => `
        <div class="item response-item">
          <strong>${escapeHtml(field.question || response.field_code)}</strong>
          <span class="muted">${escapeHtml(response.field_code)}</span>
          <div>${escapeHtml(formatValue(response.value))}</div>
        </div>
      `).join('')}</div>
    </section>
  `).join('')}</div>`;
}

function renderAuditEvents(events) {
  if (!events.length) return '<p class="muted">Sin eventos de auditoría relacionados.</p>';
  return `<div class="list">${events.map(event => `
    <div class="item">
      <strong>${escapeHtml(actionLabel(event.action))}</strong><br>
      <span class="muted">${escapeHtml(entityLabel(event.entity_type))} - ${escapeHtml(event.actor || '')} - ${formatDate(event.occurred_at)}</span><br>
      ${escapeHtml(event.reason || '')}
    </div>
  `).join('')}</div>`;
}

function statusBadge(status) {
  const cls = status === 'NORMALIZED' ? 'ok' : 'warn';
  return `<span class="badge ${cls}">${escapeHtml(label('normalization', status))}</span>`;
}

function documentSummary(item) {
  const statuses = String(item.document_statuses || '').split(',').filter(Boolean);
  const flags = statuses.map(status => {
    const cls = status === 'REJECTED' ? 'bad' : status === 'NEEDS_REVIEW' ? 'warn' : 'ok';
    return `<span class="badge ${cls}">${escapeHtml(label('documents', status))}</span>`;
  }).join(' ');
  return `${escapeHtml(item.document_count)} ${flags}`;
}

function reviewDocumentSummary(item) {
  const flags = [];
  if (Number(item.documents_validated || 0)) flags.push(`<span class="badge ok">${escapeHtml(item.documents_validated)} val.</span>`);
  if (Number(item.documents_needs_review || 0)) flags.push(`<span class="badge warn">${escapeHtml(item.documents_needs_review)} rev.</span>`);
  if (Number(item.documents_rejected || 0)) flags.push(`<span class="badge bad">${escapeHtml(item.documents_rejected)} rech.</span>`);
  return `${escapeHtml(item.document_count || 0)} ${flags.join(' ')}`;
}

function criteriaProgress(item) {
  const total = Number(item.total_criteria || 0);
  if (!total) return '<span class="muted">Sin iniciar</span>';
  return `${escapeHtml(item.completed_criteria || 0)} / ${escapeHtml(total)}`;
}

function issueSummary(item) {
  const open = Number(item.open_issue_count || 0);
  if (!open) return escapeHtml(item.issue_count);
  return `${escapeHtml(item.issue_count)} <span class="badge warn">${escapeHtml(open)} abiertas</span>`;
}

function eligibilityBadge(status) {
  const normalized = status || 'SIN_EVALUAR';
  const cls = status === 'READY_FOR_TECHNICAL_REVIEW'
    ? 'ok'
    : status === 'BLOCKED_BY_MISSING_REQUIREMENTS'
      ? 'bad'
      : status
        ? 'warn'
        : '';
  return `<span class="badge ${cls}">${escapeHtml(label('eligibility', normalized))}</span>`;
}

function evaluationBadge(status) {
  const normalized = status || 'NOT_STARTED';
  const cls = status === 'COMPLETED'
    ? 'ok'
    : status === 'NEEDS_REVIEW'
      ? 'bad'
      : status === 'IN_PROGRESS'
        ? 'warn'
        : '';
  return `<span class="badge ${cls}">${escapeHtml(label('evaluation', normalized))}</span>`;
}

function checkStatusBadge(status) {
  const cls = status === 'PASS' ? 'ok' : 'bad';
  return `<span class="badge ${cls}">${escapeHtml(label('checks', status))}</span>`;
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

function isSafeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch (error) {
    return false;
  }
}

function cssEscape(value) {
  if (window.CSS && CSS.escape) return CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function label(group, value) {
  const key = String(value || '');
  return LABELS[group]?.[key] || key || '';
}

function checkDescription(check) {
  return LABELS.checkDescriptions[check.check_id] || check.description || '';
}

function actionLabel(action) {
  return {
    SUBMISSION_IMPORTED: 'Postulación importada',
    SUBMISSION_REIMPORTED: 'Postulación reimportada',
    SUBMISSION_REPROCESSED: 'Postulación reprocesada',
    POSSIBLE_DUPLICATE_DETECTED: 'Posible duplicado detectado',
    ELIGIBILITY_ASSESSED: 'Admisibilidad evaluada',
    ELIGIBILITY_REVIEW_UPDATED: 'Admisibilidad actualizada',
    DOCUMENT_STATUS_UPDATED: 'Documento actualizado',
    DOCUMENT_OPENED: 'Documento abierto',
    NORMALIZATION_ISSUE_REVIEW_UPDATED: 'Incidencia actualizada',
    CRITERION_EVALUATION_UPDATED: 'Criterio técnico actualizado',
    EVALUATION_RESULT_UPDATED: 'Resumen de evaluación actualizado',
    ADMIN_LOGIN: 'Inicio de sesión',
    ADMIN_LOGOUT: 'Cierre de sesión',
    ADMIN_USER_CREATED: 'Usuario creado',
    ADMIN_USER_UPDATED: 'Usuario actualizado',
  }[action] || action;
}

function entityLabel(entityType) {
  return {
    Submission: 'Postulación',
    Candidate: 'Postulante',
    Document: 'Documento',
    NormalizationIssue: 'Incidencia',
    EligibilityAssessment: 'Admisibilidad',
    CriterionEvaluation: 'Evaluación técnica',
    EvaluationResult: 'Resumen de evaluación',
    AdminUser: 'Usuario',
    AdminSession: 'Sesión',
  }[entityType] || entityType;
}

function importStatusLabel(status) {
  return {
    IMPORTED: 'Importada',
    IMPORTED_WITH_ISSUES: 'Importada con incidencias',
    REIMPORTED: 'Ya importada',
    REPROCESSED: 'Reprocesada',
    REJECTED: 'Rechazada',
  }[status] || status;
}

function pendingWorkBadge(detail) {
  const openIssues = (detail.issues || []).filter(issue =>
    ['OPEN', 'NEEDS_SOURCE_REVIEW'].includes(issue.review_status || 'OPEN')
  ).length;
  const docsToReview = (detail.documents || []).filter(document =>
    ['NEEDS_REVIEW', 'REJECTED'].includes(document.status)
  ).length;
  const badges = [];
  if (openIssues) badges.push(`<span class="badge warn">${escapeHtml(openIssues)} incidencias abiertas</span>`);
  if (docsToReview) badges.push(`<span class="badge warn">${escapeHtml(docsToReview)} documentos por revisar</span>`);
  if (!badges.length) badges.push('<span class="badge ok">Sin pendientes operativos</span>');
  return badges.join('');
}

function printCurrentSummary() {
  if (!selectedDetail) return;
  const summaryWindow = window.open('', '_blank', 'width=980,height=760');
  if (!summaryWindow) {
    alert('El navegador bloqueó la ventana del resumen. Permita ventanas emergentes para este sitio.');
    return;
  }
  summaryWindow.document.open();
  summaryWindow.document.write(summaryHtml(selectedDetail));
  summaryWindow.document.close();
  summaryWindow.focus();
}

function summaryHtml(detail) {
  const candidate = detail.candidate || {};
  const submission = detail.submission || {};
  const eligibility = detail.eligibility_assessment || {};
  const evaluation = detail.evaluation_result || {};
  const criteria = detail.criterion_evaluations || [];
  const documents = detail.documents || [];
  const issues = detail.issues || [];
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Resumen FdF 2026 - ${escapeHtml(fullName(candidate) || submission.submission_id)}</title>
  <style>
    body{font:13px/1.45 Arial,sans-serif;color:#1d252c;margin:28px}
    h1{font-size:22px;margin:0 0 4px}
    h2{font-size:15px;margin:22px 0 8px;border-bottom:1px solid #cfd8dc;padding-bottom:4px}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #d8dee3;padding:7px;text-align:left;vertical-align:top}
    th{background:#eef2f3}
    .muted{color:#63707b}
    .status{display:inline-block;border:1px solid #cfd8dc;padding:2px 6px;margin:2px 4px 2px 0}
    .foot{margin-top:22px;font-size:12px;color:#63707b}
    .actions{display:flex;justify-content:flex-end;margin-bottom:16px}
    button{min-height:34px;border:1px solid #115e59;border-radius:6px;background:#0f766e;color:white;padding:0 12px;cursor:pointer}
    @media print{.actions{display:none}}
  </style>
</head>
<body>
  <div class="actions"><button type="button" onclick="window.print()">Imprimir</button></div>
  <h1>Resumen de expediente FdF 2026</h1>
  <p class="muted">Documento operativo interno. No constituye ranking, selección ni decisión final.</p>
  <h2>Identificación</h2>
  ${summaryTable([
    ['Postulante', fullName(candidate) || 'Sin nombre'],
    ['Correo', candidate.email || ''],
    ['Provincia', candidate.province || ''],
    ['Identificación', candidate.identification_number || ''],
    ['Postulación', submission.submission_id || ''],
    ['Origen', label('sourceChannels', submission.source_channel)],
    ['Referencia', submission.source_reference || ''],
    ['Recibido', formatDate(submission.received_at)],
  ])}
  <h2>Estados operativos</h2>
  <p>
    <span class="status">${escapeHtml(label('normalization', submission.normalization_status))}</span>
    <span class="status">${escapeHtml(label('eligibility', eligibility.status || 'SIN_EVALUAR'))}</span>
    <span class="status">${escapeHtml(label('evaluation', evaluation.status || 'NOT_STARTED'))}</span>
  </p>
  <h2>Documentos</h2>
  ${summaryTable(documents.map(document => [
    label('documents', document.document_type),
    `${label('documents', document.status)} - ${document.original_name || document.storage_reference || ''}`,
  ]))}
  <h2>Admisibilidad preliminar</h2>
  ${summaryTable((eligibility.check_results || []).map(check => [
    label('checks', check.check_id),
    `${label('checks', check.status)}. ${checkDescription(check)}`,
  ]))}
  <h2>Evaluación técnica</h2>
  ${summaryTable(criteria.map(item => [
    item.criterion_label,
    `${label('evaluation', item.status)}${item.score === null || item.score === undefined ? '' : ` - Puntaje: ${item.score}`}${item.evidence_summary ? `. ${item.evidence_summary}` : ''}`,
  ]))}
  <h2>Incidencias</h2>
  ${summaryTable(issues.map(issue => [
    issue.field_code || issue.code,
    `${label('issues', issue.review_status || 'OPEN')}. ${issue.message}`,
  ]))}
  <h2>Respuestas normalizadas</h2>
  ${summaryResponses(detail.responses || [], detail.field_catalog || [])}
  <p class="foot">Generado desde la consola administrativa FdF 2026 el ${escapeHtml(formatDate(new Date().toISOString()))}.</p>
</body>
</html>`;
}

function summaryTable(rows) {
  if (!rows.length) return '<p class="muted">Sin registros.</p>';
  return `<table><tbody>${rows.map(([key, value]) => `
    <tr><th>${escapeHtml(key)}</th><td>${escapeHtml(value)}</td></tr>
  `).join('')}</tbody></table>`;
}

function summaryResponses(responses, fieldCatalog) {
  const fields = new Map(fieldCatalog.map(field => [field.code, field]));
  return summaryTable(responses.map(response => {
    const field = fields.get(response.field_code) || {};
    return [
      `${field.question || response.field_code} (${response.field_code})`,
      formatValue(response.value),
    ];
  }));
}

function resultCountLabel(filtered, total, singular, plural) {
  const noun = filtered === 1 ? singular : plural;
  if (filtered === total) return `${filtered} ${noun}`;
  return `${filtered} de ${total} ${plural}`;
}
