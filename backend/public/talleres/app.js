let currentUser = null;
let workshops = [];
let registrations = [];
let selectedWorkshopId = 'habana';

const isAdminMode = window.location.pathname.replace(/\/$/, '') === '/talleres/admin';
const userBadge = document.querySelector('#userBadge');
const adminBadgeCard = document.querySelector('#adminBadgeCard');
const workshopTabs = document.querySelector('#workshopTabs');
const workshopTitle = document.querySelector('#workshopTitle');
const workshopDetails = document.querySelector('#workshopDetails');
const agendaList = document.querySelector('#agendaList');
const materialsList = document.querySelector('#materialsList');
const editWorkshopButton = document.querySelector('#editWorkshopButton');
const editAgendaButton = document.querySelector('#editAgendaButton');
const addMaterialButton = document.querySelector('#addMaterialButton');
const workshopDialog = document.querySelector('#workshopDialog');
const agendaDialog = document.querySelector('#agendaDialog');
const materialDialog = document.querySelector('#materialDialog');
const workshopForm = document.querySelector('#workshopForm');
const agendaForm = document.querySelector('#agendaForm');
const materialForm = document.querySelector('#materialForm');
const registrationSummary = document.querySelector('#registrationSummary');
const registrationsSection = document.querySelector('#registros');
const registrationsBody = document.querySelector('#registrationsBody');
const registrationWorkshopLabel = document.querySelector('#registrationWorkshopLabel');
const modalityFilter = document.querySelector('#modalityFilter');
const provinceFilter = document.querySelector('#provinceFilter');
const registrationFilterCount = document.querySelector('#registrationFilterCount');

const ROLE_LABELS = {
  ADMIN: 'Administrador',
  REVIEWER: 'Revisor',
  INTAKE: 'Registro',
  VIEWER: 'Consulta',
};

boot().catch(error => {
  document.body.innerHTML = `<main class="panel"><h1>No se pudo cargar</h1><p>${escapeHtml(error.message)}</p></main>`;
});

async function boot() {
  if (isAdminMode) {
    currentUser = (await api('/api/auth/me')).user;
    userBadge.textContent = `${currentUser.username} · ${ROLE_LABELS[currentUser.role] || currentUser.role}`;
    adminBadgeCard.hidden = false;
    document.querySelectorAll('.admin-only').forEach(item => item.classList.remove('hidden'));
    registrationsSection.classList.remove('hidden');
    toggleManagement(canManage());
  } else {
    toggleManagement(false);
  }
  await loadWorkshops();
  if (isAdminMode) await loadRegistrations();
  bindEvents();
}

function bindEvents() {
  editWorkshopButton.addEventListener('click', openWorkshopDialog);
  editAgendaButton.addEventListener('click', openAgendaDialog);
  addMaterialButton.addEventListener('click', () => openMaterialDialog());
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  workshopForm.addEventListener('submit', saveWorkshop);
  agendaForm.addEventListener('submit', saveAgenda);
  materialForm.addEventListener('submit', saveMaterial);
  modalityFilter?.addEventListener('change', renderRegistrations);
  provinceFilter?.addEventListener('change', renderRegistrations);
}

function toggleManagement(enabled) {
  [editWorkshopButton, editAgendaButton, addMaterialButton].forEach(button => button.classList.toggle('hidden', !enabled));
}

async function loadWorkshops() {
  const result = await api(isAdminMode ? '/api/workshops' : '/api/public/workshops', { publicRequest: !isAdminMode });
  workshops = result.workshops || [];
  if (!workshops.find(item => item.workshop_id === selectedWorkshopId)) {
    selectedWorkshopId = workshops[0]?.workshop_id || '';
  }
  renderTabs();
  renderSelectedWorkshop();
}

async function loadRegistrations() {
  const result = await api('/api/admin/workshop-registrations');
  registrations = result.registrations || [];
  renderProvinceFilter();
  renderRegistrations();
}

function renderTabs() {
  workshopTabs.innerHTML = workshops.map(workshop => `
    <button class="tab ${workshop.workshop_id === selectedWorkshopId ? 'active' : ''}" data-id="${escapeHtml(workshop.workshop_id)}">
      <strong>${escapeHtml(workshop.region || workshop.title)}</strong>
      <span>${escapeHtml(formatDateRange(workshop))}</span>
    </button>
  `).join('');
  workshopTabs.querySelectorAll('.tab').forEach(button => {
    button.addEventListener('click', () => {
      selectedWorkshopId = button.dataset.id;
      renderTabs();
      renderSelectedWorkshop();
    });
  });
}

