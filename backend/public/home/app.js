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
    SIN_ESTADO: 'Sin estado',
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
};

const loading = document.querySelector('#loading');
const errorPanel = document.querySelector('#errorPanel');
const dashboard = document.querySelector('#dashboard');
const summaryGrid = document.querySelector('#summaryGrid');
const dailyChart = document.querySelector('#dailyChart');
const statusChart = document.querySelector('#statusChart');
const provinceChart = document.querySelector('#provinceChart');
const sourceChart = document.querySelector('#sourceChart');
const workChart = document.querySelector('#workChart');
const weeklyChart = document.querySelector('#weeklyChart');
const criticalChart = document.querySelector('#criticalChart');
const progressChart = document.querySelector('#progressChart');
const criticalTotal = document.querySelector('#criticalTotal');
const progressPercent = document.querySelector('#progressPercent');
const generatedAt = document.querySelector('#generatedAt');
const userBadge = document.querySelector('#userBadge');
const adminLink = document.querySelector('#adminLink');
const logoutButton = document.querySelector('#logoutButton');

logoutButton.addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST', skipAuthRedirect: true }).catch(() => {});
  window.location.replace('/login');
});

boot();

async function boot() {
  try {
    const me = await api('/api/auth/me', { skipAuthRedirect: true });
    renderUser(me.user);
    const stats = await api('/api/home/stats');
    render(stats);
    loading.hidden = true;
    dashboard.hidden = false;
  } catch (error) {
    loading.hidden = true;
    errorPanel.hidden = false;
    errorPanel.textContent = error.message || 'No fue posible cargar el resumen.';
  }
}

function renderUser(user) {
  userBadge.hidden = false;
  userBadge.textContent = `${user.username} - ${label('roles', user.role)}`;
  adminLink.hidden = !['ADMIN', 'REVIEWER', 'INTAKE'].includes(user.role);
}

function render(stats) {
  const totals = stats.totals || {};
  const operational = stats.operational || {};
  const progress = stats.progress || {};
  generatedAt.textContent = stats.generated_at ? `Actualizado ${formatDateTime(stats.generated_at)}` : '';
  renderSummary([
    ['Postulaciones', totals.submissions],
    ['Postulantes', totals.candidates],
    ['Listas para revisión', totals.eligibility_ready],
    ['Pendientes críticos', operational.critical_pending],
    ['Incidencias abiertas', operational.open_issues],
    ['Documentos pendientes', operational.document_tasks],
    ['Evaluación en curso', totals.evaluation_in_progress],
    ['Evaluaciones completadas', totals.evaluation_completed],
  ]);
  renderCritical(operational);
  renderProgress(progress);
  renderDaily(stats.by_day || []);
  renderBars(weeklyChart, stats.by_week || []);
  renderBars(statusChart, [
    ...(stats.by_normalization || []).map(item => ({ ...item, key: label('normalization', item.key) })),
    ...(stats.by_eligibility || []).map(item => ({ ...item, key: label('eligibility', item.key) })),
    ...(stats.by_evaluation || []).map(item => ({ ...item, key: label('evaluation', item.key) })),
  ]);
  renderBars(provinceChart, (stats.by_province || []).slice(0, 12));
  renderBars(sourceChart, (stats.by_source || []).map(item => ({ ...item, key: label('sourceChannels', item.key) })));
  renderBars(workChart, [
    { key: 'Incidencias abiertas', count: operational.open_issues || 0 },
    { key: 'Documentos pendientes', count: operational.document_tasks || 0 },
    { key: 'Listas por evaluar', count: operational.ready_to_evaluate || 0 },
    { key: 'Evaluación en curso', count: operational.evaluation_in_progress || 0 },
    { key: 'Evaluación completada', count: operational.evaluation_completed || 0 },
  ]);
}

function renderCritical(operational) {
  criticalTotal.textContent = String(operational.critical_pending || 0);
  renderBars(criticalChart, [
    { key: 'Incidencias abiertas', count: operational.open_issues || 0 },
    { key: 'Documentos pendientes', count: operational.document_tasks || 0 },
    { key: 'Bloqueadas por requisitos', count: operational.blocked_by_eligibility || 0 },
    { key: 'Admisibilidad por revisar', count: operational.manual_eligibility_review || 0 },
  ]);
}

