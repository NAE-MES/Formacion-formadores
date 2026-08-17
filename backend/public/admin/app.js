let submissions = [];
let reviewSummaries = [];
let documentReviewRows = [];
let evaluationMatrixRows = [];
let matrixCriteria = [];
let issueReviewRows = [];
let issueFieldCatalog = [];
let selectedId = '';
let selectedDetail = null;
let currentUser = null;
const selectedIssues = new Set();
const selectedDocuments = new Set();

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
    MISSING: 'No recibido',
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
const workboardRefreshButton = document.querySelector('#workboardRefreshButton');
const workboardSections = document.querySelector('#workboardSections');
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
const issueSearchInput = document.querySelector('#issueSearchInput');
const issueStatusFilter = document.querySelector('#issueStatusFilter');
const issueSeverityFilter = document.querySelector('#issueSeverityFilter');
const issueOriginFilter = document.querySelector('#issueOriginFilter');
const clearIssueFiltersButton = document.querySelector('#clearIssueFiltersButton');
const exportIssuesCsvButton = document.querySelector('#exportIssuesCsvButton');
const selectedIssuesCount = document.querySelector('#selectedIssuesCount');
const bulkIssueStatus = document.querySelector('#bulkIssueStatus');
const bulkIssueNote = document.querySelector('#bulkIssueNote');
const applyBulkIssueButton = document.querySelector('#applyBulkIssueButton');
const selectAllIssues = document.querySelector('#selectAllIssues');
const issueReviewTable = document.querySelector('#issueReviewTable');
const issueReviewCount = document.querySelector('#issueReviewCount');
const issueReviewStats = document.querySelector('#issueReviewStats');
const documentSearchInput = document.querySelector('#documentSearchInput');
const documentStatusFilter = document.querySelector('#documentStatusFilter');
const documentOriginFilter = document.querySelector('#documentOriginFilter');
const clearDocumentFiltersButton = document.querySelector('#clearDocumentFiltersButton');
const exportDocumentsCsvButton = document.querySelector('#exportDocumentsCsvButton');
const selectedDocumentsCount = document.querySelector('#selectedDocumentsCount');
const bulkDocumentStatus = document.querySelector('#bulkDocumentStatus');
const applyBulkDocumentButton = document.querySelector('#applyBulkDocumentButton');
const documentReviewTable = document.querySelector('#documentReviewTable');
const documentReviewCount = document.querySelector('#documentReviewCount');
const matrixSearchInput = document.querySelector('#matrixSearchInput');
const matrixEvaluationFilter = document.querySelector('#matrixEvaluationFilter');
const matrixEligibilityFilter = document.querySelector('#matrixEligibilityFilter');
const clearMatrixFiltersButton = document.querySelector('#clearMatrixFiltersButton');
const exportMatrixCsvButton = document.querySelector('#exportMatrixCsvButton');
const evaluationMatrixHead = document.querySelector('#evaluationMatrixHead');
const evaluationMatrixTable = document.querySelector('#evaluationMatrixTable');
const evaluationMatrixCount = document.querySelector('#evaluationMatrixCount');
const evaluationMatrixStats = document.querySelector('#evaluationMatrixStats');
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
  reviewSummaries = [];
  documentReviewRows = [];
  evaluationMatrixRows = [];
  matrixCriteria = [];
  issueReviewRows = [];
  issueFieldCatalog = [];
  selectedIssues.clear();
  selectedDocuments.clear();
  currentUser = null;
  showLogin();
});

refreshButton.addEventListener('click', loadData);
workboardRefreshButton.addEventListener('click', loadData);
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
issueSearchInput.addEventListener('input', renderIssueReview);
issueStatusFilter.addEventListener('change', renderIssueReview);
issueSeverityFilter.addEventListener('change', renderIssueReview);
issueOriginFilter.addEventListener('change', renderIssueReview);
clearIssueFiltersButton.addEventListener('click', clearIssueFilters);
exportIssuesCsvButton.addEventListener('click', () => exportCsv('/api/admin/issues.csv', 'fdf-2026-issues.csv'));
applyBulkIssueButton.addEventListener('click', applyBulkIssueReview);
selectAllIssues.addEventListener('change', toggleVisibleIssues);
documentSearchInput.addEventListener('input', renderDocumentReview);
documentStatusFilter.addEventListener('change', renderDocumentReview);
documentOriginFilter.addEventListener('change', renderDocumentReview);
clearDocumentFiltersButton.addEventListener('click', clearDocumentFilters);
exportDocumentsCsvButton.addEventListener('click', () => exportCsv('/api/admin/document-review.csv', 'fdf-2026-document-review.csv'));
applyBulkDocumentButton.addEventListener('click', applyBulkDocumentStatus);
matrixSearchInput.addEventListener('input', renderEvaluationMatrix);
matrixEvaluationFilter.addEventListener('change', renderEvaluationMatrix);
matrixEligibilityFilter.addEventListener('change', renderEvaluationMatrix);
clearMatrixFiltersButton.addEventListener('click', clearMatrixFilters);
exportMatrixCsvButton.addEventListener('click', () => exportCsv('/api/admin/evaluation-matrix.csv', 'fdf-2026-evaluation-matrix.csv'));
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
    await applyPageRoute();
    loginPanel.hidden = true;
    appPanel.hidden = false;
    logoutButton.hidden = false;
    loginError.textContent = '';
  } catch (error) {
    showLogin(error.message);
  }
}