function renderSelectedWorkshop() {
  const workshop = selectedWorkshop();
  if (!workshop) return;
  workshopTitle.textContent = workshop.title;
  workshopDetails.innerHTML = detailRows([
    ['Región', workshop.region],
    ['Fecha y hora', formatDateRange(workshop)],
    ['Sede', workshop.venue],
    ['Local', workshop.room],
    ['Modalidad', workshop.modality],
    ['Zona horaria', workshop.timezone],
    ['Videoconferencia', workshop.meet_url ? `<a href="${escapeAttr(workshop.meet_url)}" target="_blank" rel="noopener">Abrir Google Meet</a>` : 'Por confirmar'],
    ['Información', workshop.general_info],
  ]);
  renderRegistrationSummary(workshop);
  agendaList.innerHTML = (workshop.agenda || []).length
    ? workshop.agenda.map(item => `
      <article class="agenda-item">
        <div class="agenda-time">${escapeHtml(item.time_range || '')}</div>
        <div>
          <p class="agenda-title">${escapeHtml(item.title)}</p>
          <p class="agenda-desc">${escapeHtml(item.description || '')}</p>
        </div>
      </article>
    `).join('')
    : '<p class="empty">Agenda pendiente.</p>';
  const materials = (workshop.materials || []).filter(material => material.visible !== false || canManage());
  materialsList.innerHTML = materials.length
    ? materials.map(material => `
      <article class="material">
        <div>
          <small>${escapeHtml(material.material_type || 'Material')}</small>
          <h3>${escapeHtml(material.title)}</h3>
          <p>${escapeHtml(material.description || '')}</p>
        </div>
        <div class="material-actions">
          ${material.url ? `<a href="${escapeAttr(material.url)}" target="_blank" rel="noopener">Abrir</a>` : '<span class="empty">Referencia pendiente</span>'}
          ${canManage() ? `<button class="ghost" type="button" data-edit-material="${escapeAttr(material.material_id)}">Editar</button><button class="ghost danger" type="button" data-delete-material="${escapeAttr(material.material_id)}">Quitar</button>` : ''}
        </div>
      </article>
    `).join('')
    : '<p class="empty">No hay materiales publicados.</p>';
  materialsList.querySelectorAll('[data-edit-material]').forEach(button => {
    button.addEventListener('click', () => openMaterialDialog(materials.find(item => item.material_id === button.dataset.editMaterial)));
  });
  materialsList.querySelectorAll('[data-delete-material]').forEach(button => {
    button.addEventListener('click', async () => {
      if (!confirm('¿Quitar este material?')) return;
      await api(`/api/admin/workshop-materials/${encodeURIComponent(button.dataset.deleteMaterial)}`, { method: 'DELETE' });
      await loadWorkshops();
    });
  });
  renderRegistrations();
}

function renderRegistrationSummary(workshop) {
  const summary = workshop.registration_summary || {};
  const total = Number(summary.total || 0);
  const presencial = Number(summary.presencial || 0);
  const virtual = Number(summary.virtual || 0);
  registrationSummary.innerHTML = `
    <div><strong>${total}</strong><span>Registrados</span></div>
    <div><strong>${presencial}</strong><span>Presencial</span></div>
    <div><strong>${virtual}</strong><span>Virtual</span></div>
  `;
}

function renderRegistrations() {
  if (!isAdminMode || !registrationsBody) return;
  const workshop = selectedWorkshop();
  const selectedModality = modalityFilter?.value || '';
  const selectedProvince = provinceFilter?.value || '';
  const rows = registrations
    .map(registration => ({
      registration,
      participation: (registration.participations || []).find(item => item.workshop_id === selectedWorkshopId),
    }))
    .filter(item => item.participation)
    .filter(item => !selectedModality || item.participation.modality === selectedModality)
    .filter(item => !selectedProvince || normalizedText(item.registration.province) === normalizedText(selectedProvince));
  if (registrationWorkshopLabel) registrationWorkshopLabel.value = workshop?.title || '';
  if (registrationFilterCount) {
    registrationFilterCount.textContent = `${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`;
  }
  registrationsBody.innerHTML = rows.length
    ? rows.map(({ registration, participation }) => `
      <tr>
        <td>
          <strong>${escapeHtml([registration.first_name, registration.last_names].filter(Boolean).join(' '))}</strong>
          <span>${escapeHtml(formatDate(registration.registered_at))}</span>
        </td>
        <td>${escapeHtml(registration.participant_type || '')}</td>
        <td>${escapeHtml(workshop?.region || selectedWorkshopId)}</td>
        <td><span class="pill ${participation.modality === 'Presencial' ? 'ok' : 'info'}">${escapeHtml(participation.modality)}</span></td>
        <td>${escapeHtml(registration.province || '')}</td>
        <td>
          <strong>${escapeHtml(registration.institution || '')}</strong>
          <span>${escapeHtml(registration.position_title || '')}</span>
        </td>
        <td>
          <a href="mailto:${escapeAttr(registration.email || '')}">${escapeHtml(registration.email || '')}</a>
          <span>${escapeHtml(registration.phone || '')}</span>
        </td>
        <td>${escapeHtml(registration.image_consent || '')}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="8" class="empty-cell">No hay registros para este taller con los filtros actuales.</td></tr>';
}

function renderProvinceFilter() {
  if (!provinceFilter) return;
  const current = provinceFilter.value;
  const provinces = Array.from(new Set(registrations.map(item => item.province).filter(Boolean)))
    .sort((a, b) => normalizedText(a).localeCompare(normalizedText(b)));
  provinceFilter.innerHTML = '<option value="">Todas</option>' + provinces
    .map(province => `<option value="${escapeAttr(province)}">${escapeHtml(province)}</option>`)
    .join('');
  provinceFilter.value = provinces.includes(current) ? current : '';
}

function detailRows(rows) {
  return rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${String(value || 'Por confirmar')}</dd></div>`).join('');
}

