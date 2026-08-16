const crypto = require('node:crypto');

const EVALUATION_STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_REVIEW']);

function criteriaFromConfig(evaluationConfig = {}) {
  return (evaluationConfig.criteria || []).map(criterion => ({
    criterion_id: criterion.criterion_id,
    label: criterion.label,
    weight_percent: criterion.weight_percent,
    source: criterion.source || '',
  }));
}

function buildCriterionEvaluation({ submission, criterion, payload, actor }) {
  validateCriterion(criterion);
  const status = String(payload.status || 'IN_PROGRESS').trim();
  validateEvaluationStatus(status);
  const score = normalizeScore(payload.score);
  const now = new Date().toISOString();

  return {
    criterion_evaluation_id: `ce_${hash(`criterion-evaluation|${submission.submission_id}|${criterion.criterion_id}`)}`,
    candidate_id: submission.candidate_id,
    submission_id: submission.submission_id,
    criterion_id: criterion.criterion_id,
    criterion_label: criterion.label,
    weight_percent: criterion.weight_percent,
    score,
    status,
    evidence_summary: String(payload.evidence_summary || '').trim(),
    evaluator_note: String(payload.evaluator_note || '').trim(),
    evaluated_at: now,
    evaluated_by: actor || 'ADMIN_UI',
  };
}

function summarizeEvaluation(submission, evaluations, evaluationConfig = {}, actor = 'SYSTEM') {
  const criteria = criteriaFromConfig(evaluationConfig);
  const totalCriteria = criteria.length;
  const completedCriteria = evaluations.filter(item => item.status === 'COMPLETED').length;
  const needsReview = evaluations.some(item => item.status === 'NEEDS_REVIEW');
  const status = needsReview
    ? 'NEEDS_REVIEW'
    : completedCriteria === 0
      ? 'NOT_STARTED'
      : completedCriteria === totalCriteria
        ? 'COMPLETED'
        : 'IN_PROGRESS';

  return {
    evaluation_result_id: `er_${hash(`evaluation-result|${submission.submission_id}|${evaluationConfig.schema_version || ''}`)}`,
    candidate_id: submission.candidate_id,
    submission_id: submission.submission_id,
    status,
    completed_criteria: completedCriteria,
    total_criteria: totalCriteria,
    calculated_at: new Date().toISOString(),
    calculated_by: actor,
    notes: 'Resumen operativo sin cálculo automático de ranking.',
  };
}

function validateEvaluationStatus(status) {
  if (!EVALUATION_STATUSES.has(status)) {
    const error = new Error('Invalid evaluation status.');
    error.statusCode = 400;
    error.code = 'INVALID_EVALUATION_STATUS';
    throw error;
  }
}

function criterionById(evaluationConfig, criterionId) {
  return criteriaFromConfig(evaluationConfig).find(item => item.criterion_id === criterionId) || null;
}

function normalizeScore(value) {
  if (value === undefined || value === null || value === '') return null;
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    const error = new Error('Evaluation score must be a number between 0 and 100.');
    error.statusCode = 400;
    error.code = 'INVALID_EVALUATION_SCORE';
    throw error;
  }
  return score;
}

function validateCriterion(criterion) {
  if (!criterion || !criterion.criterion_id) {
    const error = new Error('Evaluation criterion not found.');
    error.statusCode = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

module.exports = {
  buildCriterionEvaluation,
  criterionById,
  criteriaFromConfig,
  summarizeEvaluation,
  validateEvaluationStatus,
};
