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
  buildAutomaticCriterionEvaluations,
  buildCriterionEvaluation,
  criterionById,
  criteriaFromConfig,
  summarizeEvaluation,
  validateEvaluationValidationStatus,
} = require('./evaluation');

const BUSINESS_TIME_ZONE = 'America/Havana';
const OPERATIONAL_RANKING_CUTOFF_DATE = '2026-08-26';

function createApp({ config, repository }) {
  async function handle(req, res) {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        return sendJson(res, 200, { status: 'ok' });
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && req.url === '/') {
        return redirect(res, '/login');
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && (req.url === '/login' || req.url === '/login/')) {
        return sendStatic(res, path.join(__dirname, '..', 'public', 'login', 'index.html'), 'text/html; charset=utf-8');
      }

      if (req.method === 'GET' && req.url.startsWith('/login/')) {
        const relativePath = req.url.replace(/^\/login\//, '') || 'index.html';
        return sendLoginAsset(res, relativePath);
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && (req.url === '/home' || req.url === '/home/')) {
        const admin = await authorizeAdminForPage(req, config, repository);
        if (!admin) return redirect(res, '/login');
        return sendStatic(res, path.join(__dirname, '..', 'public', 'home', 'index.html'), 'text/html; charset=utf-8');
      }

      if (req.method === 'GET' && req.url.startsWith('/home/')) {
        const relativePath = req.url.replace(/^\/home\//, '') || 'index.html';
        return sendHomeAsset(res, relativePath);
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && (req.url === '/admin' || req.url === '/admin/')) {
        const admin = await authorizeAdminForPage(req, config, repository);
        if (!admin) return redirect(res, '/login');
        if (!['ADMIN', 'REVIEWER', 'INTAKE'].includes(admin.role)) return redirect(res, '/home');
        return sendStatic(res, path.join(__dirname, '..', 'public', 'admin', 'index.html'), 'text/html; charset=utf-8');
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && isAdminExpedientesPage(req.url)) {
        const admin = await authorizeAdminForPage(req, config, repository);
        if (!admin) return redirect(res, '/login');
        if (!['ADMIN', 'REVIEWER', 'INTAKE'].includes(admin.role)) return redirect(res, '/home');
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

      if (req.method === 'GET' && req.url === '/api/home/stats') {
        const admin = await authorizeAdmin(req, config, repository);
        return sendJson(res, 200, await buildHomeStats(repository, admin));
      }

      if (req.method === 'GET' && req.url === '/api/home/executive-report.pdf') {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN']);
        const stats = await buildHomeStats(repository, admin);
        const pdf = executiveReportPdf(stats.executive_report, stats);
        return sendPdf(res, `fdf-2026-reporte-ejecutivo-${stats.executive_report.report_date}.pdf`, pdf);
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

      if (req.method === 'GET' && req.url === '/api/admin/preliminary-ranking') {
        await authorizeAdmin(req, config, repository);
        return sendJson(res, 200, { rows: await buildPreliminaryRanking(repository, config) });
      }

      if (req.method === 'GET' && req.url === '/api/admin/selection-policy-analysis') {
        await authorizeAdmin(req, config, repository);
        const rankingRows = await buildPreliminaryRanking(repository, config);
        return sendJson(res, 200, buildSelectionPolicyAnalysis(rankingRows, config.selectionPolicy));
      }

      if (req.method === 'GET' && req.url === '/api/admin/preliminary-ranking.pdf') {
        await authorizeAdmin(req, config, repository);
        const rows = await buildPreliminaryRanking(repository, config);
        return sendPdf(res, 'fdf-2026-ranking-preliminar-no-vinculante.pdf', preliminaryRankingPdf(rows));
      }

      if (req.method === 'GET' && req.url === '/api/admin/evaluation-matrix.csv') {
        await authorizeAdmin(req, config, repository);
        const criteria = criteriaFromConfig(config.evaluationConfig);
        return sendCsv(res, 'fdf-2026-evaluation-matrix.csv', evaluationMatrixCsv(await repository.listEvaluationMatrixRows(), criteria));
      }

      if (req.method === 'GET' && req.url === '/api/admin/preliminary-ranking.csv') {
        await authorizeAdmin(req, config, repository);
        return sendCsv(res, 'fdf-2026-preliminary-ranking.csv', preliminaryRankingCsv(await buildPreliminaryRanking(repository, config)));
      }

      if (req.method === 'GET' && req.url === '/api/admin/selection-policy-analysis.csv') {
        await authorizeAdmin(req, config, repository);
        const rankingRows = await buildPreliminaryRanking(repository, config);
        const analysis = buildSelectionPolicyAnalysis(rankingRows, config.selectionPolicy);
        return sendCsv(res, 'fdf-2026-politica-seleccion-provincial.csv', selectionPolicyCsv(analysis.rows));
      }

      if (req.method === 'GET' && req.url === '/api/admin/selection-policy-analysis.xls') {
        await authorizeAdmin(req, config, repository);
        const rankingRows = await buildPreliminaryRanking(repository, config);
        const analysis = buildSelectionPolicyAnalysis(rankingRows, config.selectionPolicy);
        return sendExcel(res, 'fdf-2026-propuesta-por-provincia.xls', selectionPolicyExcel(analysis));
      }

      if (req.method === 'GET' && req.url === '/api/admin/proposal-summary.pdf') {
        await authorizeAdmin(req, config, repository);
        const rows = await buildPreliminaryRanking(repository, config);
        return sendPdf(res, 'fdf-2026-resumen-personas-propuestas.pdf', proposalSummaryPdf(rows, config.selectionPolicy));
      }

      if (req.method === 'GET' && req.url === '/api/admin/selection-policy-analysis.pdf') {
        await authorizeAdmin(req, config, repository);
        const rankingRows = await buildPreliminaryRanking(repository, config);
        return sendPdf(res, 'fdf-2026-propuestas-por-provincia.pdf', selectionPolicyPdf(buildSelectionPolicyAnalysis(rankingRows, config.selectionPolicy)));
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

      if (req.method === 'POST' && req.url.startsWith('/api/admin/submissions/') && req.url.endsWith('/evaluation/auto-score')) {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN', 'REVIEWER']);
        const submissionId = decodeURIComponent(req.url.slice('/api/admin/submissions/'.length, -'/evaluation/auto-score'.length));
        const scoring = await recalculateAutomaticEvaluation(submissionId, config, repository, admin.username || 'ADMIN_UI');
        return sendJson(res, 200, scoring);
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

      if (req.method === 'PATCH' && req.url.startsWith('/api/admin/evaluation-results/') && req.url.endsWith('/validation')) {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN', 'REVIEWER']);
        const evaluationResultId = decodeURIComponent(req.url.slice('/api/admin/evaluation-results/'.length, -'/validation'.length));
        const payload = await readJson(req);
        const evaluationResult = await updateEvaluationValidation(evaluationResultId, payload, repository, admin.username || 'ADMIN_UI');
        return sendJson(res, 200, { evaluation_result: evaluationResult });
      }

      if (req.method === 'PATCH' && req.url === '/api/admin/proposal-entries/bulk') {
        const admin = await authorizeAdmin(req, config, repository, ['ADMIN', 'REVIEWER']);
        const payload = await readJson(req);
        const entries = await updateProposalEntries(payload, repository, config, admin.username || 'ADMIN_UI');
        return sendJson(res, 200, { entries });
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
  const assessment = await recalculateEligibility(submissionId, config, repository, 'API_ELIGIBILITY_ASSESSOR');
  if (config.evaluationConfig && repository.saveCriterionEvaluation) {
    await recalculateAutomaticEvaluation(submissionId, config, repository, 'API_AUTO_SCORING_ENGINE');
  }
  return assessment;
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

async function recalculateAutomaticEvaluation(submissionId, config, repository, actor) {
  if (!config.evaluationConfig || !repository.getEligibilityInput || !repository.saveCriterionEvaluation) {
    const error = new Error('Automatic scoring is not configured.');
    error.statusCode = 503;
    error.code = 'AUTO_SCORING_NOT_CONFIGURED';
    throw error;
  }
  const input = await repository.getEligibilityInput(submissionId);
  if (!input?.submission) {
    const error = new Error('Submission not found.');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }
  const evaluations = buildAutomaticCriterionEvaluations(input, config.evaluationConfig, actor);
  let result = summarizeEvaluation(input.submission, evaluations, config.evaluationConfig, actor);
  const saved = [];
  for (const evaluation of evaluations) {
    const persisted = await repository.saveCriterionEvaluation(evaluation, result, {
      actor,
      reason: 'Automatic technical scoring from Anexo 1 closed responses.',
    });
    saved.push(persisted.criterion_evaluation);
    result = persisted.evaluation_result;
  }
  return {
    criterion_evaluations: saved,
    evaluation_result: result,
  };
}

async function updateEvaluationValidation(evaluationResultId, payload, repository, actor) {
  if (!repository.updateEvaluationValidation) {
    const error = new Error('Technical validation is not configured.');
    error.statusCode = 503;
    error.code = 'TECHNICAL_VALIDATION_NOT_CONFIGURED';
    throw error;
  }
  const status = String(payload.status || '').trim();
  validateEvaluationValidationStatus(status);
  return repository.updateEvaluationValidation(evaluationResultId, {
    status,
    note: payload.note || '',
    actor,
    reason: payload.reason || 'Technical evaluation validation updated.',
  });
}

async function updateProposalEntries(payload, repository, config, actor) {
  if (!repository.upsertProposalEntry || !repository.listEvaluationMatrixRows) {
    const error = new Error('Proposal management is not configured.');
    error.statusCode = 503;
    error.code = 'PROPOSAL_MANAGEMENT_NOT_CONFIGURED';
    throw error;
  }
  const evaluationResultIds = boundedStringList(payload.evaluation_result_ids, 'evaluation_result_ids');
  const proposalStatus = String(payload.proposal_status || '').trim();
  validateProposalStatus(proposalStatus);
  const rows = await buildPreliminaryRanking(repository, config);
  const byEvaluation = new Map(rows.map(row => [row.evaluation_result_id, row]));
  const now = new Date().toISOString();
  const entries = [];
  for (const evaluationResultId of evaluationResultIds) {
    const row = byEvaluation.get(evaluationResultId);
    if (!row) {
      const error = new Error('Evaluation result not found for proposal.');
      error.statusCode = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
    entries.push(await repository.upsertProposalEntry({
      proposal_entry_id: `prop_${hash(`proposal-entry|${row.submission_id}|${evaluationResultId}`)}`,
      candidate_id: row.candidate_id,
      submission_id: row.submission_id,
      evaluation_result_id: evaluationResultId,
      proposal_status: proposalStatus,
      proposal_note: String(payload.note || ''),
      proposed_at: now,
      proposed_by: actor,
      updated_at: now,
      updated_by: actor,
    }, {
      actor,
      reason: payload.reason || 'Preliminary proposal status updated.',
    }));
  }
  return entries;
}

function validateProposalStatus(status) {
  if (!['NOT_PROPOSED', 'PROPOSED', 'RESERVE', 'REMOVED'].includes(status)) {
    const error = new Error('Invalid proposal status.');
    error.statusCode = 400;
    error.code = 'INVALID_PROPOSAL_STATUS';
    throw error;
  }
}

function sendAdminAsset(res, relativePath) {
  if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
    return sendJson(res, 404, { error: 'NOT_FOUND' });
  }

  const basePath = path.join(__dirname, '..', 'public', 'admin');
  const filePath = path.join(basePath, relativePath);
  if (!filePath.startsWith(basePath)) return sendJson(res, 404, { error: 'NOT_FOUND' });

  return sendStaticAsset(res, filePath, relativePath);
}

function sendLoginAsset(res, relativePath) {
  if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
    return sendJson(res, 404, { error: 'NOT_FOUND' });
  }

  const basePath = path.join(__dirname, '..', 'public', 'login');
  const filePath = path.join(basePath, relativePath);
  if (!filePath.startsWith(basePath)) return sendJson(res, 404, { error: 'NOT_FOUND' });

  return sendStaticAsset(res, filePath, relativePath);
}

function sendHomeAsset(res, relativePath) {
  if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
    return sendJson(res, 404, { error: 'NOT_FOUND' });
  }

  const basePath = path.join(__dirname, '..', 'public', 'home');
  const filePath = path.join(basePath, relativePath);
  if (!filePath.startsWith(basePath)) return sendJson(res, 404, { error: 'NOT_FOUND' });

  return sendStaticAsset(res, filePath, relativePath);
}

function sendStaticAsset(res, filePath, relativePath) {
  const contentType = relativePath.endsWith('.css')
    ? 'text/css; charset=utf-8'
    : relativePath.endsWith('.js')
      ? 'text/javascript; charset=utf-8'
      : 'application/octet-stream';
  return sendStatic(res, filePath, contentType);
}

function isAdminExpedientesPage(url) {
  return /^\/admin\/expedientes(?:\/[^/?#]+)?\/?(?:[?#].*)?$/.test(url || '');
}

async function buildHomeStats(repository, admin = {}) {
  const [summary, submissions, reviews, documents, matrix, issues] = await Promise.all([
    repository.getAdminSummary(),
    repository.listAdminSubmissions(),
    repository.listReviewSummaries(),
    repository.listDocumentReviewRows(),
    repository.listEvaluationMatrixRows(),
    repository.listNormalizationIssueRows(),
  ]);

  const documentTasks = documents.filter(row =>
    ['NEEDS_REVIEW', 'REJECTED'].includes(row.carta_aval_status) ||
    ['MISSING', 'NEEDS_REVIEW', 'REJECTED'].includes(row.curriculum_status)
  );
  const openIssues = issues.filter(issue => ['OPEN', 'NEEDS_SOURCE_REVIEW'].includes(issue.review_status || 'OPEN'));
  const readyToEvaluate = reviews.filter(row =>
    row.eligibility_status === 'READY_FOR_TECHNICAL_REVIEW' &&
    (row.evaluation_status || 'NOT_STARTED') === 'NOT_STARTED'
  );
  const evaluationInProgress = matrix.filter(row => row.evaluation_status === 'IN_PROGRESS');
  const evaluationCompleted = matrix.filter(row => row.evaluation_status === 'COMPLETED');
  const blockedByEligibility = reviews.filter(row => row.eligibility_status === 'BLOCKED_BY_MISSING_REQUIREMENTS');
  const manualEligibility = reviews.filter(row => row.eligibility_status === 'REQUIRES_MANUAL_REVIEW');
  const reviewable = reviews.filter(row =>
    row.eligibility_status === 'READY_FOR_TECHNICAL_REVIEW' ||
    ['IN_PROGRESS', 'COMPLETED', 'NEEDS_REVIEW'].includes(row.evaluation_status || 'NOT_STARTED')
  );

  const stats = {
    generated_at: new Date().toISOString(),
    totals: {
      candidates: Number(summary.candidates || 0),
      submissions: Number(summary.submissions || 0),
      documents: Number(summary.documents || 0),
      normalization_issues: Number(summary.normalization_issues || 0),
      open_issues: Number(summary.open_issues || openIssues.length || 0),
      eligibility_ready: Number(summary.eligibility_ready || 0),
      eligibility_blocked: Number(summary.eligibility_blocked || 0),
      eligibility_review: Number(summary.eligibility_review || 0),
      evaluation_completed: Number(summary.evaluation_completed || 0),
      evaluation_in_progress: Number(summary.evaluation_in_progress || 0),
      evaluation_needs_review: Number(summary.evaluation_needs_review || 0),
      documents_needs_review: Number(summary.documents_needs_review || 0),
      documents_rejected: Number(summary.documents_rejected || 0),
    },
    operational: {
      open_issues: openIssues.length,
      document_tasks: documentTasks.length,
      ready_to_evaluate: readyToEvaluate.length,
      evaluation_in_progress: evaluationInProgress.length,
      evaluation_completed: evaluationCompleted.length,
      blocked_by_eligibility: blockedByEligibility.length,
      manual_eligibility_review: manualEligibility.length,
      critical_pending: openIssues.length + documentTasks.length + blockedByEligibility.length + manualEligibility.length,
    },
    progress: {
      reviewable: reviewable.length,
      evaluated: evaluationCompleted.length,
      in_progress: evaluationInProgress.length,
      pending: Math.max(0, reviewable.length - evaluationCompleted.length - evaluationInProgress.length),
      percent_completed: reviewable.length ? Math.round((evaluationCompleted.length / reviewable.length) * 100) : 0,
    },
    by_day: countByDay(submissions, row => row.received_at),
    by_week: countByWeek(submissions, row => row.received_at),
    by_source: countByValue(submissions, row => row.source_channel || 'SIN_ORIGEN'),
    by_normalization: countByValue(submissions, row => row.normalization_status || 'SIN_ESTADO'),
    by_province: countByValue(submissions, row => row.province || 'Sin provincia'),
    by_eligibility: countByValue(reviews, row => row.eligibility_status || 'SIN_EVALUAR'),
    by_evaluation: countByValue(reviews, row => row.evaluation_status || 'NOT_STARTED'),
  };

  if (admin.role === 'ADMIN') {
    stats.executive_report = buildExecutiveReport({
      submissions,
      reviews,
      documents,
      issues,
      generatedAt: stats.generated_at,
      totals: stats.totals,
      operational: stats.operational,
    });
  }

  return stats;
}

async function buildPreliminaryRanking(repository, config = {}) {
  const [matrixRows, reviewRows, proposalEntries] = await Promise.all([
    repository.listEvaluationMatrixRows(),
    repository.listReviewSummaries(),
    repository.listProposalEntries ? repository.listProposalEntries() : [],
  ]);
  const reviewsBySubmission = new Map(reviewRows.map(row => [row.submission_id, row]));
  const proposalsByEvaluation = new Map((proposalEntries || []).map(row => [row.evaluation_result_id, row]));
  const municipalityNormalizer = createMunicipalityNormalizer(config.municipalitiesCatalog);
  const rows = [];
  for (const row of matrixRows) {
    const review = reviewsBySubmission.get(row.submission_id) || {};
    const totalScore = row.total_score === null || row.total_score === undefined || row.total_score === ''
      ? null
      : Number(row.total_score);
    const eligibilityStatus = row.eligibility_status || review.eligibility_status || 'SIN_EVALUAR';
    const evaluationStatus = row.evaluation_status || review.evaluation_status || 'NOT_STARTED';
    const validationStatus = row.evaluation_validation_status || review.evaluation_validation_status || 'PENDING_TECHNICAL_VALIDATION';
    const proposal = proposalsByEvaluation.get(row.evaluation_result_id || review.evaluation_result_id || detail?.evaluation_result?.evaluation_result_id || '') || {};
    const openIssueCount = Number(review.open_issue_count || 0);
    const receivedDate = dateKeyFromRaw(row.received_at || review.received_at || '');
    const receivedAfterCutoff = isReceivedAfterOperationalCutoff(row.received_at || review.received_at || '');
    const includedInPreliminaryRanking = (
      !receivedAfterCutoff &&
      totalScore !== null &&
      evaluationStatus === 'COMPLETED' &&
      validationStatus === 'VALIDATED_BY_TECHNICAL_TEAM' &&
      eligibilityStatus === 'READY_FOR_TECHNICAL_REVIEW' &&
      openIssueCount === 0
    );
    const municipalityRaw = row.municipality || '';
    const municipalityNormalization = municipalityNormalizer(municipalityRaw, row.province || '');
    rows.push({
      submission_id: row.submission_id,
      candidate_id: row.candidate_id,
      evaluation_result_id: row.evaluation_result_id || review.evaluation_result_id || detail?.evaluation_result?.evaluation_result_id || '',
      full_name: row.full_name || '',
      email: row.email || '',
      province: row.province || '',
      region: row.region || '',
      institution: row.institution || '',
      institution_type: row.institution_type || '',
      municipality: municipalityNormalization.value,
      municipality_raw: municipalityRaw,
      municipality_normalization_status: municipalityNormalization.status,
      gender: row.gender || '',
      age_range: row.age_range || '',
      source_channel: row.source_channel || '',
      received_at: row.received_at || '',
      received_date: receivedDate,
      ranking_cutoff_date: OPERATIONAL_RANKING_CUTOFF_DATE,
      received_after_cutoff: receivedAfterCutoff,
      eligibility_status: eligibilityStatus,
      evaluation_status: evaluationStatus,
      evaluation_validation_status: validationStatus,
      total_score: totalScore,
      completed_criteria: Number(row.completed_criteria || 0),
      total_criteria: Number(row.total_criteria || 0),
      open_issue_count: openIssueCount,
      proposal_entry_id: proposal.proposal_entry_id || '',
      proposal_status: proposal.proposal_status || 'NOT_PROPOSED',
      proposal_note: proposal.proposal_note || '',
      proposal_updated_at: proposal.updated_at || '',
      proposal_updated_by: proposal.updated_by || '',
      included_in_preliminary_ranking: includedInPreliminaryRanking,
      exclusion_reason: preliminaryRankingExclusionReason({
        totalScore,
        eligibilityStatus,
        evaluationStatus,
        validationStatus,
        openIssueCount,
        receivedAfterCutoff,
      }),
    });
  }

  const sorted = rows.sort(preliminaryRankingSort);
  let previousScore = null;
  let currentPosition = 0;
  sorted.forEach((row, index) => {
    if (row.received_after_cutoff || row.total_score === null) {
      row.preliminary_position = null;
      return;
    }
    if (previousScore === null || row.total_score !== previousScore) {
      currentPosition = index + 1;
      previousScore = row.total_score;
    }
    row.preliminary_position = currentPosition;
  });
  return sorted;
}

function responseMap(responses) {
  return new Map((responses || []).map(response => [response.field_code, formatPlainValue(response.value)]));
}

function formatPlainValue(value) {
  if (Array.isArray(value)) return value.join('; ');
  if (value === null || value === undefined) return '';
  return String(value);
}

function preliminaryRankingSort(a, b) {
  if (!!a.received_after_cutoff !== !!b.received_after_cutoff) return a.received_after_cutoff ? 1 : -1;
  if (a.total_score === null && b.total_score === null) return a.full_name.localeCompare(b.full_name);
  if (a.total_score === null) return 1;
  if (b.total_score === null) return -1;
  if (b.total_score !== a.total_score) return b.total_score - a.total_score;
  return a.full_name.localeCompare(b.full_name);
}

function preliminaryRankingExclusionReason({ totalScore, eligibilityStatus, evaluationStatus, validationStatus, openIssueCount, receivedAfterCutoff }) {
  if (receivedAfterCutoff) return `Recibida despues del corte operativo (${OPERATIONAL_RANKING_CUTOFF_DATE}). Valoracion adicional del Equipo Tecnico.`;
  if (totalScore === null) return 'Sin puntaje tecnico completo.';
  if (eligibilityStatus !== 'READY_FOR_TECHNICAL_REVIEW') return 'Admisibilidad no lista para revision tecnica.';
  if (evaluationStatus !== 'COMPLETED') return 'Evaluacion tecnica no completada.';
  if (validationStatus !== 'VALIDATED_BY_TECHNICAL_TEAM') return 'Evaluacion tecnica no validada por el Equipo Tecnico.';
  if (openIssueCount > 0) return 'Tiene incidencias operativas abiertas.';
  return '';
}

function createMunicipalityNormalizer(catalog = {}) {
  const municipalities = Array.isArray(catalog.municipalities) ? catalog.municipalities : [];
  const byProvince = groupBy(municipalities, item => normalizeCatalogText(item.province));
  return (rawValue, province) => {
    const raw = String(rawValue || '').trim();
    if (!raw) return { value: '', status: 'EMPTY' };
    const provinceKey = normalizeCatalogText(province);
    const candidates = byProvince.get(provinceKey) || municipalities;
    const normalizedRaw = normalizeCatalogText(raw);
    if (isProvinceWideMunicipalityText(normalizedRaw)) {
      return { value: raw, status: 'SCOPE_NOT_MUNICIPAL' };
    }
    const exact = candidates.find(item => normalizeCatalogText(item.municipality) === normalizedRaw);
    if (exact) return { value: exact.municipality, status: exact.municipality === raw ? 'OFFICIAL' : 'NORMALIZED' };

    const mentions = candidates.filter(item => municipalityAliases(item).some(alias => wholeTextIncludes(normalizedRaw, alias)));
    if (mentions.length > 1) {
      return { value: raw, status: 'AMBIGUOUS' };
    }
    if (mentions.length === 1) return { value: mentions[0].municipality, status: 'NORMALIZED' };

    const partial = candidates.filter(item => {
      const aliases = municipalityAliases(item);
      return aliases.some(alias => alias.includes(normalizedRaw) || normalizedRaw.includes(alias));
    });
    if (partial.length === 1) return { value: partial[0].municipality, status: 'NORMALIZED' };
    return { value: raw, status: partial.length > 1 ? 'AMBIGUOUS' : 'UNMATCHED' };
  };
}

function isProvinceWideMunicipalityText(normalizedRaw) {
  return /\b(todos|todas|varios|varias|provincia|provincial|restantes|municipios)\b/.test(normalizedRaw);
}

function municipalityAliases(item) {
  const municipality = normalizeCatalogText(item.municipality);
  const aliases = new Set([municipality]);
  if (item.province === 'La Habana') {
    if (item.municipality === 'La Habana Vieja') aliases.add('habana vieja');
    if (item.municipality === 'La Habana del Este') aliases.add('habana del este');
    if (item.municipality === 'Plaza de la Revolución') aliases.add('plaza');
  }
  if (item.municipality === 'Diez de Octubre') aliases.add('10 de octubre');
  if (item.municipality === 'Las Tunas') aliases.add('tunas');
  if (item.municipality === 'Jagüey Grande') aliases.add('jaguey');
  return Array.from(aliases).filter(Boolean);
}

function wholeTextIncludes(text, alias) {
  return new RegExp(`(^|\\s)${escapeRegex(alias)}(\\s|$)`).test(text);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCatalogText(value) {
  return removeAccents(String(value || ''))
    .toLowerCase()
    .replace(/\b10\b/g, 'diez')
    .replace(/\b1ro\b/g, 'primero')
    .replace(/\b1ero\b/g, 'primero')
    .replace(/\b1\b/g, 'primero')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isReceivedAfterOperationalCutoff(value) {
  const key = dateKeyFromRaw(value);
  return key !== 'Sin fecha' && key > OPERATIONAL_RANKING_CUTOFF_DATE;
}

function buildSelectionPolicyAnalysis(rankingRows, policy = {}) {
  const provincialPolicy = policy?.provincial_cohort || {};
  const quota = Number(provincialPolicy.quota_per_province || 4);
  const maxPerMunicipality = Number(provincialPolicy.max_per_municipality || 2);
  const maxPerInstitution = Number(provincialPolicy.max_per_institution || 2);
  const scoreBands = Array.isArray(policy?.score_bands) ? policy.score_bands : [];
  const rows = rankingRows.map(row => ({
    ...row,
    score_band: scoreBand(row.total_score, scoreBands),
    policy_recommendation: row.included_in_preliminary_ranking ? 'PENDING_POLICY_ANALYSIS' : 'NOT_ELIGIBLE_FOR_POLICY',
    policy_recommendation_label: row.included_in_preliminary_ranking ? 'Pendiente de analisis' : 'No elegible para politica provincial',
    policy_alerts: [],
    province_policy_position: null,
  }));

  const byProvince = groupBy(rows.filter(row => row.included_in_preliminary_ranking), row => normalizedPolicyValue(row.province, 'Sin provincia'));
  for (const [province, provinceRows] of byProvince.entries()) {
    const selected = [];
    const municipalityCounts = new Map();
    const institutionCounts = new Map();
    const ordered = [...provinceRows].sort(preliminaryRankingSort);
    const scoreCounts = countByRawValue(ordered, row => scoreKey(row.total_score));

    ordered.forEach((row, index) => {
      row.province_policy_position = index + 1;
      const municipality = normalizedPolicyValue(row.municipality, 'Sin municipio');
      const institution = normalizedPolicyValue(row.institution, 'Sin institucion');
      const alerts = [];
      if ((scoreCounts.get(scoreKey(row.total_score)) || 0) > 1) {
        alerts.push('Empate tecnico: requiere aplicar prioridades aprobadas por el Equipo Tecnico.');
      }
      if (selected.length >= quota) {
        row.policy_recommendation = 'POLICY_RESERVE';
        row.policy_recommendation_label = 'Reserva por cupo provincial';
        alerts.push(`Cupo provincial cubierto (${quota}).`);
      } else if ((municipalityCounts.get(municipality) || 0) >= maxPerMunicipality) {
        row.policy_recommendation = 'POLICY_RESERVE';
        row.policy_recommendation_label = 'Reserva por limite municipal';
        alerts.push(`Limite municipal excedido: maximo ${maxPerMunicipality} por municipio.`);
      } else if ((institutionCounts.get(institution) || 0) >= maxPerInstitution) {
        row.policy_recommendation = 'POLICY_RESERVE';
        row.policy_recommendation_label = 'Reserva por limite institucional';
        alerts.push(`Limite institucional excedido: maximo ${maxPerInstitution} por institucion.`);
      } else {
        row.policy_recommendation = 'POLICY_PROPOSED';
        row.policy_recommendation_label = 'Propuesta segun politica provincial';
        selected.push(row);
        municipalityCounts.set(municipality, (municipalityCounts.get(municipality) || 0) + 1);
        institutionCounts.set(institution, (institutionCounts.get(institution) || 0) + 1);
      }
      row.policy_alerts = alerts;
    });

    if (!ordered.length) {
      byProvince.set(province, []);
    }
  }

  const proposalAlerts = proposalComplianceAlerts(rows, { quota, maxPerMunicipality, maxPerInstitution });
  const summary = selectionPolicySummary(rows, { quota });
  return {
    policy: {
      schema_version: policy?.schema_version || '',
      status: policy?.status || 'DRAFT_PENDING_FINAL_APPROVAL',
      source: policy?.source || '',
      quota_per_province: quota,
      max_per_municipality: maxPerMunicipality,
      max_per_institution: maxPerInstitution,
      tie_breaker_priorities: policy?.tie_breaker_priorities || [],
    },
    summary,
    alerts: proposalAlerts,
    rows,
  };
}

function scoreBand(totalScore, bands) {
  if (totalScore === null || totalScore === undefined || totalScore === '') {
    return { id: 'SIN_PUNTAJE', label: 'Sin puntaje' };
  }
  const score = Number(totalScore);
  const band = bands.find(item => score >= Number(item.min_score) && score <= Number(item.max_score));
  return band ? { id: band.id, label: band.label } : { id: 'SIN_RANGO', label: 'Sin rango configurado' };
}

function proposalComplianceAlerts(rows, policy) {
  const proposed = rows.filter(row => row.proposal_status === 'PROPOSED');
  const alerts = [];
  for (const [province, provinceRows] of groupBy(proposed, row => normalizedPolicyValue(row.province, 'Sin provincia')).entries()) {
    if (provinceRows.length > policy.quota) {
      alerts.push({
        severity: 'WARN',
        type: 'PROVINCE_QUOTA_EXCEEDED',
        message: `${province}: ${provinceRows.length} propuestas para cupo ${policy.quota}.`,
      });
    }
    for (const [municipality, municipalityRows] of groupBy(provinceRows, row => normalizedPolicyValue(row.municipality, 'Sin municipio')).entries()) {
      if (municipalityRows.length > policy.maxPerMunicipality) {
        alerts.push({
          severity: 'WARN',
          type: 'MUNICIPALITY_LIMIT_EXCEEDED',
          message: `${province} / ${municipality}: ${municipalityRows.length} propuestas; maximo ${policy.maxPerMunicipality}.`,
        });
      }
    }
    for (const [institution, institutionRows] of groupBy(provinceRows, row => normalizedPolicyValue(row.institution, 'Sin institucion')).entries()) {
      if (institutionRows.length > policy.maxPerInstitution) {
        alerts.push({
          severity: 'WARN',
          type: 'INSTITUTION_LIMIT_EXCEEDED',
          message: `${province} / ${institution}: ${institutionRows.length} propuestas; maximo ${policy.maxPerInstitution}.`,
        });
      }
    }
  }
  return alerts;
}

function selectionPolicySummary(rows, policy) {
  const provinceNames = Array.from(new Set(rows.map(row => normalizedPolicyValue(row.province, 'Sin provincia')))).sort();
  return {
    total_rows: rows.length,
    after_cutoff: rows.filter(row => row.received_after_cutoff).length,
    cutoff_date: OPERATIONAL_RANKING_CUTOFF_DATE,
    eligible_for_policy: rows.filter(row => row.included_in_preliminary_ranking).length,
    recommended_proposed: rows.filter(row => row.policy_recommendation === 'POLICY_PROPOSED').length,
    recommended_reserve: rows.filter(row => row.policy_recommendation === 'POLICY_RESERVE').length,
    manually_proposed: rows.filter(row => row.proposal_status === 'PROPOSED').length,
    manually_reserve: rows.filter(row => row.proposal_status === 'RESERVE').length,
    provinces: provinceNames.map(province => {
      const provinceRows = rows.filter(row => normalizedPolicyValue(row.province, 'Sin provincia') === province);
      return {
        province,
        quota: policy.quota,
        eligible: provinceRows.filter(row => row.included_in_preliminary_ranking).length,
        recommended_proposed: provinceRows.filter(row => row.policy_recommendation === 'POLICY_PROPOSED').length,
        recommended_reserve: provinceRows.filter(row => row.policy_recommendation === 'POLICY_RESERVE').length,
        after_cutoff: provinceRows.filter(row => row.received_after_cutoff).length,
        manually_proposed: provinceRows.filter(row => row.proposal_status === 'PROPOSED').length,
        manually_reserve: provinceRows.filter(row => row.proposal_status === 'RESERVE').length,
        incomplete_reason: provinceCompletionReason(provinceRows, policy),
      };
    }),
  };
}

function provinceCompletionReason(provinceRows, policy) {
  const quota = Number(policy.quota || 0);
  const proposed = provinceRows.filter(row => row.policy_recommendation === 'POLICY_PROPOSED').length;
  if (!quota || proposed >= quota) return '';

  const eligible = provinceRows.filter(row => row.included_in_preliminary_ranking).length;
  if (!eligible) return `No hay postulaciones elegibles para el corte operativo.`;
  if (eligible < quota) return `Solo hay ${eligible} postulaciones elegibles para cupo ${quota}.`;

  const reserveReasons = provinceRows
    .filter(row => row.policy_recommendation === 'POLICY_RESERVE')
    .map(row => row.policy_recommendation_label)
    .filter(Boolean);
  if (reserveReasons.some(reason => /municipal/i.test(reason)) || reserveReasons.some(reason => /institucional/i.test(reason))) {
    return `No completa cupo por limites de distribucion municipal o institucional.`;
  }
  return `No completa cupo con las reglas de propuesta configuradas.`;
}

function groupBy(rows, getter) {
  return rows.reduce((groups, row) => {
    const key = getter(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
    return groups;
  }, new Map());
}

function countByRawValue(rows, getter) {
  return rows.reduce((counts, row) => {
    const key = getter(row);
    counts.set(key, (counts.get(key) || 0) + 1);
    return counts;
  }, new Map());
}

function normalizedPolicyValue(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function scoreKey(value) {
  return value === null || value === undefined || value === '' ? 'SIN_PUNTAJE' : Number(value).toFixed(4);
}

function buildExecutiveReport({ submissions, reviews, documents, issues, generatedAt, totals, operational }) {
  const todayKey = dateKeyInTimeZone(new Date(generatedAt), BUSINESS_TIME_ZONE);
  const submissionsToday = submissions.filter(row => dateKeyFromRaw(row.received_at) === todayKey);
  const openIssueSubmissionIds = new Set(
    issues
      .filter(issue => ['OPEN', 'NEEDS_SOURCE_REVIEW'].includes(issue.review_status || 'OPEN'))
      .map(issue => issue.submission_id)
      .filter(Boolean),
  );
  const documentTaskSubmissionIds = new Set(
    documents
      .filter(row =>
        ['NEEDS_REVIEW', 'REJECTED'].includes(row.carta_aval_status) ||
        ['MISSING', 'NEEDS_REVIEW', 'REJECTED'].includes(row.curriculum_status)
      )
      .map(row => row.submission_id)
      .filter(Boolean),
  );
  const reviewsBySubmission = new Map((reviews || []).map(row => [row.submission_id, row]));
  const recentSubmissions = [...submissions]
    .sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)))
    .slice(0, 80);

  return {
    report_date: todayKey,
    generated_at: generatedAt,
    headline: {
      received_today: submissionsToday.length,
      accumulated_submissions: Number(totals.submissions || 0),
      ready_for_review: Number(operational.ready_to_evaluate || 0),
      evaluation_in_progress: Number(operational.evaluation_in_progress || 0),
      critical_pending: Number(operational.critical_pending || 0),
    },
    today_by_source: countByValue(submissionsToday, row => row.source_channel || 'SIN_ORIGEN'),
    today_by_province: countByValue(submissionsToday, row => row.province || 'Sin provincia'),
    today_by_status: countByValue(submissionsToday, row => {
      const review = reviewsBySubmission.get(row.submission_id) || row;
      return review.evaluation_status || review.eligibility_status || row.normalization_status || 'Sin estado';
    }),
    evaluation_distribution: countByValue(reviews, row => statusLabelForPdf(row.evaluation_status || 'NOT_STARTED')),
    eligibility_distribution: countByValue(reviews, row => statusLabelForPdf(row.eligibility_status || 'SIN_EVALUAR')),
    recent_by_day: countByDay(recentSubmissions.slice().reverse(), row => row.received_at).slice(-14),
    candidates: recentSubmissions.map(row => {
      const review = reviewsBySubmission.get(row.submission_id) || row;
      return {
        submission_id: row.submission_id,
        full_name: row.full_name || 'Sin nombre',
        province: row.province || 'Sin provincia',
        source_channel: row.source_channel || '',
        received_at: row.received_at || '',
        normalization_status: row.normalization_status || '',
        eligibility_status: review.eligibility_status || row.eligibility_status || 'SIN_EVALUAR',
        evaluation_status: review.evaluation_status || row.evaluation_status || 'NOT_STARTED',
        open_issue_count: Number(row.open_issue_count || 0),
        document_task: documentTaskSubmissionIds.has(row.submission_id),
        issue_task: openIssueSubmissionIds.has(row.submission_id),
      };
    }),
  };
}

function dateKeyFromRaw(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? dateKeyInTimeZone(date, BUSINESS_TIME_ZONE) : 'Sin fecha';
}

function countByDay(rows, getter) {
  const counts = new Map();
  for (const row of rows || []) {
    const rawValue = getter(row);
    const label = dateKeyFromRaw(rawValue);
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return mapEntries(counts).sort((a, b) => a.key.localeCompare(b.key));
}

function countByWeek(rows, getter) {
  const counts = new Map();
  for (const row of rows || []) {
    const rawValue = getter(row);
    const date = rawValue ? new Date(rawValue) : null;
    const label = date && !Number.isNaN(date.getTime()) ? weekLabel(date, BUSINESS_TIME_ZONE) : 'Sin fecha';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return mapEntries(counts).sort((a, b) => a.key.localeCompare(b.key));
}

function countByValue(rows, getter) {
  const counts = new Map();
  for (const row of rows || []) {
    const key = String(getter(row) || 'Sin dato').trim() || 'Sin dato';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return mapEntries(counts).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function dateKeyInTimeZone(date, timeZone) {
  const parts = datePartsInTimeZone(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function weekLabel(date, timeZone = 'UTC') {
  const parts = datePartsInTimeZone(date, timeZone);
  const copy = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
  return `${copy.getUTCFullYear()}-S${String(week).padStart(2, '0')}`;
}

function datePartsInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function mapEntries(counts) {
  return Array.from(counts.entries()).map(([key, count]) => ({ key, count }));
}

async function authorizeAdminForPage(req, config, repository) {
  try {
    return await authorizeAdmin(req, config, repository);
  } catch (error) {
    if (error.statusCode === 401) return null;
    throw error;
  }
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

function sendExcel(res, filename, content) {
  const body = Buffer.from(content, 'utf8');
  res.writeHead(200, {
    'content-type': 'application/vnd.ms-excel; charset=utf-8',
    'content-disposition': `attachment; filename="${filename}"`,
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function sendPdf(res, filename, content) {
  const body = Buffer.isBuffer(content) ? content : Buffer.from(content);
  res.writeHead(200, {
    'content-type': 'application/pdf',
    'content-disposition': `attachment; filename="${filename}"`,
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

function executiveReportPdf(report, stats) {
  const rows = [];
  rows.push({ type: 'title', text: 'Reporte ejecutivo diario FdF 2026' });
  rows.push({ type: 'muted', text: `Dia operativo: ${report.report_date}   Generado: ${formatPdfDate(report.generated_at)}` });
  rows.push({ type: 'space' });
  rows.push({ type: 'section', text: 'Indicadores principales' });
  rows.push({ type: 'text', text: `Recibidas hoy: ${report.headline.received_today}    Acumuladas: ${report.headline.accumulated_submissions}    Pendientes criticos: ${report.headline.critical_pending}` });
  rows.push({ type: 'text', text: `Listas por evaluar: ${report.headline.ready_for_review}    En evaluacion: ${report.headline.evaluation_in_progress}    Evaluaciones completadas: ${stats.totals.evaluation_completed || 0}` });
  rows.push({ type: 'space' });
  rows.push({ type: 'section', text: 'Origen del dia' });
  rows.push(...pdfBarRows(report.today_by_source, sourceChannelLabel));
  rows.push({ type: 'space' });
  rows.push({ type: 'section', text: 'Provincias del dia' });
  rows.push(...pdfBarRows(report.today_by_province.slice(0, 8)));
  rows.push({ type: 'space' });
  rows.push({ type: 'section', text: 'Estados del dia' });
  rows.push(...pdfBarRows(report.today_by_status, statusLabelForPdf));
  rows.push({ type: 'space' });
  rows.push({ type: 'section', text: 'Postulantes recientes' });
  rows.push(...report.candidates.slice(0, 28).map(row => ({
    type: 'text',
    text: `${formatPdfDate(row.received_at)} | ${row.full_name} | ${row.province || 'Sin provincia'} | ${sourceChannelLabel(row.source_channel)} | ${statusLabelForPdf(row.eligibility_status)} | ${statusLabelForPdf(row.evaluation_status)}`,
  })));
  return buildSimplePdf(rows);
}

function preliminaryRankingPdf(rankingRows) {
  const rows = [];
  const included = rankingRows.filter(row => row.included_in_preliminary_ranking).length;
  const afterCutoff = rankingRows.filter(row => row.received_after_cutoff);
  rows.push({ type: 'title', text: 'Ranking preliminar no vinculante FdF 2026' });
  rows.push({ type: 'muted', text: `Generado: ${formatPdfDate(new Date().toISOString())}   Registros: ${rankingRows.length}   Incluidos preliminarmente: ${included}` });
  rows.push({ type: 'muted', text: `Corte operativo aplicado: postulaciones recibidas hasta ${OPERATIONAL_RANKING_CUTOFF_DATE}. Recibidas despues del corte: ${afterCutoff.length}.` });
  rows.push({ type: 'muted', text: 'No aplica cupos, no resuelve desempates y no constituye aprobacion final.' });
  rows.push({ type: 'space' });
  rows.push({ type: 'section', text: 'Primeras posiciones operativas' });
  rows.push(...rankingRows.filter(row => !row.received_after_cutoff).slice(0, 40).map(row => ({
    type: 'text',
    text: `${row.preliminary_position || '-'} | ${formatScoreForPdf(row.total_score)} | ${row.full_name} | ${row.province || 'Sin provincia'} | ${row.institution || 'Sin institucion'} | ${statusLabelForPdf(row.evaluation_validation_status)} | ${proposalStatusLabel(row.proposal_status)}`,
  })));
  if (afterCutoff.length) {
    rows.push({ type: 'space' });
    rows.push({ type: 'section', text: 'Recibidas despues del corte para valoracion adicional' });
    rows.push(...afterCutoff.slice(0, 35).map(row => ({
      type: 'text',
      text: `${row.received_date || '-'} | ${formatScoreForPdf(row.total_score)} | ${row.full_name} | ${row.province || 'Sin provincia'} | ${row.institution || 'Sin institucion'} | ${statusLabelForPdf(row.evaluation_validation_status)}`,
    })));
  }
  return buildSimplePdf(rows);
}

function proposalSummaryPdf(rankingRows, policy) {
  const proposedRows = rankingRows.filter(row => ['PROPOSED', 'RESERVE'].includes(row.proposal_status));
  const policyAnalysis = buildSelectionPolicyAnalysis(rankingRows, policy);
  const rows = [];
  rows.push({ type: 'title', text: 'Resumen de personas propuestas FdF 2026' });
  rows.push({ type: 'muted', text: `Generado: ${formatPdfDate(new Date().toISOString())}   Personas en propuesta/reserva: ${proposedRows.length}` });
  rows.push({ type: 'muted', text: 'Documento operativo interno. No constituye aprobacion final ni seleccion automatica.' });
  rows.push({ type: 'muted', text: `Politica provincial: cupo ${policyAnalysis.policy.quota_per_province}; maximo ${policyAnalysis.policy.max_per_municipality} por municipio y ${policyAnalysis.policy.max_per_institution} por institucion.` });
  rows.push({ type: 'space' });
  rows.push({ type: 'section', text: 'Alertas de cumplimiento' });
  if (!policyAnalysis.alerts.length) rows.push({ type: 'muted', text: 'No se detectan alertas en la propuesta manual marcada.' });
  rows.push(...policyAnalysis.alerts.slice(0, 16).map(alert => ({ type: 'text', text: alert.message })));
  rows.push({ type: 'space' });
  rows.push({ type: 'section', text: 'Personas propuestas o en reserva' });
  if (!proposedRows.length) rows.push({ type: 'muted', text: 'No hay personas marcadas como propuesta o reserva.' });
  rows.push(...proposedRows.map(row => ({
    type: 'text',
    text: `${proposalStatusLabel(row.proposal_status)} | ${row.preliminary_position || '-'} | ${formatScoreForPdf(row.total_score)} | ${row.full_name} | ${row.province || 'Sin provincia'} | ${row.institution || 'Sin institucion'} | ${truncateText(row.proposal_note || row.exclusion_reason || 'Sin nota', 36)}`,
  })));
  return buildSimplePdf(rows);
}

function selectionPolicyPdf(analysis) {
  const rows = [];
  rows.push({ type: 'title', text: 'Propuestas por provincia FdF 2026' });
  rows.push({ type: 'muted', text: `Generado: ${formatPdfDate(new Date().toISOString())}   Version: ${analysis.policy.schema_version || 'Sin version'}` });
  rows.push({ type: 'muted', text: 'Informe operativo para revision del Equipo Tecnico. No constituye aprobacion final.' });
  rows.push({ type: 'space' });
  rows.push({ type: 'section', text: 'Resumen general' });
  rows.push({ type: 'text', text: `Cupo por provincia: ${analysis.policy.quota_per_province}; propuesta sugerida: ${analysis.summary.recommended_proposed}; reserva sugerida: ${analysis.summary.recommended_reserve}.` });
  rows.push({ type: 'text', text: `Elegibles para politica: ${analysis.summary.eligible_for_policy}; total visible: ${analysis.summary.total_rows}.` });
  rows.push({ type: 'text', text: `Corte operativo: hasta ${analysis.summary.cutoff_date || OPERATIONAL_RANKING_CUTOFF_DATE}; recibidas despues del corte: ${analysis.summary.after_cutoff || 0}.` });
  rows.push({ type: 'space' });
  rows.push({ type: 'section', text: 'Resumen por provincia' });
  rows.push(...analysis.summary.provinces.map(row => ({
    type: 'text',
    text: `${row.province}: propuesta ${row.recommended_proposed}/${row.quota}; reserva ${row.recommended_reserve}; fuera de termino ${row.after_cutoff || 0}${row.incomplete_reason ? `; ${row.incomplete_reason}` : ''}`,
  })));
  rows.push({ type: 'space' });
  const byProvince = groupBy(analysis.rows || [], row => normalizedPolicyValue(row.province, 'Sin provincia'));
  for (const [province, provinceRows] of Array.from(byProvince.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const proposed = provinceRows
      .filter(row => row.policy_recommendation === 'POLICY_PROPOSED')
      .sort(selectionWorkbookSort);
    const reserve = provinceRows
      .filter(row => row.policy_recommendation === 'POLICY_RESERVE')
      .sort(selectionWorkbookSort);
    const afterCutoff = provinceRows
      .filter(row => row.received_after_cutoff)
      .sort(selectionWorkbookSort);
    const summary = (analysis.summary.provinces || []).find(row => row.province === province);

    rows.push({ type: 'section', text: province });
    rows.push({
      type: 'muted',
      text: `Propuesta ${proposed.length}/${summary?.quota || analysis.policy.quota_per_province}; reserva ${reserve.length}; fuera de termino ${afterCutoff.length}${summary?.incomplete_reason ? `; ${summary.incomplete_reason}` : ''}`,
    });
    appendProposalPdfRows(rows, 'Propuesta sugerida', proposed);
    appendProposalPdfRows(rows, 'Reserva sugerida', reserve);
    appendProposalPdfRows(rows, 'Fuera de termino', afterCutoff);
    rows.push({ type: 'space' });
  }
  return buildSimplePdf(rows);
}

function appendProposalPdfRows(rows, title, proposalRows) {
  rows.push({ type: 'muted', text: title });
  if (!proposalRows.length) {
    rows.push({ type: 'muted', text: 'Sin registros.' });
    return;
  }
  rows.push(...proposalRows.map(row => ({
    type: 'text',
    text: `${row.province_policy_position || '-'} | ${formatScoreForPdf(row.total_score)} | ${row.full_name} | ${row.institution || 'Sin institucion'} | ${row.policy_recommendation_label || selectionCategory(row)}`,
  })));
}

function formatScoreForPdf(value) {
  if (value === null || value === undefined || value === '') return 'Pendiente';
  const score = Number(value);
  return Number.isFinite(score) ? score.toFixed(2).replace(/\.00$/, '') : 'Pendiente';
}

function pdfBarRows(rows, labeler = value => value) {
  const max = Math.max(...(rows || []).map(row => Number(row.count || 0)), 1);
  if (!rows || !rows.length) return [{ type: 'muted', text: 'Sin datos.' }];
  return rows.map(row => ({
    type: 'bar',
    label: labeler(row.key),
    count: Number(row.count || 0),
    width: Math.max(8, Math.round((Number(row.count || 0) / max) * 145)),
  }));
}

function buildSimplePdf(rows) {
  const objects = [];
  const pages = [];
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 42;
  const lineHeight = 15;
  let content = '';
  let y = pageHeight - margin;

  function newPage() {
    if (content) pages.push(content);
    content = '';
    y = pageHeight - margin;
  }

  function ensureSpace(height = lineHeight) {
    if (y - height < margin) newPage();
  }

  for (const row of rows) {
    if (row.type === 'space') {
      y -= 8;
      continue;
    }
    if (row.type === 'title') {
      ensureSpace(24);
      content += `BT /F1 17 Tf 42 ${y} Td (${pdfEscape(row.text)}) Tj ET\n`;
      y -= 26;
      continue;
    }
    if (row.type === 'section') {
      ensureSpace(22);
      content += `BT /F1 12 Tf 42 ${y} Td (${pdfEscape(row.text)}) Tj ET\n`;
      content += `0.09 0.31 0.65 rg 42 ${y - 5} 190 1.2 re f\n`;
      y -= 20;
      continue;
    }
    if (row.type === 'bar') {
      ensureSpace(18);
      content += `BT /F1 8 Tf 42 ${y} Td (${pdfEscape(truncateText(row.label, 48))}) Tj ET\n`;
      content += `0.91 0.95 0.98 rg 255 ${y - 3} 150 8 re f\n`;
      content += `0.09 0.31 0.65 rg 255 ${y - 3} ${row.width} 8 re f\n`;
      content += `BT /F1 8 Tf 414 ${y} Td (${row.count}) Tj ET\n`;
      y -= 15;
      continue;
    }
    ensureSpace(14);
    const fontSize = row.type === 'muted' ? 8 : 8.5;
    content += `BT /F1 ${fontSize} Tf 42 ${y} Td (${pdfEscape(truncateText(row.text, 116))}) Tj ET\n`;
    y -= 13;
  }
  if (content) pages.push(content);

  const fontId = addObject(objects, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageStreams = [];
  for (const pageContent of pages) {
    const stream = `<< /Length ${Buffer.byteLength(pageContent, 'latin1')} >>\nstream\n${pageContent}endstream`;
    const contentId = addObject(objects, stream);
    pageStreams.push({ contentId });
  }
  const kids = [];
  const pageRefs = [];
  for (const page of pageStreams) {
    const pageId = objects.length + 1;
    pageRefs.push(pageId);
    kids.push(`${pageId} 0 R`);
    addObject(objects, `<< /Type /Page /Parent PAGES_REF /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${page.contentId} 0 R >>`);
  }
  const pagesId = addObject(objects, `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`);
  for (const pageId of pageRefs) {
    objects[pageId - 1] = objects[pageId - 1].replace('PAGES_REF', `${pagesId} 0 R`);
  }
  const catalogId = addObject(objects, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

function addObject(objects, content) {
  objects.push(content);
  return objects.length;
}

function pdfEscape(value) {
  return removeAccents(String(value ?? ''))
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function removeAccents(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function truncateText(value, maxLength) {
  const text = removeAccents(String(value ?? '').replace(/\s+/g, ' ').trim());
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function formatPdfDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CU', {
    timeZone: BUSINESS_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function sourceChannelLabel(value) {
  return {
    GOOGLE_FORM: 'Formulario en linea',
    OFFLINE_JSON: 'Offline con JSON',
    OFFLINE_MANUAL: 'Offline manual',
  }[value] || value || 'Sin origen';
}

function statusLabelForPdf(value) {
  return {
    NORMALIZED: 'Normalizada',
    WITH_ISSUES: 'Con incidencias',
    REJECTED: 'Rechazada',
    READY_FOR_TECHNICAL_REVIEW: 'Lista para revision tecnica',
    BLOCKED_BY_MISSING_REQUIREMENTS: 'Bloqueada por requisitos',
    REQUIRES_MANUAL_REVIEW: 'Requiere revision manual',
    NOT_STARTED: 'No iniciada',
    IN_PROGRESS: 'En curso',
    COMPLETED: 'Completada',
    NEEDS_REVIEW: 'Necesita revision',
    PENDING_TECHNICAL_VALIDATION: 'Pendiente de validacion tecnica',
    VALIDATED_BY_TECHNICAL_TEAM: 'Validada por Equipo Tecnico',
    IN_TECHNICAL_REVIEW: 'En revision tecnica',
    REQUIRES_SCORE_ADJUSTMENT: 'Requiere ajuste de puntuacion',
    NOT_PROPOSED: 'No propuesta',
    PROPOSED: 'Propuesta',
    RESERVE: 'Reserva',
    REMOVED: 'Retirada de propuesta',
    SIN_EVALUAR: 'Sin evaluar',
  }[value] || value || 'Sin estado';
}

function proposalStatusLabel(value) {
  return statusLabelForPdf(value || 'NOT_PROPOSED');
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
    'total_score',
    'evaluation_validation_status',
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
    'total_score',
    'evaluation_validation_status',
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

function preliminaryRankingCsv(rows) {
  const headers = [
    'preliminary_position',
    'included_in_preliminary_ranking',
    'total_score',
    'full_name',
    'email',
    'province',
    'municipality',
    'municipality_raw',
    'municipality_normalization_status',
    'institution',
    'institution_type',
    'gender',
    'age_range',
    'received_date',
    'ranking_cutoff_date',
    'received_after_cutoff',
    'source_channel',
    'eligibility_status',
    'evaluation_status',
    'evaluation_validation_status',
    'proposal_status',
    'proposal_note',
    'open_issue_count',
    'exclusion_reason',
    'submission_id',
    'candidate_id',
    'evaluation_result_id',
  ];
  return rowsCsv(headers, rows);
}

function selectionPolicyCsv(rows) {
  const headers = [
    'province_policy_position',
    'preliminary_position',
    'policy_recommendation',
    'policy_recommendation_label',
    'score_band',
    'policy_alerts',
    'total_score',
    'full_name',
    'email',
    'region',
    'province',
    'municipality',
    'municipality_raw',
    'municipality_normalization_status',
    'institution',
    'institution_type',
    'gender',
    'age_range',
    'received_date',
    'ranking_cutoff_date',
    'received_after_cutoff',
    'proposal_status',
    'included_in_preliminary_ranking',
    'exclusion_reason',
    'submission_id',
    'candidate_id',
    'evaluation_result_id',
  ];
  const expandedRows = rows.map(row => ({
    ...row,
    score_band: row.score_band?.label || '',
    policy_alerts: (row.policy_alerts || []).join(' | '),
  }));
  return rowsCsv(headers, expandedRows);
}

function selectionPolicyExcel(analysis) {
  const rows = analysis.rows || [];
  const additionalRows = rows.filter(row => row.received_after_cutoff);
  const summaryRows = [
    { metric: 'Corte operativo', value: analysis.summary?.cutoff_date || OPERATIONAL_RANKING_CUTOFF_DATE },
    { metric: 'Total visible en sistema', value: rows.length },
    { metric: 'Ranking principal', value: rows.length - additionalRows.length },
    { metric: 'Valoracion adicional fuera de corte', value: additionalRows.length },
    { metric: 'Elegibles para politica provincial', value: analysis.summary?.eligible_for_policy || 0 },
    { metric: 'Propuesta sugerida', value: analysis.summary?.recommended_proposed || 0 },
    { metric: 'Reserva sugerida', value: analysis.summary?.recommended_reserve || 0 },
  ];
  const provinceSummary = (analysis.summary?.provinces || []).map(row => ({
    province: row.province,
    quota: row.quota,
    eligible: row.eligible,
    recommended_proposed: row.recommended_proposed,
    recommended_reserve: row.recommended_reserve,
    after_cutoff: row.after_cutoff,
    incomplete_reason: row.incomplete_reason,
    manually_proposed: row.manually_proposed,
    manually_reserve: row.manually_reserve,
  }));
  const sheets = [
    excelSheet('Resumen', summaryRows),
    excelSheet('Resumen provincias', provinceSummary),
  ];
  const byProvince = groupBy(rows, row => normalizedPolicyValue(row.province, 'Sin provincia'));
  for (const [province, provinceRows] of Array.from(byProvince.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const provinceWorkbookRows = provinceRowsForWorkbook(provinceRows);
    sheets.push(excelSheet(`Prov ${province}`, provinceWorkbookRows.map(selectionDecisionExcelRow)));
  }
  return excelWorkbook(sheets);
}

function provinceRowsForWorkbook(provinceRows) {
  return provinceRows
    .filter(row =>
      row.policy_recommendation === 'POLICY_PROPOSED' ||
      row.policy_recommendation === 'POLICY_RESERVE' ||
      row.received_after_cutoff
    )
    .sort(selectionWorkbookSort);
}

function selectionDecisionExcelRow(row) {
  return {
    technical_decision: '',
    technical_observation: '',
    category: selectionCategory(row),
    province_policy_position: row.province_policy_position || '',
    total_score: row.total_score ?? '',
    full_name: row.full_name || '',
    province: row.province || '',
    municipality: row.municipality || '',
    institution: row.institution || '',
    institution_type: row.institution_type || '',
    gender: row.gender || '',
    age_range: row.age_range || '',
    received_date: row.received_date || '',
    cutoff: row.received_after_cutoff ? 'Fuera de corte' : 'Principal',
    reason: row.exclusion_reason || '',
    alerts: (row.policy_alerts || []).join(' | '),
    email: row.email || '',
  };
}

function selectionCategory(row) {
  if (row.received_after_cutoff) return 'Valoracion adicional fuera de corte';
  if (row.policy_recommendation === 'POLICY_PROPOSED') return 'Propuesta sugerida';
  if (row.policy_recommendation === 'POLICY_RESERVE') return 'Reserva sugerida';
  if (row.included_in_preliminary_ranking) return 'Elegible pendiente de politica';
  return 'No elegible para propuesta';
}

function selectionWorkbookSort(a, b) {
  const categoryOrder = selectionCategoryOrder(a) - selectionCategoryOrder(b);
  if (categoryOrder !== 0) return categoryOrder;
  const provincePositionA = Number(a.province_policy_position || Number.MAX_SAFE_INTEGER);
  const provincePositionB = Number(b.province_policy_position || Number.MAX_SAFE_INTEGER);
  if (provincePositionA !== provincePositionB) return provincePositionA - provincePositionB;
  return preliminaryRankingSort(a, b);
}

function selectionCategoryOrder(row) {
  if (row.policy_recommendation === 'POLICY_PROPOSED') return 1;
  if (row.policy_recommendation === 'POLICY_RESERVE') return 2;
  if (row.included_in_preliminary_ranking) return 3;
  if (row.received_after_cutoff) return 5;
  return 4;
}

function regionForProvince(rows, province) {
  const found = rows.find(row => normalizedPolicyValue(row.province, 'Sin provincia') === province && row.region);
  return found?.region || '';
}

function excelWorkbook(sheets) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#17324D" ss:Pattern="Solid"/></Style>
  <Style ss:ID="text"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>
  <Style ss:ID="number"><NumberFormat ss:Format="0.00"/></Style>
 </Styles>
 ${sheets.join('\n')}
</Workbook>`;
}

function excelSheet(title, rows) {
  const headers = Array.from(rows.reduce((set, row) => {
    Object.keys(row).forEach(key => set.add(key));
    return set;
  }, new Set()));
  return `<Worksheet ss:Name="${xmlEscape(excelSheetName(title))}">
  <Table>
    ${headers.length ? `<Row>${headers.map(header => `<Cell ss:StyleID="header"><Data ss:Type="String">${xmlEscape(excelHeaderLabel(header))}</Data></Cell>`).join('')}</Row>` : ''}
    ${rows.length ? rows.map(row => `<Row>${headers.map(header => excelCell(row[header])).join('')}</Row>`).join('\n') : '<Row><Cell><Data ss:Type="String">Sin datos.</Data></Cell></Row>'}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
    <FreezePanes/>
    <FrozenNoSplit/>
    <SplitHorizontal>1</SplitHorizontal>
    <TopRowBottomPane>1</TopRowBottomPane>
  </WorksheetOptions>
</Worksheet>`;
}

function excelCell(value) {
  if (value !== '' && value !== null && value !== undefined && typeof value !== 'boolean' && Number.isFinite(Number(value))) {
    return `<Cell ss:StyleID="number"><Data ss:Type="Number">${Number(value)}</Data></Cell>`;
  }
  return `<Cell ss:StyleID="text"><Data ss:Type="String">${xmlEscape(value)}</Data></Cell>`;
}

function excelSheetName(value) {
  return String(value || 'Hoja')
    .replace(/[\\/?*[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 31) || 'Hoja';
}

function excelHeaderLabel(value) {
  return {
    technical_decision: 'Decision ET',
    technical_observation: 'Observacion ET',
    category: 'Categoria',
    metric: 'Indicador',
    value: 'Valor',
    region: 'Region',
    province: 'Provincia',
    quota: 'Cupo',
    eligible: 'Elegibles',
    recommended_proposed: 'Propuesta sugerida',
    recommended_reserve: 'Reserva sugerida',
    after_cutoff: 'Fuera de termino',
    incomplete_reason: 'Motivo si no completa cupo',
    manually_proposed: 'Propuesta manual',
    manually_reserve: 'Reserva manual',
    province_policy_position: 'Posicion provincial',
    preliminary_position: 'Posicion general',
    policy_recommendation: 'Recomendacion',
    score_band: 'Rango',
    total_score: 'Puntaje',
    full_name: 'Postulante',
    email: 'Correo',
    municipality: 'Municipio',
    municipality_raw: 'Municipio original',
    municipality_normalization_status: 'Normalizacion municipio',
    institution: 'Institucion',
    institution_type: 'Tipo institucion',
    gender: 'Genero',
    age_range: 'Edad',
    source_channel: 'Origen',
    received_date: 'Fecha recepcion',
    cutoff: 'Corte',
    validation_status: 'Validacion tecnica',
    proposal_status: 'Estado propuesta',
    alerts: 'Alertas',
    reason: 'Motivo',
  }[value] || value;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