function renderProgress(progress) {
  const percent = Number(progress.percent_completed || 0);
  progressPercent.textContent = `${percent}%`;
  progressChart.innerHTML = `
    <div class="progress-ring" style="--progress:${percent * 3.6}deg">
      <strong>${percent}%</strong>
      <span>completado</span>
    </div>
    <div class="progress-list">
      <div><span>Universo revisable</span><strong>${Number(progress.reviewable || 0)}</strong></div>
      <div><span>Completadas</span><strong>${Number(progress.evaluated || 0)}</strong></div>
      <div><span>En curso</span><strong>${Number(progress.in_progress || 0)}</strong></div>
      <div><span>Pendientes</span><strong>${Number(progress.pending || 0)}</strong></div>
    </div>
  `;
}

function renderSummary(items) {
  summaryGrid.innerHTML = items.map(([name, value]) => `
    <article class="stat">
      <span>${escapeHtml(name)}</span>
      <strong>${Number(value || 0)}</strong>
    </article>
  `).join('');
}

function renderDaily(rows) {
  if (!rows.length) {
    dailyChart.innerHTML = '<p class="empty">No hay postulaciones registradas.</p>';
    return;
  }
  const max = Math.max(...rows.map(row => row.count), 1);
  const width = Math.max(620, rows.length * 72);
  const height = 250;
  const padding = { top: 24, right: 22, bottom: 46, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = rows.map((row, index) => {
    const x = rows.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (rows.length - 1)) * plotWidth;
    const y = padding.top + plotHeight - (row.count / max) * plotHeight;
    return { ...row, x, y };
  });
  const line = points.map(point => `${point.x},${point.y}`).join(' ');
  const area = [
    `${padding.left},${padding.top + plotHeight}`,
    ...points.map(point => `${point.x},${point.y}`),
    `${padding.left + plotWidth},${padding.top + plotHeight}`,
  ].join(' ');
  const grid = [0, 0.25, 0.5, 0.75, 1].map(step => {
    const y = padding.top + plotHeight - step * plotHeight;
    const value = Math.round(max * step);
    return `
      <g>
        <line class="trend-grid" x1="${padding.left}" y1="${y}" x2="${padding.left + plotWidth}" y2="${y}"></line>
        <text class="trend-axis" x="${padding.left - 10}" y="${y + 4}" text-anchor="end">${value}</text>
      </g>
    `;
  }).join('');

  dailyChart.innerHTML = `
    <svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Tendencia diaria de postulaciones">
      ${grid}
      <polygon class="trend-area" points="${area}"></polygon>
      <polyline class="trend-line" points="${line}"></polyline>
      ${points.map(point => `
        <g class="trend-point">
          <circle cx="${point.x}" cy="${point.y}" r="5"></circle>
          <text class="trend-value" x="${point.x}" y="${point.y - 11}" text-anchor="middle">${point.count}</text>
          <text class="trend-label" x="${point.x}" y="${padding.top + plotHeight + 28}" text-anchor="middle">${escapeHtml(formatDay(point.key))}</text>
        </g>
      `).join('')}
    </svg>
  `;
}

function renderBars(container, rows) {
  if (!rows.length) {
    container.innerHTML = '<p class="empty">Sin datos.</p>';
    return;
  }
  const max = Math.max(...rows.map(row => row.count), 1);
  container.innerHTML = rows.map(row => {
    const percent = Math.max(2, Math.round((row.count / max) * 100));
    return `
      <div class="bar-row">
        <div class="bar-label">
          <span title="${escapeHtml(row.key)}">${escapeHtml(row.key)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${percent}%"></span></span>
        </div>
        <span class="bar-count">${row.count}</span>
      </div>
    `;
  }).join('');
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { 'content-type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });
  if (response.status === 401 && !options.skipAuthRedirect) {
    window.location.replace('/login');
    return null;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || 'Solicitud no completada.');
  return payload;
}

function label(group, value) {
  return LABELS[group]?.[value] || value || 'Sin dato';
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('es-CU', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDay(value) {
  if (value === 'Sin fecha') return value;
  const [year, month, day] = String(value).split('-');
  return `${day}/${month}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