function showLogin(message = '') {
  const target = message ? `/login?reason=${encodeURIComponent(message)}` : '/login';
  window.location.replace(target);
}

async function loadData() {
  const [list, review, documents, matrix, issues] = await Promise.all([
    api('/api/admin/submissions'),
    api('/api/admin/review-summary'),
    api('/api/admin/document-review'),
    api('/api/admin/evaluation-matrix'),
    api('/api/admin/issues'),
  ]);
  submissions = list.submissions || [];
  reviewSummaries = review.summaries || [];
  documentReviewRows = documents.rows || [];
  evaluationMatrixRows = matrix.rows || [];
  matrixCriteria = matrix.criteria || [];
  issueReviewRows = issues.issues || [];
  issueFieldCatalog = issues.field_catalog || [];
  renderWorkboard();
  renderTable();
  renderReviewSummary();
  renderIssueReview();
  renderDocumentReview();
  renderEvaluationMatrix();
  if (selectedId) await selectSubmission(selectedId);
  if (currentUser?.role === 'ADMIN') await loadUsers();
}

function applyRoleUi() {
  currentUserBadge.hidden = false;
  currentUserBadge.textContent = `${currentUser.username} - ${label('roles', currentUser.role)}`;
  const canIntake = hasRole('ADMIN', 'INTAKE');
  const canManageUsers = hasRole('ADMIN');
  document.querySelectorAll('[data-view="intake"]').forEach(element => element.hidden = !canIntake);
  document.querySelectorAll('[data-view="users"]').forEach(element => element.hidden = !canManageUsers);
  if (!canIntake && document.querySelector('#view-intake').classList.contains('active')) showView('workboard');
  if (!canManageUsers && document.querySelector('#view-users').classList.contains('active')) showView('workboard');
}

async function applyPageRoute() {
  const match = window.location.pathname.match(/^\/admin\/expedientes(?:\/([^/]+))?\/?$/);
  if (!match) {
    showView('workboard');
    return;
  }
  showView('submissions');
  const submissionId = match[1] ? decodeURIComponent(match[1]) : '';
  if (submissionId) await selectSubmission(submissionId, { syncUrl: false });
}

function hasRole(...roles) {
  return roles.includes(currentUser?.role);
}

function showView(name) {
  tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.view === name));
  views.forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  if (name === 'users' && currentUser?.role === 'ADMIN') loadUsers();
  if (name === 'workboard') renderWorkboard();
  if (name === 'review') renderReviewSummary();
  if (name === 'issues') renderIssueReview();
  if (name === 'documents') renderDocumentReview();
  if (name === 'matrix') renderEvaluationMatrix();
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

