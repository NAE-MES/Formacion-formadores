let submissions = [];
let selectedId = '';
let currentUser = null;

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
const searchInput = document.querySelector('#searchInput');
const statusFilter = document.querySelector('#statusFilter');
const eligibilityFilter = document.querySelector('#eligibilityFilter');
const evaluationFilter = document.querySelector('#evaluationFilter');
const originFilter = document.querySelector('#originFilter');
const workFilter = document.querySelector('#workFilter');
const refreshButton = document.querySelector('#refreshButton');
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
  submissions = [];
  currentUser = null;
  showLogin();
});

refreshButton.addEventListener('click', loadData);
searchInput.addEventListener('input', renderTable);
statusFilter.addEventListener('change', renderTable);
eligibilityFilter.addEventListener('change', renderTable);
evaluationFilter.addEventListener('change', renderTable);
originFilter.addEventListener('change', renderTable);
workFilter.addEventListener('change', renderTable);
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
  const [summary, list] = await Promise.all([
    api('/api/admin/summary'),
    api('/api/admin/submissions'),
  ]);
  submissions = list.submissions || [];
  renderStats(summary);
  renderTable();
  if (selectedId) await selectSubmission(selectedId);
  if (currentUser?.role === 'ADMIN') await loadUsers();
}

function applyRoleUi() {
  currentUserBadge.hidden = false;
  currentUserBadge.textContent = `${currentUser.username} - ${currentUser.role}`;
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
      showLogin('Sesion expirada o no autorizada.');
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
    offlineImportResult.textContent = 'JSON invalido.';
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
      result.status,
      result.normalization_status,
      result.eligibility_status,
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
    manualImportResult.textContent = 'JSON de respuestas invalido.';
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
      result.status,
      result.normalization_status,
      result.eligibility_status,
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
          <input data-user-password="${escapeHtml(user.username)}" type="password" placeholder="Nueva contrasena">
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
          reason: 'Admin user management update',
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
        reason: 'Admin user created from UI',
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
    .map(role => `<option value="${role}" ${role === selected ? 'selected' : ''}>${role}</option>`)
    .join('');
}

