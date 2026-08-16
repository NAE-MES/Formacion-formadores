const { canonicalJson, hash } = require('./ingestion');

function assessEligibility(input, eligibilityConfig, options = {}) {
  const candidate = input.candidate || {};
  const submission = input.submission || {};
  const responses = input.responses || {};
  const documents = input.documents || [];
  const checkResults = (eligibilityConfig.checks || []).map(check =>
    runEligibilityCheck(check, responses, documents)
  );

  const hasBlockingFail = checkResults.some(result =>
    result.status === 'FAIL' && result.severity === 'BLOCKING'
  );
  const hasManualReviewFail = checkResults.some(result =>
    result.status === 'FAIL' && result.severity === 'MANUAL_REVIEW'
  );
  const statuses = eligibilityConfig.statuses || {};
  const status = hasBlockingFail
    ? (statuses.blocked || 'BLOCKED_BY_MISSING_REQUIREMENTS')
    : hasManualReviewFail
      ? (statuses.requires_review || 'REQUIRES_MANUAL_REVIEW')
      : (statuses.ready || 'READY_FOR_TECHNICAL_REVIEW');
  const ruleVersion = eligibilityConfig.schema_version || '';

  return {
    eligibility_assessment_id: `elig_${hash(`eligibility|${submission.submission_id}|${ruleVersion}`)}`,
    candidate_id: candidate.candidate_id,
    submission_id: submission.submission_id,
    assessment_scope: eligibilityConfig.assessment_scope || 'PRELIMINARY_OPERATIONAL_READINESS',
    rule_version: ruleVersion,
    status,
    check_results: checkResults,
    assessed_at: options.assessedAt || new Date().toISOString(),
    assessed_by: options.actor || 'ELIGIBILITY_ASSESSOR',
    manual_status: '',
    manual_note: '',
    reviewed_at: null,
    reviewed_by: '',
  };
}

function runEligibilityCheck(check, responses, documents) {
  let pass = false;
  let observed = null;

  if (check.type === 'FIELD_EQUALS') {
    observed = responses[check.field_code];
    pass = normalizeIdentity(observed) === normalizeIdentity(check.expected);
  } else if (check.type === 'FIELD_NOT_EQUALS') {
    observed = responses[check.field_code];
    pass = hasValue(observed) && normalizeIdentity(observed) !== normalizeIdentity(check.not_expected);
  } else if (check.type === 'DOCUMENT_PRESENT') {
    const acceptedStatuses = check.accepted_statuses || ['RECEIVED'];
    const document = documents.find(item =>
      item.document_type === check.document_type && acceptedStatuses.includes(item.status)
    );
    observed = document ? {
      document_type: document.document_type,
      status: document.status,
    } : null;
    pass = !!document;
  } else {
    observed = `Unsupported check type: ${check.type}`;
  }

  return {
    check_id: check.check_id,
    type: check.type,
    severity: check.severity || 'BLOCKING',
    status: pass ? 'PASS' : 'FAIL',
    field_code: check.field_code || '',
    document_type: check.document_type || '',
    observed,
    expected: check.expected || check.not_expected || check.document_type || '',
    description: check.description || '',
  };
}

function normalizeIdentity(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function hasValue(value) {
  return Array.isArray(value)
    ? value.length > 0
    : String(value ?? '').trim() !== '';
}

function canonicalAssessmentSignature(assessment) {
  return canonicalJson({
    submission_id: assessment.submission_id,
    rule_version: assessment.rule_version,
    check_results: assessment.check_results,
  });
}

module.exports = {
  assessEligibility,
  runEligibilityCheck,
  canonicalAssessmentSignature,
};