function renderWorkboard() {
  const documentBySubmission = new Map(documentReviewRows.map(row => [row.submission_id, row]));
  const rows = reviewSummaries
    .map(row => ({
      ...row,
      document_review: documentBySubmission.get(row.submission_id) || {},
    }))
    .sort((a, b) => workboardPriority(a) - workboardPriority(b) || String(b.received_at).localeCompare(String(a.received_at)));

  workboardSections.innerHTML = `
    <div class="workboard-table-wrap">
      <table class="workboard-table">
        <thead>
          <tr>
            <th>Postulante</th>
            <th>Origen</th>
            <th>Documentos</th>
            <th>Incidencias</th>
            <th>Admisibilidad</th>
            <th>Evaluación técnica</th>
            <th>Recibido</th>
            <th>Acción</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(workboardRow).join('') : `
            <tr>
              <td colspan="8" class="muted">No hay postulaciones registradas.</td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `;

  workboardSections.querySelectorAll('[data-workboard-submission]').forEach(button => {
    button.addEventListener('click', () => openSubmissionPage(button.dataset.workboardSubmission));
  });
}

function workboardRow(row) {
  const documents = row.document_review || {};
  return `
    <tr>
      <td>
        <strong>${escapeHtml(row.full_name || 'Sin nombre')}</strong><br>
        <span class="muted">${escapeHtml(row.email || '')}</span><br>
        <span class="muted">${escapeHtml(row.province || 'Sin provincia')}</span>
      </td>
      <td><span class="badge">${escapeHtml(label('sourceChannels', row.source_channel))}</span></td>
      <td>
        <div class="status-stack">
          <span>Carta aval: ${documentStatusBadge(documents.carta_aval_status || 'MISSING')}</span>
          <span>CV: ${documentStatusBadge(documents.curriculum_status || 'MISSING')}</span>
        </div>
      </td>
      <td>${issueWorkboardBadge(row.open_issue_count || 0)}</td>
      <td>${eligibilityBadge(row.eligibility_status)}</td>
      <td>${technicalWorkboardBadge(row.evaluation_status)}</td>
      <td>${formatDate(row.received_at)}</td>
      <td><button class="compact" type="button" data-workboard-submission="${escapeHtml(row.submission_id)}">Ver expediente</button></td>
    </tr>
  `;
}

function workboardPriority(row) {
  if (Number(row.open_issue_count || 0) > 0) return 1;
  const documents = row.document_review || {};
  if ([documents.carta_aval_status, documents.curriculum_status].some(status => ['MISSING', 'NEEDS_REVIEW', 'REJECTED'].includes(status || 'MISSING'))) return 2;
  if (['BLOCKED_BY_MISSING_REQUIREMENTS', 'REQUIRES_MANUAL_REVIEW'].includes(row.eligibility_status || 'SIN_EVALUAR')) return 3;
  if ((row.evaluation_status || 'NOT_STARTED') === 'IN_PROGRESS') return 4;
  if ((row.evaluation_status || 'NOT_STARTED') === 'NOT_STARTED' && row.eligibility_status === 'READY_FOR_TECHNICAL_REVIEW') return 5;
  if ((row.evaluation_status || 'NOT_STARTED') === 'COMPLETED') return 6;
  return 7;
}

function issueWorkboardBadge(count) {
  const value = Number(count || 0);
  if (!value) return '<span class="badge ok">Sin incidencias abiertas</span>';
  return `<span class="badge warn">${escapeHtml(value)} abiertas</span>`;
}

function technicalWorkboardBadge(status) {
  const normalized = status || 'NOT_STARTED';
  if (normalized === 'NOT_STARTED') return '<span class="badge">Pendiente</span>';
  return evaluationBadge(normalized);
}

function openWorkboardTarget(target, filter = '') {
  if (target === 'issues') {
    clearIssueFilters();
    if (filter === 'OPEN') issueStatusFilter.value = 'OPEN';
    renderIssueReview();
  } else if (target === 'documents') {
    clearDocumentFilters();
    if (filter === 'NEEDS_REVIEW') documentStatusFilter.value = 'NEEDS_REVIEW';
    renderDocumentReview();
  } else if (target === 'matrix') {
    clearMatrixFilters();
    if (filter === 'READY_TO_EVALUATE') {
      matrixEligibilityFilter.value = 'READY_FOR_TECHNICAL_REVIEW';
      matrixEvaluationFilter.value = 'NOT_STARTED';
    } else if (filter === 'IN_PROGRESS') {
      matrixEvaluationFilter.value = 'IN_PROGRESS';
    }
    renderEvaluationMatrix();
  } else if (target === 'review') {
    clearReviewFilters();
    if (filter === 'COMPLETED') reviewEvaluationFilter.value = 'COMPLETED';
    renderReviewSummary();
  } else if (target === 'submissions') {
    window.location.assign('/admin/expedientes');
    return;
  }
  showView(target);
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
      (work === 'ELIGIBILITY_REVIEW' && ['BLOCKED_BY_MISSING_REQUIREMENTS', 'REQUIRES_MANUAL_REVIEW'].includes(itemEligibility)) ||
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
      <td>
        <strong>${escapeHtml(item.full_name || 'Sin nombre')}</strong><br>
        <span class="muted">${escapeHtml(item.province || 'Sin provincia')}</span><br>
        <span class="muted">${formatDate(item.received_at)}</span>
      </td>
      <td>${eligibilityBadge(item.eligibility_status)}</td>
      <td>${evaluationBadge(item.evaluation_status)}</td>
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
    row.addEventListener('click', () => openSubmissionPage(row.dataset.reviewId));
  });
}

function renderIssueReview() {
  const query = normalize(issueSearchInput.value);
  const status = issueStatusFilter.value;
  const severity = issueSeverityFilter.value;
  const origin = issueOriginFilter.value;
  const fieldCatalog = new Map(issueFieldCatalog.map(field => [field.code, field]));
  const rows = issueReviewRows.filter(issue => {
    const field = fieldCatalog.get(issue.field_code) || {};
    const matchesStatus = !status || (issue.review_status || 'OPEN') === status;
    const matchesSeverity = !severity || issue.severity === severity;
    const matchesOrigin = !origin || issue.source_channel === origin;
    const haystack = normalize([
      issue.code,
      issue.message,
      issue.field_code,
      field.question,
      issue.full_name,
      issue.email,
      issue.province,
      issue.submission_id,
      issue.source_channel,
    ].join(' '));
    return matchesStatus && matchesSeverity && matchesOrigin && (!query || haystack.includes(query));
  });

  issueReviewStats.innerHTML = issueStatsHtml(rows);
  issueReviewTable.innerHTML = rows.map(issue => issueReviewRow(issue, fieldCatalog.get(issue.field_code))).join('');
  issueReviewCount.textContent = resultCountLabel(rows.length, issueReviewRows.length, 'incidencia', 'incidencias');
  updateBulkIssueUi();

  issueReviewTable.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', event => {
      if (event.target.closest('button, input, select')) return;
      openSubmissionPage(row.dataset.issueSubmission);
    });
  });
  issueReviewTable.querySelectorAll('[data-issue-quick]').forEach(button => {
    button.addEventListener('click', saveIssueFromReview);
  });
  issueReviewTable.querySelectorAll('[data-issue-select]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedIssues.add(checkbox.dataset.issueSelect);
      else selectedIssues.delete(checkbox.dataset.issueSelect);
      updateBulkIssueUi();
    });
  });
  issueReviewStats.querySelectorAll('[data-issue-status-shortcut]').forEach(button => {
    button.addEventListener('click', () => {
      issueStatusFilter.value = button.dataset.issueStatusShortcut;
      renderIssueReview();
    });
  });
}

function renderDocumentReview() {
  const query = normalize(documentSearchInput.value);
  const status = documentStatusFilter.value;
  const origin = documentOriginFilter.value;
  const rows = documentReviewRows.filter(item => {
    const statuses = [item.carta_aval_status || 'MISSING', item.curriculum_status || 'MISSING'];
    const matchesStatus = !status || statuses.includes(status);
    const matchesOrigin = !origin || item.source_channel === origin;
    const haystack = normalize([
      item.full_name,
      item.email,
      item.province,
      item.submission_id,
      item.candidate_id,
      item.source_channel,
    ].join(' '));
    return matchesStatus && matchesOrigin && (!query || haystack.includes(query));
  });

  documentReviewTable.innerHTML = rows.map(item => `
    <tr data-document-row="${escapeHtml(item.submission_id)}">
      <td><strong>${escapeHtml(item.full_name || 'Sin nombre')}</strong><br><span class="muted">${escapeHtml(item.email || '')}</span></td>
      <td>${escapeHtml(item.province || '')}</td>
      <td><span class="badge">${escapeHtml(label('sourceChannels', item.source_channel))}</span></td>
      <td>${documentReviewCell(item, 'carta_aval')}</td>
      <td>${documentReviewCell(item, 'curriculum')}</td>
      <td>${eligibilityBadge(item.eligibility_status)}</td>
      <td>${formatDate(item.received_at)}</td>
    </tr>
  `).join('');
  documentReviewCount.textContent = resultCountLabel(rows.length, documentReviewRows.length, 'postulación', 'postulaciones');
  updateBulkDocumentUi();

  documentReviewTable.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', event => {
      if (event.target.closest('button, select, a')) return;
      openSubmissionPage(row.dataset.documentRow);
    });
  });
  documentReviewTable.querySelectorAll('[data-document-review-save]').forEach(button => {
    button.addEventListener('click', async event => {
      event.stopPropagation();
      const documentId = button.dataset.documentReviewSave;
      const select = documentReviewTable.querySelector(`[data-document-review-status="${cssEscape(documentId)}"]`);
      await api(`/api/admin/documents/${encodeURIComponent(documentId)}/status`, {
        method: 'PATCH',
        body: {
          status: select.value,
          reason: 'Actualización documental desde la vista de documentos',
        },
      });
      await loadData();
    });
  });
  documentReviewTable.querySelectorAll('[data-document-select]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedDocuments.add(checkbox.dataset.documentSelect);
      else selectedDocuments.delete(checkbox.dataset.documentSelect);
      updateBulkDocumentUi();
    });
  });
  documentReviewTable.querySelectorAll('[data-document-open]').forEach(link => {
    link.addEventListener('click', () => {
      api(`/api/admin/documents/${encodeURIComponent(link.dataset.documentOpen)}/open`, {
        method: 'POST',
      }).catch(() => {});
    });
  });
}

function renderEvaluationMatrix() {
  const query = normalize(matrixSearchInput.value);
  const evaluation = matrixEvaluationFilter.value;
  const eligibility = matrixEligibilityFilter.value;
  const rows = evaluationMatrixRows.filter(item => {
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

  evaluationMatrixHead.innerHTML = `
    <tr>
      <th>Postulante</th>
      <th>Provincia</th>
      <th>Admisibilidad</th>
      <th>Evaluación</th>
      ${matrixCriteria.map(criterion => `<th>${escapeHtml(criterion.label)}</th>`).join('')}
      <th>Recibido</th>
    </tr>
  `;
  evaluationMatrixTable.innerHTML = rows.map(item => `
    <tr data-matrix-id="${escapeHtml(item.submission_id)}">
      <td><strong>${escapeHtml(item.full_name || 'Sin nombre')}</strong><br><span class="muted">${escapeHtml(item.email || '')}</span></td>
      <td>${escapeHtml(item.province || '')}</td>
      <td>${eligibilityBadge(item.eligibility_status)}</td>
      <td>${evaluationBadge(item.evaluation_status)}<br><span class="muted">${escapeHtml(item.completed_criteria || 0)} / ${escapeHtml(item.total_criteria || matrixCriteria.length)}</span></td>
      ${matrixCriteria.map(criterion => matrixCriterionCell(item, criterion)).join('')}
      <td>${formatDate(item.received_at)}</td>
    </tr>
  `).join('');
  evaluationMatrixCount.textContent = resultCountLabel(rows.length, evaluationMatrixRows.length, 'postulación', 'postulaciones');
  evaluationMatrixStats.innerHTML = matrixStatsHtml(rows);

  evaluationMatrixTable.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', event => {
      if (event.target.closest('button, input, select, textarea')) return;
      openSubmissionPage(row.dataset.matrixId);
    });
  });
  evaluationMatrixTable.querySelectorAll('[data-matrix-save]').forEach(button => {
    button.addEventListener('click', saveMatrixCriterion);
  });
  evaluationMatrixStats.querySelectorAll('[data-matrix-status-shortcut]').forEach(button => {
    button.addEventListener('click', () => {
      matrixEvaluationFilter.value = button.dataset.matrixStatusShortcut;
      renderEvaluationMatrix();
    });
  });
}

function matrixStatsHtml(rows) {
  const counts = rows.reduce((acc, item) => {
    const status = item.evaluation_status || 'NOT_STARTED';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  return ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_REVIEW'].map(status => `
    <button class="ghost matrix-stat" type="button" data-matrix-status-shortcut="${escapeHtml(status)}">
      <strong>${escapeHtml(counts[status] || 0)}</strong>
      <span>${escapeHtml(label('evaluation', status))}</span>
    </button>
  `).join('');
}

async function exportReviewCsv() {
  return exportCsv('/api/admin/review-summary.csv', 'fdf-2026-review-summary.csv');
}

async function exportCsv(url, filename) {
  const response = await fetch(url, {
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || `HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function updateBulkIssueUi() {
  selectedIssuesCount.textContent = `${selectedIssues.size} ${selectedIssues.size === 1 ? 'incidencia seleccionada' : 'incidencias seleccionadas'}`;
  applyBulkIssueButton.disabled = !selectedIssues.size || !hasRole('ADMIN', 'REVIEWER');
  const visible = Array.from(issueReviewTable.querySelectorAll('[data-issue-select]'));
  selectAllIssues.checked = visible.length > 0 && visible.every(checkbox => checkbox.checked);
  selectAllIssues.indeterminate = visible.some(checkbox => checkbox.checked) && !selectAllIssues.checked;
}

function updateBulkDocumentUi() {
  selectedDocumentsCount.textContent = `${selectedDocuments.size} ${selectedDocuments.size === 1 ? 'documento seleccionado' : 'documentos seleccionados'}`;
  applyBulkDocumentButton.disabled = !selectedDocuments.size || !hasRole('ADMIN', 'REVIEWER');
}

function toggleVisibleIssues() {
  issueReviewTable.querySelectorAll('[data-issue-select]').forEach(checkbox => {
    checkbox.checked = selectAllIssues.checked;
    if (checkbox.checked) selectedIssues.add(checkbox.dataset.issueSelect);
    else selectedIssues.delete(checkbox.dataset.issueSelect);
  });
  updateBulkIssueUi();
}

async function applyBulkIssueReview() {
  if (!selectedIssues.size) return;
  applyBulkIssueButton.disabled = true;
  applyBulkIssueButton.textContent = 'Aplicando';
  try {
    await api('/api/admin/issues/bulk-review', {
      method: 'PATCH',
      body: {
        issue_ids: Array.from(selectedIssues),
        review_status: bulkIssueStatus.value,
        review_note: bulkIssueNote.value,
        reason: 'Actualización masiva de incidencias desde la consola',
      },
    });
    selectedIssues.clear();
    bulkIssueNote.value = '';
    await loadData();
  } catch (error) {
    alert(error.message);
  } finally {
    applyBulkIssueButton.textContent = 'Aplicar';
    updateBulkIssueUi();
  }
}

async function applyBulkDocumentStatus() {
  if (!selectedDocuments.size) return;
  applyBulkDocumentButton.disabled = true;
  applyBulkDocumentButton.textContent = 'Aplicando';
  try {
    await api('/api/admin/documents/bulk-status', {
      method: 'PATCH',
      body: {
        document_ids: Array.from(selectedDocuments),
        status: bulkDocumentStatus.value,
        reason: 'Actualización masiva documental desde la consola',
      },
    });
    selectedDocuments.clear();
    await loadData();
  } catch (error) {
    alert(error.message);
  } finally {
    applyBulkDocumentButton.textContent = 'Aplicar';
    updateBulkDocumentUi();
  }
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

function clearIssueFilters() {
  issueSearchInput.value = '';
  issueStatusFilter.value = '';
  issueSeverityFilter.value = '';
  issueOriginFilter.value = '';
  renderIssueReview();
}

function clearDocumentFilters() {
  documentSearchInput.value = '';
  documentStatusFilter.value = '';
  documentOriginFilter.value = '';
  renderDocumentReview();
}

function clearMatrixFilters() {
  matrixSearchInput.value = '';
  matrixEvaluationFilter.value = '';
  matrixEligibilityFilter.value = '';
  renderEvaluationMatrix();
}

function applyQuickFilter(filter) {
  clearSubmissionFilters();
  clearReviewFilters();
  clearIssueFilters();
  clearDocumentFilters();
  clearMatrixFilters();
  if (filter === 'CLEAR') {
    showView('workboard');
    return;
  }
  if (filter === 'READY_TO_EVALUATE') {
    eligibilityFilter.value = 'READY_FOR_TECHNICAL_REVIEW';
    evaluationFilter.value = 'NOT_STARTED';
    reviewEligibilityFilter.value = 'READY_FOR_TECHNICAL_REVIEW';
    reviewEvaluationFilter.value = 'NOT_STARTED';
    matrixEligibilityFilter.value = 'READY_FOR_TECHNICAL_REVIEW';
    matrixEvaluationFilter.value = 'NOT_STARTED';
    showView('matrix');
  } else if (filter === 'EVALUATION_IN_PROGRESS') {
    evaluationFilter.value = 'IN_PROGRESS';
    reviewEvaluationFilter.value = 'IN_PROGRESS';
    matrixEvaluationFilter.value = 'IN_PROGRESS';
    showView('matrix');
  } else if (filter === 'OPEN_ISSUES') {
    workFilter.value = 'OPEN_ISSUES';
    issueStatusFilter.value = 'OPEN';
    showView('issues');
  } else if (filter === 'DOCS_TO_REVIEW') {
    workFilter.value = 'DOCS_NEED_REVIEW';
    documentStatusFilter.value = 'NEEDS_REVIEW';
    showView('documents');
  }
  renderTable();
  renderReviewSummary();
  renderIssueReview();
  renderDocumentReview();
  renderEvaluationMatrix();
}

function openSubmissionPage(submissionId) {
  if (!submissionId) return;
  window.location.assign(submissionPageUrl(submissionId));
}

function submissionPageUrl(submissionId) {
  return `/admin/expedientes/${encodeURIComponent(submissionId)}`;
}

async function selectSubmission(submissionId, options = {}) {
  selectedId = submissionId;
  if (options.syncUrl !== false && window.location.pathname.startsWith('/admin/expedientes')) {
    window.history.pushState({}, '', submissionPageUrl(submissionId));
  }
  renderTable();
  detailPanel.innerHTML = '<p class="muted">Cargando...</p>';
  let detail;
  try {
    detail = await api(`/api/admin/submissions/${encodeURIComponent(submissionId)}`);
  } catch (error) {
    detailPanel.innerHTML = `<p class="error">${escapeHtml(error.message || 'No fue posible cargar el expediente.')}</p>`;
    return;
  }
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
      <span class="muted">Configuración de admisibilidad vigente</span><br>
      <span class="muted">Evaluado por ${escapeHtml(actorLabel(assessment.assessed_by || ''))} - ${formatDate(assessment.assessed_at)}</span>
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
      <strong>${escapeHtml(label('documents', document.document_type))}</strong>
      ${documentLink(document)}
      <span class="muted">Estado: ${escapeHtml(label('documents', document.status))} - Recibido: ${formatDate(document.received_at)}</span>
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
  const name = document.original_name || 'Documento sin nombre';
  const reference = document.storage_reference || '';
  const safeReference = isSafeHttpUrl(reference);

  return `
    <div class="document-file">
      <span>Archivo: ${escapeHtml(name)}</span>
      ${reference ? `
        <span>
          Referencia:
          ${safeReference
            ? `<a href="${escapeHtml(reference)}" target="_blank" rel="noopener noreferrer" data-document-open="${escapeHtml(document.document_id)}">${escapeHtml(reference)}</a>`
            : `<code>${escapeHtml(reference)}</code>`}
        </span>
      ` : '<span class="muted">Sin referencia de almacenamiento registrada.</span>'}
    </div>
    ${reference ? `
    <div class="doc-link-row">
      ${safeReference ? `<a href="${escapeHtml(reference)}" target="_blank" rel="noopener noreferrer" data-document-open="${escapeHtml(document.document_id)}">Abrir documento</a>` : '<span class="muted">Referencia no navegable desde el navegador.</span>'}
      <button type="button" class="ghost compact" data-copy="${escapeHtml(document.storage_reference)}">Copiar</button>
    </div>
    ` : ''}
  `;
}

function documentReviewCell(item, prefix) {
  const documentId = item[`${prefix}_id`];
  const status = item[`${prefix}_status`] || 'MISSING';
  const name = item[`${prefix}_name`] || item[`${prefix}_reference`] || '';
  const reference = item[`${prefix}_reference`] || '';
  const canReview = hasRole('ADMIN', 'REVIEWER');
  const checkbox = documentId && canReview
    ? `<input type="checkbox" data-document-select="${escapeHtml(documentId)}" ${selectedDocuments.has(documentId) ? 'checked' : ''} aria-label="Seleccionar documento">`
    : '';
  const link = documentId && isSafeHttpUrl(reference)
    ? `<a href="${escapeHtml(reference)}" target="_blank" rel="noopener noreferrer" data-document-open="${escapeHtml(documentId)}">${escapeHtml(name || 'Documento')}</a>`
    : `<span>${escapeHtml(name || 'Sin archivo registrado')}</span>`;
  const controls = documentId && canReview
    ? `
      <div class="doc-review-actions">
        <select data-document-review-status="${escapeHtml(documentId)}">
          ${documentStatusOptions(status)}
        </select>
        <button class="compact" type="button" data-document-review-save="${escapeHtml(documentId)}">Guardar</button>
      </div>
    `
    : '';
  return `
    <div class="doc-review-cell">
      <div class="doc-review-head">${checkbox}${documentStatusBadge(status)}</div>
      ${link}
      ${controls}
    </div>
  `;
}

function issueReviewRow(issue, field = {}) {
  const canReview = hasRole('ADMIN', 'REVIEWER');
  const status = issue.review_status || 'OPEN';
  return `
    <tr data-issue-submission="${escapeHtml(issue.submission_id)}">
      <td><input type="checkbox" data-issue-select="${escapeHtml(issue.normalization_issue_id)}" ${selectedIssues.has(issue.normalization_issue_id) ? 'checked' : ''} ${canReview ? '' : 'disabled'} aria-label="Seleccionar incidencia"></td>
      <td>
        <strong>${escapeHtml(issue.code)}</strong> ${severityBadge(issue.severity)}<br>
        <span class="muted">${escapeHtml(issue.message || '')}</span><br>
        <span class="muted">${formatDate(issue.created_at)}</span>
      </td>
      <td>
        <strong>${escapeHtml(issue.full_name || 'Sin nombre')}</strong><br>
        <span class="muted">${escapeHtml(issue.email || '')}</span><br>
        <span class="badge">${escapeHtml(label('sourceChannels', issue.source_channel))}</span>
      </td>
      <td>
        <strong>${escapeHtml(issue.field_code || 'General')}</strong><br>
        <span class="muted">${escapeHtml(field.question || '')}</span>
      </td>
      <td>${issueBadge(status)}<br><span class="muted">${escapeHtml(issue.reviewed_by || '')} ${issue.reviewed_at ? formatDate(issue.reviewed_at) : ''}</span></td>
      <td>
        <input class="note-input" data-issue-review-note="${escapeHtml(issue.normalization_issue_id)}" type="text" value="${escapeHtml(issue.review_note || '')}" placeholder="Nota de revisión" ${canReview ? '' : 'disabled'}>
      </td>
      <td>
        <div class="issue-actions">
          ${quickIssueButton(issue, 'ACKNOWLEDGED', 'Reconocer', canReview)}
          ${quickIssueButton(issue, 'RESOLVED', 'Resolver', canReview)}
          ${quickIssueButton(issue, 'NEEDS_SOURCE_REVIEW', 'Revisar fuente', canReview)}
        </div>
      </td>
    </tr>
  `;
}

function quickIssueButton(issue, status, text, canReview) {
  return `<button class="compact ${status === 'RESOLVED' ? '' : 'ghost'}" type="button" data-issue-quick="${escapeHtml(issue.normalization_issue_id)}" data-issue-next-status="${escapeHtml(status)}" ${canReview ? '' : 'disabled'}>${escapeHtml(text)}</button>`;
}

async function saveIssueFromReview(event) {
  event.stopPropagation();
  const button = event.currentTarget;
  const issueId = button.dataset.issueQuick;
  const note = issueReviewTable.querySelector(`[data-issue-review-note="${cssEscape(issueId)}"]`);
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = 'Guardando';
  try {
    await api(`/api/admin/issues/${encodeURIComponent(issueId)}/review`, {
      method: 'PATCH',
      body: {
        review_status: button.dataset.issueNextStatus,
        review_note: note.value,
        reason: 'Actualización de incidencia desde la vista operativa',
      },
    });
    await loadData();
  } catch (error) {
    button.disabled = false;
    button.textContent = originalText;
    alert(error.message);
  }
}

function issueStatsHtml(rows) {
  const counts = rows.reduce((acc, issue) => {
    const status = issue.review_status || 'OPEN';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  return ['OPEN', 'ACKNOWLEDGED', 'NEEDS_SOURCE_REVIEW', 'RESOLVED'].map(status => `
    <button class="ghost issue-stat" type="button" data-issue-status-shortcut="${escapeHtml(status)}">
      <strong>${escapeHtml(counts[status] || 0)}</strong>
      <span>${escapeHtml(label('issues', status))}</span>
    </button>
  `).join('');
}

function matrixCriterionCell(item, criterion) {
  const evaluations = Array.isArray(item.criteria) ? item.criteria : [];
  const evaluation = evaluations.find(candidate => candidate.criterion_id === criterion.criterion_id);
  const status = evaluation?.status || 'NOT_STARTED';
  const score = evaluation?.score ?? '';
  const canReview = hasRole('ADMIN', 'REVIEWER');
  const readOnly = canReview ? '' : 'disabled';
  return `
    <td class="matrix-cell">
      <div class="matrix-cell-head">
        ${evaluationBadge(status)}
        <span class="muted">${escapeHtml(criterion.weight_percent)}%</span>
      </div>
      <div class="matrix-editor">
        <select data-matrix-status="${escapeHtml(item.submission_id)}:${escapeHtml(criterion.criterion_id)}" ${readOnly}>
          ${evaluationStatusOptions(status)}
        </select>
        <input data-matrix-score="${escapeHtml(item.submission_id)}:${escapeHtml(criterion.criterion_id)}" type="number" min="0" max="100" step="0.01" value="${escapeHtml(score)}" placeholder="Puntaje" ${readOnly}>
        ${canReview ? `<button class="compact" type="button" data-matrix-save="${escapeHtml(item.submission_id)}:${escapeHtml(criterion.criterion_id)}">Guardar</button>` : ''}
        <label class="matrix-synthesis">
          <span>Síntesis</span>
          <textarea data-matrix-evidence="${escapeHtml(item.submission_id)}:${escapeHtml(criterion.criterion_id)}" rows="3" placeholder="Elementos que sustentan la revisión" ${readOnly}>${escapeHtml(evaluation?.evidence_summary || '')}</textarea>
        </label>
      </div>
    </td>
  `;
}

async function saveMatrixCriterion(event) {
  event.stopPropagation();
  const button = event.currentTarget;
  const [submissionId, criterionId] = String(button.dataset.matrixSave || '').split(':');
  if (!submissionId || !criterionId) return;
  const key = `${submissionId}:${criterionId}`;
  const status = evaluationMatrixTable.querySelector(`[data-matrix-status="${cssEscape(key)}"]`);
  const score = evaluationMatrixTable.querySelector(`[data-matrix-score="${cssEscape(key)}"]`);
  const evidence = evaluationMatrixTable.querySelector(`[data-matrix-evidence="${cssEscape(key)}"]`);
  button.disabled = true;
  button.textContent = 'Guardando';
  try {
    await api(`/api/admin/submissions/${encodeURIComponent(submissionId)}/evaluation/criteria/${encodeURIComponent(criterionId)}`, {
      method: 'PUT',
      body: {
        status: status.value,
        score: score.value,
        evidence_summary: evidence.value,
        evaluator_note: '',
        reason: 'Actualización de criterio técnico desde la matriz',
      },
    });
    await loadData();
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Guardar';
    alert(error.message);
  }
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
      <span class="muted">${escapeHtml(entityLabel(event.entity_type))} - ${escapeHtml(actorLabel(event.actor || ''))} - ${formatDate(event.occurred_at)}</span><br>
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

function documentStatusBadge(status) {
  const normalized = status || 'MISSING';
  const cls = normalized === 'REJECTED' || normalized === 'MISSING'
    ? 'bad'
    : normalized === 'NEEDS_REVIEW'
      ? 'warn'
      : 'ok';
  return `<span class="badge ${cls}">${escapeHtml(label('documents', normalized))}</span>`;
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

function issueBadge(status) {
  const normalized = status || 'OPEN';
  const cls = normalized === 'RESOLVED'
    ? 'ok'
    : normalized === 'NEEDS_SOURCE_REVIEW'
      ? 'bad'
      : normalized === 'ACKNOWLEDGED'
        ? 'warn'
        : '';
  return `<span class="badge ${cls}">${escapeHtml(label('issues', normalized))}</span>`;
}

function severityBadge(severity) {
  const normalized = severity || '';
  const labels = {
    ERROR: 'Error',
    WARNING: 'Advertencia',
    INFO: 'Informativa',
  };
  const cls = normalized === 'ERROR' ? 'bad' : normalized === 'WARNING' ? 'warn' : '';
  return `<span class="badge ${cls}">${escapeHtml(labels[normalized] || normalized || 'Incidencia')}</span>`;
}

function operationalBadge(item) {
  const status = operationalStatus(item);
  return `<span class="badge ${status.cls}">${escapeHtml(status.label)}</span>`;
}

function operationalStatus(item) {
  const eligibility = item.eligibility_status || 'SIN_EVALUAR';
  const evaluation = item.evaluation_status || 'NOT_STARTED';
  const openIssues = Number(item.open_issue_count || 0);
  const docsRejected = Number(item.documents_rejected || 0);
  const docsReview = Number(item.documents_needs_review || 0);
  const documentStatuses = String(item.document_statuses || '').split(',').filter(Boolean);

  if (openIssues > 0) return { label: 'Revisar incidencias', cls: 'bad' };
  if (docsRejected > 0 || documentStatuses.includes('REJECTED')) return { label: 'Documento rechazado', cls: 'bad' };
  if (docsReview > 0 || documentStatuses.includes('NEEDS_REVIEW')) return { label: 'Revisar documentos', cls: 'warn' };
  if (eligibility === 'BLOCKED_BY_MISSING_REQUIREMENTS') return { label: 'Bloqueada por requisitos', cls: 'bad' };
  if (eligibility === 'REQUIRES_MANUAL_REVIEW') return { label: 'Revisión manual', cls: 'warn' };
  if (eligibility === 'READY_FOR_TECHNICAL_REVIEW' && evaluation === 'NOT_STARTED') return { label: 'Por evaluar', cls: 'warn' };
  if (evaluation === 'IN_PROGRESS') return { label: 'Evaluación en curso', cls: 'warn' };
  if (evaluation === 'NEEDS_REVIEW') return { label: 'Evaluación por revisar', cls: 'bad' };
  if (evaluation === 'COMPLETED') return { label: 'Evaluación completa', cls: 'ok' };
  if (eligibility === 'SIN_EVALUAR') return { label: 'Sin admisibilidad', cls: '' };
  return { label: 'En seguimiento', cls: '' };
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
    DOCUMENT_ASSOCIATED: 'Documento asociado',
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

function actorLabel(actor) {
  return {
    admin: 'Administrador',
    API_ELIGIBILITY_ASSESSOR: 'Evaluador automático',
    ADMIN_UI: 'Consola administrativa',
    ADMIN_TOKEN: 'Acceso técnico',
    API: 'API de ingesta',
  }[actor] || actor;
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
