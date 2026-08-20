const crypto = require('node:crypto');

const EVALUATION_STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NEEDS_REVIEW']);
const EVALUATION_VALIDATION_STATUSES = new Set([
  'PENDING_TECHNICAL_VALIDATION',
  'VALIDATED_BY_TECHNICAL_TEAM',
  'IN_TECHNICAL_REVIEW',
  'REQUIRES_SCORE_ADJUSTMENT',
]);

function criteriaFromConfig(evaluationConfig = {}) {
  return (evaluationConfig.criteria || []).map(criterion => ({
    criterion_id: criterion.criterion_id,
    label: criterion.label,
    weight_percent: criterion.weight_percent,
    source: criterion.source || '',
    attributes: criterion.attributes || [],
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

  const weightedScores = evaluations
    .filter(item => item.status === 'COMPLETED' && item.score !== null && item.score !== undefined)
    .map(item => Number(item.score) * Number(item.weight_percent || 0) / 100);
  const totalScore = completedCriteria === totalCriteria
    ? round2(weightedScores.reduce((sum, value) => sum + value, 0))
    : null;

  return {
    evaluation_result_id: `er_${hash(`evaluation-result|${submission.submission_id}|${evaluationConfig.schema_version || ''}`)}`,
    candidate_id: submission.candidate_id,
    submission_id: submission.submission_id,
    status,
    completed_criteria: completedCriteria,
    total_criteria: totalCriteria,
    total_score: totalScore,
    rule_version: evaluationConfig.schema_version || '',
    calculation_method: 'CRITERION_WEIGHTED_AVERAGE',
    validation_status: 'PENDING_TECHNICAL_VALIDATION',
    validation_note: '',
    validated_at: null,
    validated_by: '',
    calculated_at: new Date().toISOString(),
    calculated_by: actor,
    notes: totalScore === null
      ? 'Resumen operativo sin ranking. Puntaje total pendiente hasta completar criterios.'
      : 'Puntaje tecnico automatico segun Anexo 1. No representa ranking ni decision final.',
  };
}

function validateEvaluationValidationStatus(status) {
  if (!EVALUATION_VALIDATION_STATUSES.has(status)) {
    const error = new Error('Invalid technical validation status.');
    error.statusCode = 400;
    error.code = 'INVALID_EVALUATION_VALIDATION_STATUS';
    throw error;
  }
}

function buildAutomaticCriterionEvaluations(input, evaluationConfig = {}, actor = 'AUTO_SCORING_ENGINE') {
  const submission = input.submission || {};
  const responses = input.responses || {};
  return criteriaFromConfig(evaluationConfig).map(criterion => {
    const attributeResults = (criterion.attributes || []).map(attribute => evaluateAttribute(attribute, responses));
    const hasIssue = attributeResults.some(item => item.status !== 'SCORED');
    const score = hasIssue
      ? null
      : round2(attributeResults.reduce((sum, item) => (
        sum + (Number(item.attribute_score || 0) / 10) * Number(item.weight_percent || 0)
      ), 0));
    const status = hasIssue ? 'NEEDS_REVIEW' : 'COMPLETED';
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
      evidence_summary: automaticEvidenceSummary(attributeResults),
      evaluator_note: JSON.stringify({
        rule_version: evaluationConfig.schema_version || '',
        calculation_method: 'ANEXO_1_CLOSED_RESPONSE_ATTRIBUTE_SCORING',
        attributes: attributeResults,
      }),
      evaluated_at: now,
      evaluated_by: actor,
    };
  });
}

function evaluateAttribute(attribute, responses) {
  const rawValue = responses[attribute.field_code];
  const normalizedValue = Array.isArray(rawValue) ? rawValue.join('; ') : String(rawValue ?? '').trim();
  const optionScores = attribute.option_scores || {};
  if (!normalizedValue) {
    return {
      attribute_id: attribute.attribute_id,
      label: attribute.label,
      field_code: attribute.field_code,
      weight_percent: attribute.weight_percent,
      raw_value: rawValue ?? null,
      normalized_value: normalizedValue,
      attribute_score: null,
      status: 'MISSING_VALUE',
      message: 'No hay valor para puntuar automaticamente.',
    };
  }
  if (!Object.prototype.hasOwnProperty.call(optionScores, normalizedValue)) {
    return {
      attribute_id: attribute.attribute_id,
      label: attribute.label,
      field_code: attribute.field_code,
      weight_percent: attribute.weight_percent,
      raw_value: rawValue,
      normalized_value: normalizedValue,
      attribute_score: null,
      status: 'UNKNOWN_OPTION',
      message: 'La respuesta no coincide con una opcion puntuable del Anexo 1.',
    };
  }
  return {
    attribute_id: attribute.attribute_id,
    label: attribute.label,
    field_code: attribute.field_code,
    weight_percent: attribute.weight_percent,
    raw_value: rawValue,
    normalized_value: normalizedValue,
    attribute_score: Number(optionScores[normalizedValue]),
    status: 'SCORED',
    message: '',
  };
}

function automaticEvidenceSummary(attributeResults) {
  return attributeResults.map(item => (
    `${item.label}: ${item.attribute_score === null ? 'requiere revision' : `${item.attribute_score}/10`}`
  )).join('; ');
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

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
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
  buildAutomaticCriterionEvaluations,
  buildCriterionEvaluation,
  criterionById,
  criteriaFromConfig,
  summarizeEvaluation,
  validateEvaluationValidationStatus,
  validateEvaluationStatus,
};