function renderStats(summary) {
  const items = [
    ['Postulantes', summary.candidates],
    ['Postulaciones', summary.submissions],
    ['Documentos', summary.documents],
    ['Incidencias abiertas', summary.open_issues || 0],
    ['Listas revision', summary.eligibility_ready || 0],
    ['Bloqueadas', summary.eligibility_blocked || 0],
    ['Eval. curso', summary.evaluation_in_progress || 0],
    ['Eval. completas', summary.evaluation_completed || 0],
    ['Rev. manual', summary.eligibility_review || 0],
    ['Docs rev.', summary.documents_needs_review || 0],
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
      <td><span class="badge">${escapeHtml(item.source_channel)}</span></td>
      <td>${statusBadge(item.normalization_status)}</td>
      <td>${eligibilityBadge(item.eligibility_status)}</td>
      <td>${evaluationBadge(item.evaluation_status)}</td>
      <td>${documentSummary(item)}</td>
      <td>${issueSummary(item)}</td>
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
      <dt>Admisibilidad</dt><dd>${eligibilityBadge(detail.eligibility_assessment?.status || '')}</dd>
      <dt>Evaluacion</dt><dd>${evaluationBadge(detail.evaluation_result?.status || 'NOT_STARTED')}</dd>
      <dt>Provincia</dt><dd>${escapeHtml(candidate.province || '')}</dd>
      <dt>CI</dt><dd>${escapeHtml(candidate.identification_number || '')}</dd>
    </dl>

    <h3>Admisibilidad preliminar</h3>
    ${renderEligibility(detail.eligibility_assessment, submission.submission_id)}

    <h3>Evaluacion tecnica</h3>
    ${renderTechnicalEvaluation(detail)}

    <h3>Incidencias</h3>
    ${renderIssues(detail.issues || [])}

    <h3>Documentos</h3>
    ${renderDocuments(detail.documents || [])}

    <h3>Respuestas</h3>
    ${renderResponses(detail.responses || [])}

    <h3>Auditoria</h3>
    ${renderAuditEvents(detail.audit_events || [])}
  `;
  bindDetailActions();
}

function renderEligibility(assessment, submissionId) {
  if (!assessment) {
    return `
      <p class="muted">Sin evaluacion preliminar registrada.</p>
      <button type="button" data-eligibility-recalculate="${escapeHtml(submissionId)}">Recalcular</button>
    `;
  }

  return `
    <div class="item">
      <strong>${eligibilityBadge(assessment.status)}</strong><br>
      <span class="muted">${escapeHtml(assessment.assessment_scope)} - ${escapeHtml(assessment.rule_version)}</span><br>
      <span class="muted">Evaluado por ${escapeHtml(assessment.assessed_by || '')} - ${formatDate(assessment.assessed_at)}</span>
      <div class="action-row">
        <select data-eligibility-status="${escapeHtml(assessment.eligibility_assessment_id)}">
          ${eligibilityStatusOptions(assessment.status)}
        </select>
        <button type="button" data-eligibility-save="${escapeHtml(assessment.eligibility_assessment_id)}">Guardar</button>
      </div>
      <input class="note-input" data-eligibility-note="${escapeHtml(assessment.eligibility_assessment_id)}" type="text" value="${escapeHtml(assessment.manual_note || '')}" placeholder="Nota de revision">
      <div class="action-row single">
        <button type="button" class="ghost" data-eligibility-recalculate="${escapeHtml(submissionId)}">Recalcular</button>
      </div>
      ${renderEligibilityChecks(assessment.check_results || [])}
    </div>
  `;
}

function renderEligibilityChecks(checks) {
  if (!checks.length) return '<p class="muted">Sin checks registrados.</p>';
  return `<div class="check-list">${checks.map(check => `
    <div class="check-row">
      ${checkStatusBadge(check.status)}
      <div>
        <strong>${escapeHtml(check.check_id)}</strong><br>
        <span class="muted">${escapeHtml(check.severity)} - ${escapeHtml(check.description || '')}</span>
      </div>
    </div>
  `).join('')}</div>`;
}

function renderTechnicalEvaluation(detail) {
  const criteria = detail.evaluation_criteria || [];
  if (!criteria.length) return '<p class="muted">Catalogo de criterios no configurado.</p>';
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
      <span class="muted">${escapeHtml(criterion.criterion_id)}</span>
      <div class="action-row">
        <select data-evaluation-status="${escapeHtml(criterion.criterion_id)}">
          ${evaluationStatusOptions(evaluation.status || 'NOT_STARTED')}
        </select>
        <input class="score-input" data-evaluation-score="${escapeHtml(criterion.criterion_id)}" type="number" min="0" max="100" step="0.01" value="${escapeHtml(evaluation.score ?? '')}" placeholder="Puntaje">
        <button type="button" data-evaluation-save="${escapeHtml(criterion.criterion_id)}" data-submission-id="${escapeHtml(submissionId)}">Guardar</button>
      </div>
      <textarea data-evaluation-evidence="${escapeHtml(criterion.criterion_id)}" rows="2" placeholder="Elementos que sustentan la revision">${escapeHtml(evaluation.evidence_summary || '')}</textarea>
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
      <span class="muted">${escapeHtml(issue.severity)} - ${escapeHtml(issue.message)}</span>
      <div class="action-row">
        <select data-issue-status="${escapeHtml(issue.normalization_issue_id)}">
          ${issueStatusOptions(issue.review_status || 'OPEN')}
        </select>
        <button type="button" data-issue-save="${escapeHtml(issue.normalization_issue_id)}">Guardar</button>
      </div>
      <input class="note-input" data-issue-note="${escapeHtml(issue.normalization_issue_id)}" type="text" value="${escapeHtml(issue.review_note || '')}" placeholder="Nota de revision">
      <span class="muted">${escapeHtml(issue.reviewed_by || '')} ${issue.reviewed_at ? formatDate(issue.reviewed_at) : ''}</span>
    </div>
  `).join('')}</div>`;
}

function renderDocuments(documents) {
  if (!documents.length) return '<p class="muted">Sin documentos asociados.</p>';
  return `<div class="list">${documents.map(document => `
    <div class="item">
      <strong>${escapeHtml(document.document_type)}</strong><br>
      ${documentLink(document)}
      <span class="muted">${escapeHtml(document.status)} - ${formatDate(document.received_at)}</span>
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
        body: { status: select.value, reason: 'Admin document status update' },
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
          reason: 'Admin normalization issue review update',
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
          reason: 'Admin preliminary eligibility review update',
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
          reason: 'Admin technical criterion review update',
        },
      });
      await loadData();
    });
  });
}

function documentStatusOptions(selected) {
  return ['RECEIVED', 'VALIDATED', 'REJECTED', 'NEEDS_REVIEW']
    .map(status => `<option value="${status}" ${status === selected ? 'selected' : ''}>${status}</option>`)
    .join('');
}

function issueStatusOptions(selected) {
  return ['OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'NEEDS_SOURCE_REVIEW']
    .map(status => `<option value="${status}" ${status === selected ? 'selected' : ''}>${status}</option>`)
    .join('');
}

function eligibilityStatusOptions(selected) {
  return ['READY_FOR_TECHNICAL_REVIEW', 'BLOCKED_BY_MISSING_REQUIREMENTS', 'REQUIRES_MANUAL_REVIEW']
    .map(status => `<option value="${status}" ${status === selected ? 'selected' : ''}>${status}</option>`)
    .join('');
}

function evaluationStatusOptions(selected) {
  return ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_REVIEW']
    .map(status => `<option value="${status}" ${status === selected ? 'selected' : ''}>${status}</option>`)
    .join('');
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

function renderAuditEvents(events) {
  if (!events.length) return '<p class="muted">Sin eventos de auditoria relacionados.</p>';
  return `<div class="list">${events.map(event => `
    <div class="item">
      <strong>${escapeHtml(event.action)}</strong><br>
      <span class="muted">${escapeHtml(event.entity_type)} - ${escapeHtml(event.actor || '')} - ${formatDate(event.occurred_at)}</span><br>
      ${escapeHtml(event.reason || '')}
    </div>
  `).join('')}</div>`;
}

function statusBadge(status) {
  const cls = status === 'NORMALIZED' ? 'ok' : 'warn';
  return `<span class="badge ${cls}">${escapeHtml(status || '')}</span>`;
}

function documentSummary(item) {
  const statuses = String(item.document_statuses || '').split(',').filter(Boolean);
  const flags = statuses.map(status => {
    const cls = status === 'REJECTED' ? 'bad' : status === 'NEEDS_REVIEW' ? 'warn' : 'ok';
    return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
  }).join(' ');
  return `${escapeHtml(item.document_count)} ${flags}`;
}

function issueSummary(item) {
  const open = Number(item.open_issue_count || 0);
  if (!open) return escapeHtml(item.issue_count);
  return `${escapeHtml(item.issue_count)} <span class="badge warn">${escapeHtml(open)} abiertas</span>`;
}

function eligibilityBadge(status) {
  const cls = status === 'READY_FOR_TECHNICAL_REVIEW'
    ? 'ok'
    : status === 'BLOCKED_BY_MISSING_REQUIREMENTS'
      ? 'bad'
      : status
        ? 'warn'
        : '';
  return `<span class="badge ${cls}">${escapeHtml(status || 'SIN_EVALUAR')}</span>`;
}

function evaluationBadge(status) {
  const cls = status === 'COMPLETED'
    ? 'ok'
    : status === 'NEEDS_REVIEW'
      ? 'bad'
      : status === 'IN_PROGRESS'
        ? 'warn'
        : '';
  return `<span class="badge ${cls}">${escapeHtml(status || 'NOT_STARTED')}</span>`;
}

function checkStatusBadge(status) {
  const cls = status === 'PASS' ? 'ok' : 'bad';
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
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