function openWorkshopDialog() {
  const workshop = selectedWorkshop();
  const fields = workshopForm.elements;
  fields.title.value = workshop.title || '';
  fields.region.value = workshop.region || '';
  fields.venue.value = workshop.venue || '';
  fields.room.value = workshop.room || '';
  fields.starts_at.value = toLocalInputValue(workshop.starts_at);
  fields.ends_at.value = toLocalInputValue(workshop.ends_at);
  fields.modality.value = workshop.modality || '';
  fields.meet_url.value = workshop.meet_url || '';
  fields.general_info.value = workshop.general_info || '';
  workshopDialog.showModal();
}

async function saveWorkshop(event) {
  event.preventDefault();
  const fields = workshopForm.elements;
  await api(`/api/admin/workshops/${encodeURIComponent(selectedWorkshopId)}`, {
    method: 'PUT',
    body: {
      title: fields.title.value,
      region: fields.region.value,
      venue: fields.venue.value,
      room: fields.room.value,
      starts_at: fromLocalInputValue(fields.starts_at.value),
      ends_at: fromLocalInputValue(fields.ends_at.value),
      timezone: 'America/Havana',
      modality: fields.modality.value,
      meet_url: fields.meet_url.value,
      general_info: fields.general_info.value,
    },
  });
  workshopDialog.close();
  await loadWorkshops();
}

function openAgendaDialog() {
  const workshop = selectedWorkshop();
  agendaForm.elements.agenda.value = (workshop.agenda || [])
    .map(item => `${item.time_range || ''} | ${item.title || ''} | ${item.description || ''}`)
    .join('\n');
  agendaDialog.showModal();
}

async function saveAgenda(event) {
  event.preventDefault();
  const items = agendaForm.elements.agenda.value.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split('|').map(part => part.trim());
      return {
        position: index + 1,
        time_range: parts[0] || '',
        title: parts[1] || parts[0] || '',
        description: parts.slice(2).join(' | '),
      };
    });
  await api(`/api/admin/workshops/${encodeURIComponent(selectedWorkshopId)}/agenda`, {
    method: 'PUT',
    body: { items },
  });
  agendaDialog.close();
  await loadWorkshops();
}

function openMaterialDialog(material = null) {
  const fields = materialForm.elements;
  fields.material_id.value = material?.material_id || '';
  fields.title.value = material?.title || '';
  fields.material_type.value = material?.material_type || '';
  fields.url.value = material?.url || '';
  fields.description.value = material?.description || '';
  fields.visible.checked = material?.visible !== false;
  materialDialog.showModal();
}

async function saveMaterial(event) {
  event.preventDefault();
  const fields = materialForm.elements;
  await api(`/api/admin/workshops/${encodeURIComponent(selectedWorkshopId)}/materials`, {
    method: 'POST',
    body: {
      material_id: fields.material_id.value,
      title: fields.title.value,
      material_type: fields.material_type.value,
      url: fields.url.value,
      description: fields.description.value,
      visible: fields.visible.checked,
      position: 1,
    },
  });
  materialDialog.close();
  await loadWorkshops();
}

function selectedWorkshop() {
  return workshops.find(item => item.workshop_id === selectedWorkshopId) || workshops[0];
}

function canManage() {
  return isAdminMode && currentUser && ['ADMIN', 'REVIEWER'].includes(currentUser.role);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.body ? { 'content-type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  if (response.status === 401 && !options.publicRequest) {
    window.location.href = '/login';
    throw new Error('Sesión no válida.');
  }
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) throw new Error(payload.error || payload.message || 'Error de comunicación.');
  return payload;
}

function formatDateRange(workshop) {
  const start = workshop.starts_at ? new Date(workshop.starts_at) : null;
  const end = workshop.ends_at ? new Date(workshop.ends_at) : null;
  if (!start || Number.isNaN(start.getTime())) return 'Fecha por confirmar';
  const date = new Intl.DateTimeFormat('es-CU', { dateStyle: 'full', timeZone: workshop.timezone || 'America/Havana' }).format(start);
  const startTime = new Intl.DateTimeFormat('es-CU', { hour: 'numeric', minute: '2-digit', timeZone: workshop.timezone || 'America/Havana' }).format(start);
  const endTime = end && !Number.isNaN(end.getTime())
    ? new Intl.DateTimeFormat('es-CU', { hour: 'numeric', minute: '2-digit', timeZone: workshop.timezone || 'America/Havana' }).format(end)
    : '';
  return `${date} · ${startTime}${endTime ? ' - ' + endTime : ''}`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CU', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Havana',
  }).format(date);
}

function toLocalInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInputValue(value) {
  return value ? new Date(value).toISOString() : null;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function normalizedText(value) {
  return String(value || '').trim().toLocaleLowerCase('es-CU');
}
